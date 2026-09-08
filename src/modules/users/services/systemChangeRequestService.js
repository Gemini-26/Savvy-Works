import { supabase } from '../../../lib/supabase'
import { getCurrentProfile } from '../../../services/authService'
import { notifyAdmins, notifyUser } from '../../../shared/services/notificationService'

export async function requestSystemChange({ title, description }) {
  const profile = await getCurrentProfile()
  const { data, error } = await supabase
    .from('system_change_requests')
    .insert({ requested_by: profile.id, title, description: description || null })
    .select()
    .single()
  if (error) throw error

  await notifyAdmins({
    title: 'System change requested',
    body: `${profile.full_name || 'A user'} requested: ${title}`,
    link: '/settings/change-requests',
  }).catch(() => {})

  return data
}

export async function fetchSystemChangeRequests() {
  const { data, error } = await supabase
    .from('system_change_requests')
    .select('*, requested_by_profile:profiles!system_change_requests_requested_by_fkey(full_name)')
    .order('requested_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function resolveSystemChangeRequest(id, status, { requestedBy, title, resolutionNote } = {}) {
  const admin = await getCurrentProfile().catch(() => null)
  const { error } = await supabase
    .from('system_change_requests')
    .update({
      status,
      resolved_by: admin?.id || null,
      resolved_at: new Date().toISOString(),
      resolution_note: resolutionNote || null,
    })
    .eq('id', id)
  if (error) throw error

  if (requestedBy) {
    await notifyUser(requestedBy, {
      title: status === 'approved' ? 'Change request approved' : 'Change request rejected',
      body: `${admin?.full_name || 'An admin'} ${status} your request: ${title || ''}`,
      link: '/settings/change-requests',
    }).catch(() => {})
  }
}
