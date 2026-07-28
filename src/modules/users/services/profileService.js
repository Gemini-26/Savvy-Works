import { supabase } from '../../../lib/supabase'
import { getCurrentProfile } from '../../../services/authService'
import { notifyAdmins, notifyUser } from '../../../shared/services/notificationService'

const PAGE_SIZE = 50

export async function callCreateUser({ email, password, full_name, role, phone, color }) {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token) throw new Error('Not logged in')

  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ email, password, full_name, role, phone, color }),
    }
  )
  let json = {}
  try { json = await res.json() } catch (_) { /* non-JSON body */ }
  if (!res.ok) {
    const msg = json.error || json.message || `Server error ${res.status}`
    throw new Error(msg)
  }
  return json
}

export async function callChangePassword({ profileId, newPassword }) {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token) throw new Error('Not logged in')

  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/change-password`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ profileId, newPassword }),
    }
  )
  let json = {}
  try { json = await res.json() } catch (_) { /* non-JSON body */ }
  if (!res.ok) {
    const msg = json.error || json.message || `Server error ${res.status}`
    throw new Error(msg)
  }
  return json
}

export async function requestPasswordChange(profileId) {
  const { error } = await supabase
    .from('password_change_requests')
    .insert({ profile_id: profileId })
  if (error) throw error

  const profile = await getCurrentProfile().catch(() => null)
  await notifyAdmins({
    title: 'Password change requested',
    body: `${profile?.full_name || 'A user'} requested a password change.`,
    link: `/users/${profileId}`,
  }).catch(() => {})
}

export async function fetchPendingPasswordRequest(profileId) {
  const { data, error } = await supabase
    .from('password_change_requests')
    .select('*')
    .eq('profile_id', profileId)
    .eq('status', 'pending')
    .order('requested_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data
}

// Admin declines a pending request without changing the password.
export async function denyPasswordRequest(requestId, profileId) {
  const admin = await getCurrentProfile().catch(() => null)
  const { error } = await supabase
    .from('password_change_requests')
    .update({ status: 'dismissed', resolved_by: admin?.id || null, resolved_at: new Date().toISOString() })
    .eq('id', requestId)
  if (error) throw error

  await notifyUser(profileId, {
    title: 'Password change request denied',
    body: `${admin?.full_name || 'An admin'} denied your password change request.`,
    link: '/profile',
  }).catch(() => {})
}

export async function fetchProfiles(activeOnly = true, page = 0, search = '') {
  let q = supabase
    .from('profiles')
    .select('*', { count: 'exact' })
    .order('full_name')
    .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

  if (search) {
    q = q.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`)
  }

  if (activeOnly) q = q.eq('is_active', true)

  const { data, error, count } = await q
  if (error) throw error
  return { data, count, page, pageSize: PAGE_SIZE }
}

export async function fetchProfile(id) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error('Profile not found.')
  return data
}

export async function createProfile(profile) {
  const { error } = await supabase.from('profiles').insert([profile])
  if (error) throw error
}

export async function updateProfile(id, updates) {
  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', id)
    .select()

  if (error) throw error
  if (!data || data.length === 0) throw new Error('Update failed — no rows changed.')
}

export async function deleteProfile(id) {
  const { error } = await supabase.from('profiles').delete().eq('id', id)
  if (error) throw error
}
