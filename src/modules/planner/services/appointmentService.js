import { supabase } from '../../../lib/supabase'
import { getCurrentProfile } from '../../../services/authService'
import { logActivity } from '../../../shared/services/activityService'
import { notifyUser, notifyAdmins } from '../../../shared/services/notificationService'
import { formatDistance } from '../../../shared/utils/geo'

async function technicianNames(technicianIds) {
  if (!technicianIds.length) return []
  const { data } = await supabase.from('profiles').select('id, full_name').in('id', technicianIds)
  return (data || []).map(p => p.full_name)
}

// Notifies technicians who are newly assigned to a job — used for both
// brand-new assignments and reassignments (where only the *added* ids
// should be notified, not everyone still on the job).
async function notifyNewAssignees(technicianIds, jobId) {
  if (!technicianIds.length || !jobId) return
  const { data: job } = await supabase.from('jobs').select('title, job_ref').eq('id', jobId).maybeSingle()
  const jobLabel = job?.title || job?.job_ref || 'a job'
  await Promise.all(technicianIds.map(tid =>
    notifyUser(tid, {
      title: 'New job assigned',
      body: `You've been assigned to "${jobLabel}".`,
      link: `/jobs/${jobId}`,
    }).catch(() => {})
  ))
}

// Removed technicians lose the job from their list, so tell them why it
// vanished. Links to their own list — they can no longer open the job.
async function notifyRemovedAssignees(technicianIds, jobId) {
  if (!technicianIds.length || !jobId) return
  const { data: job } = await supabase.from('jobs').select('title, job_ref').eq('id', jobId).maybeSingle()
  const jobLabel = job?.title || job?.job_ref || 'a job'
  await Promise.all(technicianIds.map(tid =>
    notifyUser(tid, {
      title: 'Removed from job',
      body: `You've been taken off "${jobLabel}".`,
      link: '/my-jobs',
    }).catch(() => {})
  ))
}

async function notifyAppointmentCancelled(technicianIds, jobId, when) {
  if (!technicianIds.length || !jobId) return
  const { data: job } = await supabase.from('jobs').select('title, job_ref').eq('id', jobId).maybeSingle()
  const jobLabel = job?.title || job?.job_ref || 'a job'
  await Promise.all(technicianIds.map(tid =>
    notifyUser(tid, {
      title: 'Appointment cancelled',
      body: `Your appointment on ${when} for "${jobLabel}" has been cancelled.`,
      link: '/my-jobs',
    }).catch(() => {})
  ))
}

// Local-day window as real instants. Bare "YYYY-MM-DDT00:00:00" strings are
// read as UTC, which made the planner's day run 02:00–01:59 SAST.
export async function fetchAppointmentsForDay(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const start = new Date(y, m - 1, d).toISOString()
  const end   = new Date(y, m - 1, d, 23, 59, 59, 999).toISOString()
  const { data, error } = await supabase
    .from('appointments')
    .select(`
      *,
      jobs(id, job_ref, title, priority, status, customers(customer_name)),
      appointment_assignments(technician_id, profiles(id, full_name, color, role))
    `)
    .gte('scheduled_start', start)
    .lte('scheduled_start', end)
    .order('scheduled_start')
  if (error) throw error
  return data
}

export async function fetchAppointmentsForJob(jobId) {
  const { data, error } = await supabase
    .from('appointments')
    .select(`
      *,
      appointment_assignments(
        *,
        profiles(id, full_name, color),
        assignment_team_members(team_members(id, full_name, role_title, is_casual))
      )
    `)
    .eq('job_id', jobId)
    .order('scheduled_start')
  if (error) throw error
  return data
}

// Flattened technician summary for a job — one row per technician per
// appointment, carrying both the scheduled window and actual clock times.
// Used by the Invoice detail page to summarize who did the work.
export async function fetchJobTechnicianSummary(jobId) {
  const { data, error } = await supabase
    .from('appointments')
    .select(`
      scheduled_start, scheduled_end,
      appointment_assignments(technician_id, actual_start, actual_end, profiles(id, full_name, color))
    `)
    .eq('job_id', jobId)
    .order('scheduled_start')
  if (error) throw error

  return (data || []).flatMap(appt =>
    (appt.appointment_assignments || []).map(a => ({
      technician_name: a.profiles?.full_name || 'Unknown',
      color:           a.profiles?.color,
      scheduled_start: appt.scheduled_start,
      scheduled_end:   appt.scheduled_end,
      actual_start:    a.actual_start,
      actual_end:      a.actual_end,
    }))
  )
}

