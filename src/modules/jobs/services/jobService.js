import { supabase } from '../../../lib/supabase'
import { getMyCompanyId, getCurrentProfile } from '../../../services/authService'
import { logActivity } from '../../../shared/services/activityService'
import { notifyAdmins } from '../../../shared/services/notificationService'
import { archiveRecord } from '../../../shared/services/archiveService'

const PAGE_SIZE = 50
const PHOTO_BUCKET = 'job-photos'
const DOCUMENT_BUCKET = 'job-documents'

export async function fetchJobs(statusFilter, page = 0, search = '') {
  let query = supabase
    .from('jobs')
    .select('*, customers(customer_name)', { count: 'exact' })
    .is('archived_at', null)
    .order('created_at', { ascending: false })
    .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

  if (search) {
    query = query.or(`title.ilike.%${search}%,job_ref.ilike.%${search}%,site_address.ilike.%${search}%`)
  }

  if (statusFilter === 'active') {
    query = query.not('status', 'in', '(cancelled,invoiced,completed)')
  } else if (statusFilter === 'overdue') {
    query = query
      .not('status', 'in', '(cancelled,invoiced,completed)')
      .not('complete_by', 'is', null)
      .lt('complete_by', new Date().toISOString().slice(0, 10))
  } else if (statusFilter === 'action_required') {
    query = query.or('status.eq.on_hold,and(status.in.(new,assigned),scheduled_for.is.null)')
  } else if (statusFilter) {
    query = query.eq('status', statusFilter)
  }

  const { data, error, count } = await query
  if (error) throw error
  return { data, count, page, pageSize: PAGE_SIZE }
}

export async function fetchJob(id) {
  const { data, error } = await supabase
    .from('jobs')
    .select('*, customers(customer_name)')
    .eq('id', id)
    .is('archived_at', null)
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error('Job not found.')
  return data
}

export async function createJob(job) {
  const { data, error } = await supabase
    .from('jobs')
    .insert([job])
    .select()

  if (error) throw error

  const created = data?.[0]
  if (created) {
    await logActivity(created.id, 'job_created', `Job created${created.job_ref ? ` (${created.job_ref})` : ''}`).catch(() => {})
  }
  return created
}

export async function updateJob(id, updates, activityNote) {
  const { data, error } = await supabase
    .from('jobs')
    .update(updates)
    .eq('id', id)
    .select()

  if (error) throw error
  if (!data || data.length === 0) throw new Error('Update failed — no rows were changed. Check your permissions.')

  if (activityNote) {
    await logActivity(id, 'job_updated', activityNote).catch(() => {})
  }
}

// Jobs are never hard-deleted — they're archived (snapshotted + hidden) so
// jobs with invoices attached don't hit invoices_job_id_fkey, and every
// deletion leaves an audit trail of who did it and when.
export async function deleteJob(id) {
  const { data: job, error: fetchErr } = await supabase
    .from('jobs')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (fetchErr) throw fetchErr
  if (!job) throw new Error('Job not found.')

  const profile = await getCurrentProfile().catch(() => null)

  const { error } = await supabase
    .from('jobs')
    .update({ archived_at: new Date().toISOString(), archived_by: profile?.id || null })
    .eq('id', id)
  if (error) throw error

  await archiveRecord('job', id, job.job_ref || job.title, job, 'Deleted from Jobs')
  await logActivity(id, 'job_deleted', `Deleted by ${profile?.full_name || 'admin'}`).catch(() => {})
}

// Technician-side completion — marks the job ready for admin sign-off,
// NOT fully completed yet. Admin must confirmJobComplete() to finalize.
export async function completeJob(id, { completion_notes, materials_used, sign_off_name, sign_off_signature, sign_off_customer_name, payment_type }) {
  await updateJob(id, {
    status: 'pending_confirmation',
    completion_notes: completion_notes || null,
    materials_used:   materials_used || null,
    sign_off_name,
    sign_off_signature: sign_off_signature || null,
    sign_off_customer_name: sign_off_customer_name || null,
    payment_type: payment_type || null,
    completed_at: new Date().toISOString(),
  })

  const profile = await getCurrentProfile().catch(() => null)
  await logActivity(id, 'job_completed_by_technician', `Marked complete by ${profile?.full_name || 'technician'}, signed off by ${sign_off_name}`).catch(() => {})

  const job = await fetchJob(id).catch(() => null)
  await notifyAdmins({
    title: 'Job ready for sign-off',
    body: `${profile?.full_name || 'A technician'} completed "${job?.title || job?.job_ref || 'a job'}" — awaiting your confirmation.`,
    link: `/jobs/${id}`,
  }).catch(() => {})
}

