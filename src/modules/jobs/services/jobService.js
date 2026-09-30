import { supabase } from '../../../lib/supabase'
import { getMyCompanyId, getCurrentProfile } from '../../../services/authService'
import { logActivity } from '../../../shared/services/activityService'
import { notifyAdmins } from '../../../shared/services/notificationService'
import { archiveRecord } from '../../../shared/services/archiveService'
import { replaceLineItems } from '../../../shared/services/lineItemsService'
import { compressImage } from '../../../shared/utils/compressImage'
import { JOB_ASSIGNEES_SELECT, jobAssignees, jobIdsForStaff, jobIdsForStaffNamed } from '../../../shared/utils/assignees'
import { buildFilters, keywordGroups } from '../../../shared/utils/listFilters'

const PAGE_SIZE = 50
const PHOTO_BUCKET = 'job-photos'
const DOCUMENT_BUCKET = 'job-documents'

const ids = rows => [...new Set((rows ?? []).map(r => r.job_id).filter(Boolean))]

async function jobIdsForAppointmentStatuses(statuses) {
  const { data, error } = await supabase.from('appointments').select('job_id').in('status', statuses)
  if (error) throw error
  return ids(data)
}

async function jobIdsForAppointmentDates({ from, to }) {
  let q = supabase.from('appointments').select('job_id')
  if (from) q = q.gte('scheduled_start', new Date(`${from}T00:00:00`).toISOString())
  if (to) {
    const end = new Date(`${to}T00:00:00`)
    end.setDate(end.getDate() + 1)
    q = q.lt('scheduled_start', end.toISOString())
  }
  const { data, error } = await q
  if (error) throw error
  return ids(data)
}

// Everything the Keywords box and the search bar look through: every text
// field on the job, plus its customer, assigned staff, linked quote / invoice /
// PO refs, and its line items.
const JOB_KEYWORDS = {
  columns: [
    'job_ref', 'title', 'description', 'status', 'priority', 'job_type', 'payment_type', 'customer_type',
    'site_address', 'site_city', 'site_county', 'site_postcode', 'site_country', 'site_company',
    'site_contact_name', 'site_contact_email', 'site_telephone', 'site_mobile', 'site_notes',
    'contact_name', 'contact_email', 'contact_telephone', 'contact_mobile',
    'customer_ref', 'customer_job_ref', 'po_ref', 'notes', 'completion_notes', 'materials_used',
    'sign_off_name', 'sign_off_customer_name',
  ],
  related: [
    { column: 'customer_id', lookup: ['customers', ['customer_name', 'email', 'telephone', 'mobile']] },
    { column: 'id',          resolve: jobIdsForStaffNamed },
    { column: 'quote_id',    lookup: ['quotes', ['quote_ref']] },
    { column: 'id',          lookup: ['invoices', ['invoice_ref'], 'job_id'] },
    { column: 'id',          lookup: ['purchase_orders', ['po_ref', 'supplier_name'], 'job_id'] },
    { column: 'id',          lookup: ['job_items', ['description'], 'job_id'] },
  ],
}

const JOB_FILTERS = {
  jobRef:      { columns: ['job_ref'] },
  customer:    { column: 'customer_id', lookup: ['customers', ['customer_name', 'email', 'telephone', 'mobile']] },
  siteAddress: { columns: ['site_address', 'site_city', 'site_postcode', 'site_company'] },
  title:       { columns: ['title'] },
  quoteRef:    { column: 'quote_id', lookup: ['quotes', ['quote_ref']] },
  invoiceRef:  { column: 'id', lookup: ['invoices', ['invoice_ref'], 'job_id'] },
  poRef:       { column: 'id', lookup: ['purchase_orders', ['po_ref'], 'job_id'] },
  customerRef: { columns: ['customer_ref', 'customer_job_ref', 'po_ref'] },
  keywords:    { type: 'keywords', ...JOB_KEYWORDS },
  description: { columns: ['description'] },
  contact:     { columns: ['contact_name', 'contact_email', 'contact_telephone', 'contact_mobile', 'site_contact_name', 'site_telephone', 'site_mobile'] },
  signOff:     { columns: ['sign_off_name', 'sign_off_customer_name'] },
  jobType:     { column: 'job_type', type: 'multi' },
  status:      { column: 'status', type: 'multi' },
  priority:    { column: 'priority', type: 'multi' },
  paymentType: { column: 'payment_type', type: 'multi' },
  province:    { column: 'site_county', type: 'multi' },
  technician:  { column: 'id', resolve: jobIdsForStaff },
  appStatus:   { column: 'id', resolve: jobIdsForAppointmentStatuses },
  appDate:     { column: 'id', resolve: jobIdsForAppointmentDates },
  startDate:   { column: 'start_date', type: 'dateRange' },
  completeBy:  { column: 'complete_by', type: 'dateRange' },
  completedOn: { column: 'completed_at', type: 'dateRange', timestamp: true },
  created:     { column: 'created_at', type: 'dateRange', timestamp: true },
}

