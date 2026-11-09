import { supabase } from '../../../lib/supabase'

export const AUDIT_PAGE_SIZE = 50

// Newest first. `action` is one of created / updated / deactivated /
// reactivated / deleted, or '' for all. `search` matches the person who was
// changed and the person who changed them, by name or email.
export async function fetchProfileAuditLog({ page = 0, action = '', search = '' } = {}) {
  let q = supabase
    .from('profile_audit_log')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(page * AUDIT_PAGE_SIZE, (page + 1) * AUDIT_PAGE_SIZE - 1)

  if (action) q = q.eq('action', action)

  // Commas and brackets would break the .or() filter syntax.
  const term = search.replace(/[,()%*]/g, ' ').trim()
  if (term) {
    q = q.or(
      `profile_name.ilike.%${term}%,profile_email.ilike.%${term}%,actor_name.ilike.%${term}%,actor_email.ilike.%${term}%`
    )
  }

  const { data, error, count } = await q
  if (error) throw error
  return { data: data || [], count: count ?? 0, page, pageSize: AUDIT_PAGE_SIZE }
}