// Admin-side final confirmation — the job only counts as officially
// completed (and becomes invoiceable) once an admin confirms it.
export async function confirmJobComplete(id) {
  const profile = await getCurrentProfile().catch(() => null)
  await updateJob(id, {
    status: 'completed',
    confirmed_at: new Date().toISOString(),
    confirmed_by: profile?.id || null,
  })
  await logActivity(id, 'job_confirmed_complete', `Confirmed complete by ${profile?.full_name || 'admin'}`).catch(() => {})
}

export async function fetchJobItems(jobId) {
  const { data, error } = await supabase
    .from('job_items')
    .select('*')
    .eq('job_id', jobId)
    .order('sort_order')

  if (error) throw error
  return data || []
}

export async function updateJobItems(jobId, items) {
  const { error: delError } = await supabase.from('job_items').delete().eq('job_id', jobId)
  if (delError) throw delError

  if (items.length > 0) {
    const rows = items.map((it, i) => ({
      job_id: jobId,
      item_id: it.item_id || null,
      sort_order: i,
      description: it.description,
      quantity: it.quantity,
      unit: it.unit,
      unit_price: it.unit_price,
      tax_rate: it.tax_rate,
      line_total: Math.round((Number(it.quantity) || 0) * (Number(it.unit_price) || 0) * 100) / 100,
    }))
    const { error: itemsError } = await supabase.from('job_items').insert(rows)
    if (itemsError) throw itemsError
  }
}

export async function fetchJobPhotos(jobId) {
  const { data, error } = await supabase
    .from('job_photos')
    .select('*, profiles(full_name, role)')
    .eq('job_id', jobId)
    .order('created_at', { ascending: false })

  if (error) throw error

  return Promise.all(
    data.map(async photo => {
      const { data: signed } = await supabase
        .storage
        .from(PHOTO_BUCKET)
        .createSignedUrl(photo.storage_path, 3600)
      return { ...photo, url: signed?.signedUrl || null }
    })
  )
}

export async function uploadJobPhoto(jobId, file, stage = 'before') {
  const companyId = await getMyCompanyId()
  const profile = await getCurrentProfile()
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const storagePath = `${companyId}/${jobId}/${Date.now()}_${safeName}`

  const { error: uploadError } = await supabase
    .storage
    .from(PHOTO_BUCKET)
    .upload(storagePath, file)

  if (uploadError) throw uploadError

  const { error: insertError } = await supabase
    .from('job_photos')
    .insert([{
      job_id: jobId,
      storage_path: storagePath,
      file_name: file.name,
      uploaded_by: profile?.id || null,
      stage,
    }])

  if (insertError) throw insertError

  await logActivity(jobId, 'photo_uploaded', `${profile?.full_name || 'Someone'} uploaded a photo (${file.name})`).catch(() => {})
}

export async function deleteJobPhoto(photo) {
  await supabase.storage.from(PHOTO_BUCKET).remove([photo.storage_path])
  const { error } = await supabase.from('job_photos').delete().eq('id', photo.id)
  if (error) throw error

  const profile = await getCurrentProfile().catch(() => null)
  await logActivity(photo.job_id, 'photo_deleted', `${profile?.full_name || 'Someone'} deleted a photo (${photo.file_name})`).catch(() => {})
}

export async function fetchJobDocuments(jobId) {
  const { data, error } = await supabase
    .from('job_documents')
    .select('*, profiles(full_name, role)')
    .eq('job_id', jobId)
    .order('created_at', { ascending: false })

  if (error) throw error

  return Promise.all(
    data.map(async doc => {
      const { data: signed } = await supabase
        .storage
        .from(DOCUMENT_BUCKET)
        .createSignedUrl(doc.storage_path, 3600)
      return { ...doc, url: signed?.signedUrl || null }
    })
  )
}

export async function uploadJobDocument(jobId, file) {
  const companyId = await getMyCompanyId()
  const profile = await getCurrentProfile()
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const storagePath = `${companyId}/${jobId}/${Date.now()}_${safeName}`

  const { error: uploadError } = await supabase
    .storage
    .from(DOCUMENT_BUCKET)
    .upload(storagePath, file)

  if (uploadError) throw uploadError

  const { error: insertError } = await supabase
    .from('job_documents')
    .insert([{
      job_id: jobId,
      storage_path: storagePath,
      file_name: file.name,
      file_size: file.size,
      mime_type: file.type || null,
      uploaded_by: profile?.id || null,
    }])

  if (insertError) throw insertError

  await logActivity(jobId, 'document_uploaded', `${profile?.full_name || 'Someone'} uploaded a document (${file.name})`).catch(() => {})
}

export async function deleteJobDocument(doc) {
  await supabase.storage.from(DOCUMENT_BUCKET).remove([doc.storage_path])
  const { error } = await supabase.from('job_documents').delete().eq('id', doc.id)
  if (error) throw error

  const profile = await getCurrentProfile().catch(() => null)
  await logActivity(doc.job_id, 'document_deleted', `${profile?.full_name || 'Someone'} deleted a document (${doc.file_name})`).catch(() => {})
}
