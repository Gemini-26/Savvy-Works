import { supabase } from '../../lib/supabase'
import { getCurrentFix } from '../utils/geo'

// A team member (labourer/helper) has no login, so a technician clocks them
// in and out from their own phone. The database owns the times — see the
// team_member_shifts migration — this file only asks.
//
//   with_technician  "Clock-in Team member": they're with the technician.
//   drop_off         "Drop-off and clock-in Team member": the technician
//                    leaves them at a job site and clocks them in there.

const TEAMSHIFT_CHANGED = 'teamshift:changed'

// Same trick as workShiftService: no shared store, so a DOM event keeps every
// mounted widget showing who's clocked in in step.
export function onTeamShiftChange(handler) {
  window.addEventListener(TEAMSHIFT_CHANGED, handler)
  return () => window.removeEventListener(TEAMSHIFT_CHANGED, handler)
}

function notifyTeamShiftChanged() {
  window.dispatchEvent(new Event(TEAMSHIFT_CHANGED))
}

const SHIFT_SELECT = `
  *,
  team_members(id, full_name, role_title, is_casual),
  jobs:job_id(id, job_ref, title, site_address, site_city),
  clocked_in_by_profile:clocked_in_by(full_name),
  clocked_out_by_profile:clocked_out_by(full_name)
`

// The table not existing yet (migration not applied) must never break the
// clock button — treat it as "nobody is clocked in".
function isMissingTable(error) {
  return error?.code === '42P01' || error?.code === 'PGRST205' || /team_member_shifts/.test(error?.message || '')
}

// Everyone on the team who is clocked in right now, newest first.
export async function fetchOpenTeamShifts() {
  const { data, error } = await supabase
    .from('team_member_shifts')
    .select(SHIFT_SELECT)
    .is('clock_out', null)
    .order('clock_in', { ascending: false })
  if (error) {
    if (isMissingTable(error)) return []
    throw error
  }
  return data || []
}

// One team member's clock history, newest first.
export async function fetchTeamMemberShifts(teamMemberId, limit = 200) {
  const { data, error } = await supabase
    .from('team_member_shifts')
    .select(SHIFT_SELECT)
    .eq('team_member_id', teamMemberId)
    .order('clock_in', { ascending: false })
    .limit(limit)
  if (error) {
    if (isMissingTable(error)) return []
    throw error
  }
  return data || []
}

function jobLabel(job) {
  if (!job) return null
  const place = [job.site_address, job.site_city].filter(Boolean).join(', ')
  return [job.job_ref, place || job.title].filter(Boolean).join(' · ') || null
}

// Clock several team members in at once. One failing (e.g. already clocked in
// on another phone) doesn't stop the rest: resolves to { done, failed } where
// failed is [{ teamMemberId, message }].
//   mode 'drop_off' needs `job` ({ id, job_ref, site_address, site_city, title }).
export async function clockInTeamMembers(teamMemberIds, { mode = 'with_technician', job = null } = {}) {
  if (mode === 'drop_off' && !job?.id) throw new Error('Pick the job site you are dropping them at')

  // Where the phone is right now — a soft record, never a reason to wait long.
  const fix = await getCurrentFix({ timeout: 6000 })
  const base = {
    mode,
    job_id: mode === 'drop_off' ? job.id : null,
    site_label: mode === 'drop_off' ? jobLabel(job) : null,
    in_lat: fix?.lat ?? null,
    in_lng: fix?.lng ?? null,
  }

  const done = []
  const failed = []
  for (const teamMemberId of teamMemberIds) {
    const { data, error } = await supabase
      .from('team_member_shifts')
      .insert([{ ...base, team_member_id: teamMemberId }])
      .select('id')
    if (error) {
      failed.push({
        teamMemberId,
        message: error.code === '23505' ? 'Already clocked in' : (error.message || 'Could not clock in'),
      })
    } else {
      done.push(data[0].id)
    }
  }
  if (done.length) notifyTeamShiftChanged()
  return { done, failed }
}

export async function clockOutTeamMember(shiftId) {
  const { data, error } = await supabase
    .from('team_member_shifts')
    .update({ clock_out: new Date().toISOString() })
    .eq('id', shiftId)
    .is('clock_out', null)
    .select('id')
  if (error) throw error
  if (!data?.length) throw new Error('Already clocked out')
  notifyTeamShiftChanged()
}

// Jobs a technician can drop someone at: anything still open.
export async function fetchDropOffJobs(limit = 300) {
  const { data, error } = await supabase
    .from('jobs')
    .select('id, job_ref, title, status, site_address, site_city, customers(customer_name)')
    .is('archived_at', null)
    .not('status', 'in', '(cancelled,invoiced,completed)')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data || []
}
