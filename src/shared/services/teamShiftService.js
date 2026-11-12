import { supabase } from '../../lib/supabase'
import { getCurrentFix } from '../utils/geo'
import { jobSiteFields } from '../utils/jobSite'
import { ADDED_NOTE, isAddedByAdmin } from '../utils/teamShiftText'

// A team member (labourer/helper) has no login, so a technician clocks them
// in and out from their own phone. The database owns the times — see the
// team_member_shifts migration — this file only asks.
//
//   with_technician  "Clock-in Team member": they're with the technician.
//   drop_off         "Drop-off and clock-in Team member": the technician
//                    leaves them at a job site and clocks them in there.
//
// Either way the technician says which job number they are clocked in on.

const TEAMSHIFT_CHANGED = 'teamshift:changed'

// Same trick as workShiftService: no shared store, so a DOM event keeps every
// mounted widget showing who's clocked in in step.
export function onTeamShiftChange(handler) {
  window.addEventListener(TEAMSHIFT_CHANGED, handler)
  return () => window.removeEventListener(TEAMSHIFT_CHANGED, handler)
}

// Exported for the notification bell — see notifyWorkShiftChanged.
export function notifyTeamShiftChanged() {
  window.dispatchEvent(new Event(TEAMSHIFT_CHANGED))
}

const SHIFT_SELECT = `
  *,
  team_members(id, full_name, role_title, is_casual),
  jobs:job_id(id, job_ref, title, site_address, site_city),
  clocked_in_by_profile:clocked_in_by(full_name),
  clocked_out_by_profile:clocked_out_by(full_name)
`

// The same select, but the team_members join is inner so a filter on it
// (is_casual) drops the shift rows too, not just the embedded member.
const CASUAL_SHIFT_SELECT = SHIFT_SELECT.replace('team_members(', 'team_members!inner(')

// A date-range query returns everything in the range, up to this safety cap.
const RANGE_LIMIT = 2000

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

// The Live Team Members page: one row per team member who is clocked in right
// now, oldest first, with who clocked them in and where. Its own select (more
// columns than SHIFT_SELECT) so the lighter bubble/report queries stay as they are.
const LIVE_SELECT = `
  id, team_member_id, clock_in, mode, site_label, job_id, in_lat, in_lng, original_clock_in,
  team_members(id, full_name, role_title, is_casual, phone),
  jobs:job_id(id, job_ref, title, site_address, site_city, site_lat, site_lng),
  clocked_in_by_profile:clocked_in_by(id, full_name, role, color)
`

export async function fetchLiveTeamMembers() {
  const { data, error } = await supabase
    .from('team_member_shifts')
    .select(LIVE_SELECT)
    .is('clock_out', null)
    .order('clock_in', { ascending: true })
  if (error) {
    if (isMissingTable(error)) return []
    throw error
  }
  return (data || []).map(r => {
    const job = r.jobs
    const by = r.clocked_in_by_profile
    return {
      shiftId: r.id,
      teamMemberId: r.team_member_id,
      fullName: r.team_members?.full_name ?? 'Unknown',
      roleTitle: r.team_members?.role_title ?? null,
      isCasual: !!r.team_members?.is_casual,
      phone: r.team_members?.phone ?? null,
      clockIn: r.clock_in,
      adjusted: !!r.original_clock_in,
      dropOff: r.mode === 'drop_off',
      siteLabel: r.site_label,
      job: job ? {
        id: job.id,
        ref: job.job_ref,
        title: job.title,
        location: [job.site_address, job.site_city].filter(Boolean).join(', ') || null,
        point: job.site_lat != null && job.site_lng != null ? { lat: job.site_lat, lng: job.site_lng } : null,
      } : null,
      // Where the phone was when they were clocked in (a snapshot, not live).
      lat: r.in_lat ?? null,
      lng: r.in_lng ?? null,
      clockedBy: by ? { id: by.id, name: by.full_name ?? 'Unknown', role: by.role ?? null, color: by.color ?? null } : null,
    }
  })
}

// Company-wide: completed clock-ins for every team member, newest first — the
// team half of the User Timesheets report. With a { from, to } range (ISO
// instants, `to` exclusive) it returns everything that started in it.
export async function fetchTeamShiftHistoryForCompany(limit = 100, { from, to } = {}) {
  let query = supabase
    .from('team_member_shifts')
    .select(SHIFT_SELECT)
    .not('clock_out', 'is', null)
    .order('clock_in', { ascending: false })
    .limit(from || to ? RANGE_LIMIT : limit)
  if (from) query = query.gte('clock_in', from)
  if (to) query = query.lt('clock_in', to)
  const { data, error } = await query
  if (error) {
    if (isMissingTable(error)) return []
    throw error
  }
  return data || []
}