// What the activity log says about where the clock event happened. Only the
// interesting outcomes are spelled out; "inside" just gets the distance.
function geoLogSuffix(geo) {
  if (!geo) return ''
  switch (geo.status) {
    case 'inside':       return ` (${formatDistance(geo.distance)} from the site pin)`
    case 'outside':      return ` — ${formatDistance(geo.distance)} from the site, outside the ${geo.fence} m fence`
    case 'unverified':   return ` (${formatDistance(geo.distance)} from the site pin, which isn't confirmed yet)`
    case 'no_gps':       return ' (location not shared)'
    case 'low_accuracy': return ' (location too vague to check)'
    default:             return ''
  }
}

// `geo` is the database's verdict on the technician's position (or null when
// nothing was checked). An 'outside' result becomes a flagged entry in the job's
// activity log and a notification to the admins; it never stops the clock event.
async function logClockEvent(assignmentId, action, label, geo) {
  const { data: assignment } = await supabase
    .from('appointment_assignments')
    .select('appointments(job_id, jobs(title, job_ref))')
    .eq('id', assignmentId)
    .maybeSingle()
  const jobId = assignment?.appointments?.job_id
  if (!jobId) return
  const profile = await getCurrentProfile().catch(() => null)
  const who = profile?.full_name || 'Technician'
  const flagged = geo?.status === 'outside'

  await logActivity(
    jobId,
    flagged ? `${action}_flagged` : action,
    `${who} ${label}${geoLogSuffix(geo)}`,
  ).catch(() => {})

  if (flagged) {
    const jobLabel = assignment.appointments.jobs?.title || assignment.appointments.jobs?.job_ref || 'a job'
    await notifyAdmins({
      title: action === 'clocked_in' ? 'Clocked in away from the job site' : 'Clocked out away from the job site',
      body: `${who} ${label} ${formatDistance(geo.distance)} from "${jobLabel}" (the fence is ${geo.fence} m).`,
      link: `/jobs/${jobId}`,
    }).catch(() => {})
  }
}

const GEO_FIELDS = prefix => `${prefix}_geo_status, ${prefix}_distance_m, ${prefix}_fence_m`
const isMissingColumn = err => err?.code === '42703' || err?.code === 'PGRST204'

// Records a clock-in ('start') or clock-out ('end') on an assignment, along
// with the technician's GPS fix when there is one. The database compares the
// fix with the job's site fence and stores the verdict; this returns it as
// { status, distance, fence }, or null when it can't be read back.
async function recordClock(assignmentId, prefix, fix) {
  const clock = { [prefix === 'start' ? 'actual_start' : 'actual_end']: new Date().toISOString() }
  const position = fix
    ? { [`${prefix}_lat`]: fix.lat, [`${prefix}_lng`]: fix.lng, [`${prefix}_accuracy_m`]: fix.accuracy }
    : {}

  let { data, error } = await supabase
    .from('appointment_assignments')
    .update({ ...clock, ...position })
    .eq('id', assignmentId)
    .select(GEO_FIELDS(prefix))
    .maybeSingle()

  // The location columns arrive with a database migration. If this code is ever
  // live before that has run, clocking in must still work — just unchecked.
  if (error && isMissingColumn(error)) {
    ;({ data, error } = await supabase
      .from('appointment_assignments')
      .update(clock)
      .eq('id', assignmentId)
      .select('id')
      .maybeSingle())
  }
  if (error) throw error

  const status = data?.[`${prefix}_geo_status`]
  if (!status) return null
  return { status, distance: data[`${prefix}_distance_m`], fence: data[`${prefix}_fence_m`] }
}

// `fix` is the technician's own phone position ({ lat, lng, accuracy }) — pass
// it only when the technician is the one tapping the button. An admin clocking
// someone in sends none, and the result is recorded as "admin entered".
export async function clockInAssignment(assignmentId, { fix } = {}) {
  const geo = await recordClock(assignmentId, 'start', fix)
  await logClockEvent(assignmentId, 'clocked_in', 'clocked in on site', geo)
  return geo
}

export async function clockOutAssignment(assignmentId, { fix } = {}) {
  const geo = await recordClock(assignmentId, 'end', fix)
  await logClockEvent(assignmentId, 'clocked_out', 'clocked out on site', geo)
  return geo
}

