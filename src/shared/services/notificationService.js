import { supabase } from '../../lib/supabase'
import { pushNotifications } from './pushService'

// Saves the in-app copies, then asks the server to push them to any devices
// that turned pop-up alerts on.
async function insertAndPush(rows) {
  const { data, error } = await supabase.from('notifications').insert(rows).select('id')
  if (error) throw error
  pushNotifications((data || []).map(r => r.id))
}

export async function notifyAdmins({ title, body, link }) {
  const { data: admins, error: adminErr } = await supabase
    .from('profiles')
    .select('id')
    .eq('role', 'admin')
    .eq('is_active', true)
  if (adminErr) throw adminErr
  if (!admins || admins.length === 0) return

  await insertAndPush(admins.map(a => ({ user_id: a.id, title, body, link })))
}

export async function notifyUser(userId, { title, body, link }) {
  if (!userId) return
  await insertAndPush([{ user_id: userId, title, body, link }])
}

export async function fetchMyNotifications(profileId, limit = 30) {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', profileId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data || []
}

export async function fetchUnreadCount(profileId) {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', profileId)
    .eq('is_read', false)
  if (error) throw error
  return count || 0
}

export async function markNotificationRead(id) {
  const { error } = await supabase.from('notifications').update({ is_read: true }).eq('id', id)
  if (error) throw error
}

export async function markAllNotificationsRead(profileId) {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', profileId)
    .eq('is_read', false)
  if (error) throw error
}
