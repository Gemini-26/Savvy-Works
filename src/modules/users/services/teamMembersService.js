import { supabase } from '../../../lib/supabase'
import { getCurrentProfile } from '../../../services/authService'

// Team members are labourers/helpers a technician can bring on site.
// They have no login of their own and aren't fixed to a single
// technician — admin registers them once, any technician can pick
// from the pool.
export async function fetchTeamMembers(activeOnly = true) {
  let query = supabase.from('team_members').select('*').order('full_name')
  if (activeOnly) query = query.eq('is_active', true)
  const { data, error } = await query
  if (error) throw error
  return data || []
}

export async function createTeamMember({ full_name, phone, role_title }) {
  const profile = await getCurrentProfile().catch(() => null)
  const { data, error } = await supabase
    .from('team_members')
    .insert([{ full_name, phone: phone || null, role_title: role_title || null, created_by: profile?.id ?? null }])
    .select()
  if (error) throw error
  return data[0]
}

export async function setTeamMemberActive(id, is_active) {
  const { error } = await supabase.from('team_members').update({ is_active }).eq('id', id)
  if (error) throw error
}

export async function updateTeamMember(id, { full_name, phone, role_title }) {
  const { data, error } = await supabase
    .from('team_members')
    .update({ full_name, phone: phone || null, role_title: role_title || null })
    .eq('id', id)
    .select()
  if (error) throw error
  return data[0]
}

// Team members brought along for a specific on-site clock-in (one
// appointment_assignments row = one technician's clock-in for that job).
export async function fetchAssignmentTeamMembers(assignmentId) {
  const { data, error } = await supabase
    .from('assignment_team_members')
    .select('team_member_id, team_members(id, full_name, phone, role_title)')
    .eq('assignment_id', assignmentId)
  if (error) throw error
  return (data || []).map(r => r.team_members).filter(Boolean)
}

export async function setAssignmentTeamMembers(assignmentId, teamMemberIds) {
  const { error: delErr } = await supabase
    .from('assignment_team_members')
    .delete()
    .eq('assignment_id', assignmentId)
  if (delErr) throw delErr

  if (teamMemberIds.length === 0) return

  const { error } = await supabase
    .from('assignment_team_members')
    .insert(teamMemberIds.map(team_member_id => ({ assignment_id: assignmentId, team_member_id })))
  if (error) throw error
}