// An admin acknowledging a flagged clock-in / clock-out, with an optional
// explanation. The database stamps who and when; technicians can't set this.
export async function reviewGeoFlag(assignmentId, note) {
  const { data, error } = await supabase
    .from('appointment_assignments')
    .update({ geo_reviewed_at: new Date().toISOString(), geo_review_note: note?.trim() || null })
    .eq('id', assignmentId)
    .select('appointments(job_id), profiles(full_name)')
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('Update failed — no rows were changed. Check your permissions.')

  const jobId = data.appointments?.job_id
  if (jobId) {
    const profile = await getCurrentProfile().catch(() => null)
    const detail = `${profile?.full_name || 'An admin'} reviewed the location flag for ${data.profiles?.full_name || 'a technician'}`
    await logActivity(jobId, 'location_flag_reviewed', note?.trim() ? `${detail} — “${note.trim()}”` : detail).catch(() => {})
  }
}

function clockLabel(iso) {
  return iso ? new Date(iso).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' }) : 'blank'
}

// Admin correction of someone's on-site clock (e.g. they tapped clock-in
// two hours after reaching site). Team members riding this assignment are
// paid off the same window, so their hours move with it. The database
// trigger rejects this for non-admins and keeps the original times.
export async function adjustAssignmentTimes(assignmentId, { actual_start, actual_end }, reason = '') {
  if (actual_end && !actual_start) throw new Error('Set a clock-in time before a clock-out time')
  if (actual_start && actual_end && new Date(actual_end) <= new Date(actual_start)) {
    throw new Error('Clock-out must be after clock-in')
  }
  const now = Date.now() + 60_000
  if ((actual_start && new Date(actual_start) > now) || (actual_end && new Date(actual_end) > now)) {
    throw new Error("Times can't be in the future")
  }

  const { data: before, error: fetchErr } = await supabase
    .from('appointment_assignments')
    .select('actual_start, actual_end, profiles(full_name), appointments(job_id)')
    .eq('id', assignmentId)
    .maybeSingle()
  if (fetchErr) throw fetchErr
  if (!before) throw new Error('Clock-in record not found')

  const { data, error } = await supabase
    .from('appointment_assignments')
    .update({ actual_start: actual_start || null, actual_end: actual_end || null })
    .eq('id', assignmentId)
    .select('id')
  if (error) throw error
  if (!data?.length) throw new Error('Update failed — no rows were changed. Check your permissions.')

  const jobId = before.appointments?.job_id
  if (jobId) {
    const profile = await getCurrentProfile().catch(() => null)
    const changes = []
    if (!sameInstant(before.actual_start, actual_start)) changes.push(`clock-in ${clockLabel(before.actual_start)} → ${clockLabel(actual_start)}`)
    if (!sameInstant(before.actual_end, actual_end)) changes.push(`clock-out ${clockLabel(before.actual_end)} → ${clockLabel(actual_end)}`)
    if (changes.length) {
      const who = before.profiles?.full_name || 'technician'
      const note = reason.trim() ? ` (reason: ${reason.trim()})` : ''
      await logActivity(jobId, 'clock_times_adjusted', `${profile?.full_name || 'Admin'} adjusted ${who}'s ${changes.join(', ')}${note}`).catch(() => {})
    }
  }
}

function sameInstant(a, b) {
  if (!a || !b) return !a && !b
  return new Date(a).getTime() === new Date(b).getTime()
}

export async function createAppointment(appt, technicianIds = []) {
  const { data, error } = await supabase
    .from('appointments')
    .insert([appt])
    .select()
  if (error) throw error

  if (technicianIds.length > 0) {
    const rows = technicianIds.map(tid => ({
      appointment_id: data[0].id,
      technician_id:  tid,
    }))
    const { error: ae } = await supabase.from('appointment_assignments').insert(rows)
    if (ae) throw ae

    if (appt.job_id) {
      const [names, profile] = await Promise.all([technicianNames(technicianIds), getCurrentProfile().catch(() => null)])
      await logActivity(appt.job_id, 'technician_assigned', `${names.join(', ') || 'A technician'} scheduled by ${profile?.full_name || 'admin'}`).catch(() => {})
      await notifyNewAssignees(technicianIds, appt.job_id)
    }
  }
  return data[0]
}

export async function updateAppointment(id, updates) {
  // Cancelling is a status change made here, so spot it against the prior status.
  let before = null
  if (updates.status === 'cancelled') {
    const { data: prior } = await supabase
      .from('appointments')
      .select('status, job_id, scheduled_start, appointment_assignments(technician_id)')
      .eq('id', id)
      .maybeSingle()
    before = prior
  }

  const { data, error } = await supabase
    .from('appointments')
    .update(updates)
    .eq('id', id)
    .select()
  if (error) throw error
  if (!data || data.length === 0) throw new Error('Update failed.')

  if (before && before.status !== 'cancelled' && before.job_id) {
    const profile = await getCurrentProfile().catch(() => null)
    const when = before.scheduled_start
      ? new Date(before.scheduled_start).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' })
      : 'unscheduled'
    await logActivity(before.job_id, 'appointment_cancelled', `Appointment on ${when} cancelled by ${profile?.full_name || 'admin'}`).catch(() => {})
    await notifyAppointmentCancelled((before.appointment_assignments || []).map(a => a.technician_id), before.job_id, when)
  }
}