// Every clock-in that started in a date range — open ones included — newest
// first. `casualOnly` keeps just the one-day casuals (team_members.is_casual).
// from/to are ISO instants, `to` exclusive.
export async function fetchTeamShiftsInRange({ from, to, casualOnly = false } = {}) {
  let query = supabase
    .from('team_member_shifts')
    .select(casualOnly ? CASUAL_SHIFT_SELECT : SHIFT_SELECT)
    .order('clock_in', { ascending: false })
    .limit(RANGE_LIMIT)
  if (casualOnly) query = query.eq('team_members.is_casual', true)
  if (from) query = query.gte('clock_in', from)
  if (to) query = query.lt('clock_in', to)
  const { data, error } = await query
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

// Clock several team members in at once. One failing (e.g. already clocked in
// on another phone) doesn't stop the rest: resolves to { done, failed } where
// failed is [{ teamMemberId, message }].
//   Both modes need `job`, the job number they are clocked in on: either an
//   existing job ({ id, job_ref, site_address, site_city, title }) or one the
//   technician typed in ({ id: null, site_text }). For drop_off it is the site
//   they are left at.
export async function clockInTeamMembers(teamMemberIds, { mode = 'with_technician', job = null } = {}) {
  const site = jobSiteFields(job)
  if (!site.job_id && !site.site_label) {
    throw new Error(mode === 'drop_off'
      ? 'Pick or type the job site you are dropping them at'
      : 'Pick or type the job number you are clocking them in on')
  }

  // Where the phone is right now — a soft record, never a reason to wait long.
  const fix = await getCurrentFix({ timeout: 6000 })
  const base = {
    mode,
    ...site,
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

// Admin correction of a team member's clock-in/out (e.g. nobody tapped Clock
// out at the end of the day). The database refuses this for anyone but an
// admin and keeps the original times. Leaving clock_out empty keeps — or
// reopens — the clock-in. The reason is kept in the row's note.
export async function adjustTeamShiftTimes(shiftId, { clock_in, clock_out }, reason = '') {
  if (!clock_in) throw new Error('Clock-in time is required')
  if (clock_out && new Date(clock_out) <= new Date(clock_in)) throw new Error('Clock-out must be after clock-in')
  const limit = Date.now() + 60_000
  if (new Date(clock_in) > limit || (clock_out && new Date(clock_out) > limit)) {
    throw new Error("Times can't be in the future")
  }

  const updates = { clock_in, clock_out: clock_out || null }
  if (!clock_out) updates.clocked_out_by = null
  if (reason.trim()) {
    // Keep the "Added by an admin" marker on a clock-in an admin typed in.
    const { data: current } = await supabase
      .from('team_member_shifts').select('note').eq('id', shiftId).maybeSingle()
    updates.note = isAddedByAdmin(current) ? `${ADDED_NOTE} · ${reason.trim()}` : reason.trim()
  }

  const { data, error } = await supabase
    .from('team_member_shifts')
    .update(updates)
    .eq('id', shiftId)
    .select('id')
  if (error) {
    if (error.code === '23505') throw new Error('They already have an open clock-in — close that one first')
    throw error
  }
  if (!data?.length) throw new Error('Update failed — no rows were changed. Check your permissions.')
  notifyTeamShiftChanged()
}

// Admin adds a clock-in nobody tapped (the technician forgot to clock them
// in). The database lets an admin insert any times; for everyone else it
// forces "now". The row is marked "Added by an admin" in its note, and
// `clockedOutBy` (the admin's profile id) stamps who closed it.
// Refuses times that overlap one of their existing clock-ins, so the same
// hours can't be counted twice when the technician did clock them in too.
export async function addTeamShift(
  teamMemberId,
  { clock_in, clock_out, job = null, mode = 'with_technician', clockedOutBy = null },
  reason = '',
) {
  if (!clock_in) throw new Error('Clock-in time is required')
  if (clock_out && new Date(clock_out) <= new Date(clock_in)) throw new Error('Clock-out must be after clock-in')
  const limit = Date.now() + 60_000
  if (new Date(clock_in) > limit || (clock_out && new Date(clock_out) > limit)) {
    throw new Error("Times can't be in the future")
  }
  const site = jobSiteFields(job)
  if (!site.job_id && !site.site_label) throw new Error('Pick or type the job number they worked on')

  // Any existing clock-in that runs into the new window (open ones run on forever).
  let overlap = supabase
    .from('team_member_shifts')
    .select('clock_in, clock_out')
    .eq('team_member_id', teamMemberId)
    .or(`clock_out.is.null,clock_out.gt.${clock_in}`)
    .limit(1)
  if (clock_out) overlap = overlap.lt('clock_in', clock_out)
  const { data: clash, error: clashError } = await overlap
  if (clashError && !isMissingTable(clashError)) throw clashError
  if (clash?.length) {
    const fmt = iso => new Date(iso).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' })
    const c = clash[0]
    throw new Error(`They already have a clock-in (${fmt(c.clock_in)} – ${c.clock_out ? fmt(c.clock_out) : 'still clocked in'}) that overlaps these times. Edit that one instead.`)
  }

  const row = {
    team_member_id: teamMemberId,
    clock_in,
    clock_out: clock_out || null,
    mode,
    ...site,
    note: reason.trim() ? `${ADDED_NOTE} · ${reason.trim()}` : ADDED_NOTE,
  }
  if (clock_out && clockedOutBy) row.clocked_out_by = clockedOutBy

  const { error } = await supabase.from('team_member_shifts').insert([row])
  if (error) {
    if (error.code === '23505') throw new Error('They are already clocked in — close that clock-in first')
    throw error
  }
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