export async function fetchJobs(statusFilter, page = 0, search = '', filters = {}) {
  let query = supabase
    .from('jobs')
    .select(`*, customers(customer_name), ${JOB_ASSIGNEES_SELECT}`, { count: 'exact' })
    .is('archived_at', null)
    .order('created_at', { ascending: false })
    .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

  const orGroups = []
  orGroups.push(...await keywordGroups(search, JOB_KEYWORDS))

  if (statusFilter === 'active') {
    query = query.not('status', 'in', '(cancelled,invoiced,completed)')
  } else if (statusFilter === 'overdue') {
    query = query
      .not('status', 'in', '(cancelled,invoiced,completed)')
      .not('complete_by', 'is', null)
      .lt('complete_by', new Date().toISOString().slice(0, 10))
  } else if (statusFilter === 'action_required') {
    orGroups.push('status.eq.on_hold,and(status.in.(new,assigned),scheduled_for.is.null)')
  } else if (statusFilter) {
    query = query.eq('status', statusFilter)
  }

  const applyFilters = await buildFilters(JOB_FILTERS, filters)
  query = applyFilters(query, orGroups)

  const { data, error, count } = await query
  if (error) throw error
  return { data: (data ?? []).map(job => ({ ...job, assignees: jobAssignees(job) })), count, page, pageSize: PAGE_SIZE }
}

// Lightweight job lookup carrying the fields needed to raise + share an
// invoice payment link straight from the completion flow.
export async function fetchJobForPayment(id) {
  const { data, error } = await supabase
    .from('jobs')
    .select('id, customer_id, title, site_address, site_city, site_county, site_postcode, quote_id, customers(customer_name, telephone, mobile)')
    .eq('id', id)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function fetchJob(id) {
  const { data, error } = await supabase
    .from('jobs')
    .select('*, customers(customer_name), quotes!quote_id(quote_ref)')
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
// Signing a job off used to leave its visit on "On Site", so the Time
// Planner and Today's Jobs showed finished work as still in progress.
// Closes every visit on the job that has already started (scheduled up to
// now) and isn't finished or in an issue state; future visits are untouched.
const OPEN_VISIT_STATUSES = ['not_dispatched', 'awaiting', 'received', 'accepted', 'on_route', 'on_site']
async function completeStartedVisits(jobId) {
  const { error } = await supabase
    .from('appointments')
    .update({ status: 'completed' })
    .eq('job_id', jobId)
    .in('status', OPEN_VISIT_STATUSES)
    .lte('scheduled_start', new Date().toISOString())
  if (error) throw error
}

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
  // Non-fatal: the sign-off itself has saved; Today's Jobs also treats a
  // signed-off job's visits as done if this ever fails.
  await completeStartedVisits(id).catch(() => {})

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
  await completeStartedVisits(id).catch(() => {})
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
  await replaceLineItems('job_items', 'job_id', jobId, items)
}

export async function fetchJobPhotos(jobId) {
  const { data, error } = await supabase
    .from('job_photos')
    .select('*, profiles(full_name, role)')
    .eq('job_id', jobId)
    .order('created_at', { ascending: false })

  if (error) throw error

  if (!data.length) return []

  // One request for every photo's link, rather than one per photo.
  const { data: signed } = await supabase
    .storage
    .from(PHOTO_BUCKET)
    .createSignedUrls(data.map(p => p.storage_path), 3600)
  const urlByPath = new Map((signed ?? []).map(s => [s.path, s.signedUrl]))
  return data.map(photo => ({ ...photo, url: urlByPath.get(photo.storage_path) || null }))
}

// Uploads one or more photos to a job. Each photo is shrunk on the device
// first (see compressImage) and up to three go up at once. `onProgress(done,
// total)` fires as each finishes. Resolves to { uploaded, failed } so a single
// bad photo doesn't lose the rest of the batch.
export async function uploadJobPhotos(jobId, files, stage = 'before', onProgress) {
  const list = [...files]
  if (!list.length) return { uploaded: 0, failed: [] }
  const [companyId, profile] = await Promise.all([getMyCompanyId(), getCurrentProfile()])

  let done = 0
  let uploaded = 0
  const failed = []
  const queue = list.map((file, i) => ({ file, i }))

  async function worker() {
    while (queue.length) {
      const { file, i } = queue.shift()
      try {
        const small = await compressImage(file)
        const safeName = small.name.replace(/[^a-zA-Z0-9._-]/g, '_')
        const storagePath = `${companyId}/${jobId}/${Date.now()}_${i}_${safeName}`

        const { error: uploadError } = await supabase
          .storage
          .from(PHOTO_BUCKET)
          .upload(storagePath, small, { contentType: small.type || 'image/jpeg', cacheControl: '31536000' })
        if (uploadError) throw uploadError

        const { error: insertError } = await supabase
          .from('job_photos')
          .insert([{ job_id: jobId, storage_path: storagePath, file_name: file.name, uploaded_by: profile?.id || null, stage }])
        if (insertError) {
          await supabase.storage.from(PHOTO_BUCKET).remove([storagePath]).catch(() => {})
          throw insertError
        }
        uploaded += 1
      } catch (err) {
        failed.push({ file, error: err })
      } finally {
        done += 1
        onProgress?.(done, list.length)
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(3, list.length) }, worker))

  if (uploaded) {
    const what = uploaded === 1 ? `a ${stage} photo` : `${uploaded} ${stage} photos`
    await logActivity(jobId, 'photo_uploaded', `${profile?.full_name || 'Someone'} uploaded ${what}`).catch(() => {})
  }
  return { uploaded, failed }
}

export async function uploadJobPhoto(jobId, file, stage = 'before') {
  const { failed } = await uploadJobPhotos(jobId, [file], stage)
  if (failed.length) throw failed[0].error
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