// Only touches what changed: removed technicians lose their assignment (so
// the visit drops off their technician view), new ones are added, and
// everyone kept keeps their clock-in times and on-site team members.
// Deleting and re-inserting every row used to wipe those on each save.
export async function updateAppointmentTechnicians(appointmentId, technicianIds) {
  const { data: existing, error: fetchErr } = await supabase
    .from('appointment_assignments')
    .select('id, technician_id, actual_start, profiles(full_name)')
    .eq('appointment_id', appointmentId)
  if (fetchErr) throw fetchErr
  const priorIds = (existing || []).map(r => r.technician_id)

  const removed = (existing || []).filter(r => !technicianIds.includes(r.technician_id))
  // Their on-site clock is their pay record for this visit (and their
  // helpers'), so removing them would silently delete worked hours.
  const clockedIn = removed.filter(r => r.actual_start)
  if (clockedIn.length > 0) {
    const names = clockedIn.map(r => r.profiles?.full_name || 'A technician').join(', ')
    throw new Error(`${names} already clocked in on this visit, so removing them would delete their worked hours. Leave them on it, or correct their clock times from the job's Appointments tab.`)
  }

  if (removed.length > 0) {
    const { error: de } = await supabase
      .from('appointment_assignments')
      .delete()
      .in('id', removed.map(r => r.id))
    if (de) throw de
  }

  const added = technicianIds.filter(tid => !priorIds.includes(tid))
  if (added.length > 0) {
    const rows = added.map(tid => ({ appointment_id: appointmentId, technician_id: tid }))
    const { error } = await supabase.from('appointment_assignments').insert(rows)
    if (error) throw error
  }

  if (removed.length === 0 && added.length === 0) return

  const { data: appt } = await supabase.from('appointments').select('job_id').eq('id', appointmentId).maybeSingle()
  if (appt?.job_id) {
    const [names, profile] = await Promise.all([technicianNames(technicianIds), getCurrentProfile().catch(() => null)])
    await logActivity(appt.job_id, 'technician_reassigned', `Technicians updated to ${names.join(', ') || 'none'} by ${profile?.full_name || 'admin'}`).catch(() => {})

    const newlyAdded = technicianIds.filter(tid => !priorIds.includes(tid))
    await notifyNewAssignees(newlyAdded, appt.job_id)
    await notifyRemovedAssignees(removed.map(r => r.technician_id), appt.job_id)
  }
}

// Deleting cascades to every assignment, i.e. everyone's on-site clock for
// this visit. Once someone has clocked in, cancelling keeps their hours and
// still hides the visit from technicians.
export async function deleteAppointment(id) {
  const { data: worked, error: fetchErr } = await supabase
    .from('appointment_assignments')
    .select('id, profiles(full_name)')
    .eq('appointment_id', id)
    .not('actual_start', 'is', null)
  if (fetchErr) throw fetchErr
  if (worked?.length) {
    const names = worked.map(r => r.profiles?.full_name || 'A technician').join(', ')
    throw new Error(`${names} already clocked in on this visit, so deleting it would delete their worked hours. Set its status to Cancelled instead — that hides it from technicians and keeps the hours.`)
  }

  // Read what's needed for the notice/log before the cascade removes it.
  const { data: appt } = await supabase
    .from('appointments')
    .select('job_id, scheduled_start, appointment_assignments(technician_id)')
    .eq('id', id)
    .maybeSingle()

  const { data, error } = await supabase.from('appointments').delete().eq('id', id).select('id')
  if (error) throw error
  if (!data?.length) throw new Error('Delete failed — the appointment was not removed. Check your permissions.')

  if (appt?.job_id) {
    const profile = await getCurrentProfile().catch(() => null)
    const when = appt.scheduled_start
      ? new Date(appt.scheduled_start).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' })
      : 'unscheduled'
    await logActivity(appt.job_id, 'appointment_deleted', `Appointment on ${when} deleted by ${profile?.full_name || 'admin'}`).catch(() => {})
    await notifyRemovedAssignees((appt.appointment_assignments || []).map(a => a.technician_id), appt.job_id)
  }
}
