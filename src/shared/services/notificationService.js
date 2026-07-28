import { supabase } from '../../lib/supabase'

export async function notifyAdmins({ title, body, link }) {
  const { data: admins, error: adminErr } = await supabase
    .from('profiles')
    .select('id')
    .eq('role', 'admin')
    .eq('is_active', true)
  if (adminErr) throw adminErr
  if (!admins || admins.length === 0) return

  const rows = admins.map(a => ({ user_id: a.id, title, body, link }))
  const { error } = await supabase.from('notifications').insert(rows)
  if (error) throw error
}

export async function notifyUser(userId, { title, body, link }) {
  if (!userId) return
  const { error } = await supabase.from('notifications').insert([{ user_id: userId, title, body, link }])
  if (error) throw error
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
