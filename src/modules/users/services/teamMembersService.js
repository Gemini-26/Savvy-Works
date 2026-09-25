import { supabase } from '../../../lib/supabase'
import { getCurrentProfile } from '../../../services/authService'

// Team members are labourers/helpers a technician can bring on site.
// They have no login of their own and aren't fixed to a single
// technician — admin registers them once, any technician can pick
// from the pool.
export async function fetchTeamMember(id) {
  const { data, error } = await supabase.from('team_members').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data
}

// `activeOnly` is a three-way filter: true = active only, false = inactive
// only, null = every team member. Passing false used to mean "don't filter",
// which made the Inactive page list active members too.
export async function fetchTeamMembers(activeOnly = true) {
  let query = supabase.from('team_members').select('*').order('full_name')
  if (activeOnly !== null) query = query.eq('is_active', activeOnly)
  const { data, error } = await query
  if (error) throw error
  return data || []
}

// Phone numbers are typed inconsistently ("082 123 4567", "0821234567"),
// so compare digits only.
function phoneDigits(phone) {
  return (phone || '').replace(/\D/g, '')
}

// A team member already on the books with the same name or the same phone
// number. Checks active and inactive alike — the usual mistake is re-adding
// someone who was deactivated instead of reactivating them.
async function findDuplicateTeamMember({ full_name, phone }, excludeId = null) {
  const name = (full_name || '').trim().toLowerCase()
  const digits = phoneDigits(phone)

  const { data, error } = await supabase.from('team_members').select('id, full_name, phone, is_active')
  if (error) throw error

  for (const member of data || []) {
    if (member.id === excludeId) continue
    if (name && member.full_name?.trim().toLowerCase() === name) return { member, reason: 'name' }
    if (digits && phoneDigits(member.phone) === digits) return { member, reason: 'phone' }
  }
  return null
}

function duplicateMessage({ member, reason }) {
  const status = member.is_active
    ? 'is already on the team'
    : 'is already on the team but deactivated — reactivate them under Inactive Team Members instead of adding a duplicate'
  return reason === 'name'
    ? `"${member.full_name}" ${status}.`
    : `That phone number already belongs to "${member.full_name}", who ${status}.`
}

export async function createTeamMember({ full_name, phone, role_title }) {
  const duplicate = await findDuplicateTeamMember({ full_name, phone })
  if (duplicate) throw new Error(duplicateMessage(duplicate))

  const profile = await getCurrentProfile().catch(() => null)
  const { data, error } = await supabase
    .from('team_members')
    .insert([{ full_name, phone: phone || null, role_title: role_title || null, created_by: profile?.id ?? null }])
    .select()
  if (error) throw error
  return data[0]
}

// A one-day labourer added on the fly from the clock-in screen instead of
// being pre-registered. Created inactive so it doesn't linger in the
// reusable Active Team Members roster, and is_casual keeps it distinguishable
// from an ordinary deactivated member in the admin UI. No duplicate-name
// check — unlike the permanent roster, it's expected that casuals reuse
// common names across different days/jobs.
export async function createCasualTeamMember(full_name) {
  const profile = await getCurrentProfile().catch(() => null)
  const { data, error } = await supabase
    .from('team_members')
    .insert([{ full_name, is_casual: true, is_active: false, created_by: profile?.id ?? null }])
    .select()
  if (error) throw error
  return data[0]
}

export async function setTeamMemberActive(id, is_active) {
  const { error } = await supabase.from('team_members').update({ is_active }).eq('id', id)
  if (error) throw error
}

export async function updateTeamMember(id, { full_name, phone, role_title }) {
  // Same guard on rename, so an edit can't create the duplicate the add blocks.
  const duplicate = await findDuplicateTeamMember({ full_name, phone }, id)
  if (duplicate) throw new Error(duplicateMessage(duplicate))

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
    .select('team_member_id, team_members(id, full_name, phone, role_title, is_casual)')
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

// Every on-site session this team member was logged onto, newest first.
// A team member has no login of their own, so their hours come from the
// technician's clock-in window on each appointment they were selected for.
export async function fetchTeamMemberOnSiteSessions(teamMemberId, limit = 200) {
  const { data, error } = await supabase
    .from('assignment_team_members')
    .select(`
      id,
      appointment_assignments!inner(
        id, actual_start, actual_end,
        profiles(id, full_name, color),
        appointments(job_id, jobs(job_ref, title, site_address, site_city))
      )
    `)
    .eq('team_member_id', teamMemberId)
    .not('appointment_assignments.actual_start', 'is', null)
    .limit(limit)
  if (error) throw error

  return (data || [])
    .map(row => {
      const a = row.appointment_assignments
      return {
        id: row.id,
        assignment_id: a.id,
        actual_start: a.actual_start,
        actual_end: a.actual_end,
        technician_name: a.profiles?.full_name || 'Unknown',
        technician_color: a.profiles?.color,
        job_id: a.appointments?.job_id,
        job_ref: a.appointments?.jobs?.job_ref,
        job_title: a.appointments?.jobs?.title,
        site: [a.appointments?.jobs?.site_address, a.appointments?.jobs?.site_city].filter(Boolean).join(', '),
      }
    })
    .sort((x, y) => new Date(y.actual_start) - new Date(x.actual_start))
}
