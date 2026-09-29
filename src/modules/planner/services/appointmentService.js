import { supabase } from '../../../lib/supabase'
import { getCurrentProfile } from '../../../services/authService'
import { logActivity } from '../../../shared/services/activityService'
import { notifyUser } from '../../../shared/services/notificationService'

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

async function logClockEvent(assignmentId, action, label) {
  const { data: assignment } = await supabase
    .from('appointment_assignments')
    .select('appointments(job_id)')
    .eq('id', assignmentId)
    .maybeSingle()
  const jobId = assignment?.appointments?.job_id
  if (!jobId) return
  const profile = await getCurrentProfile().catch(() => null)
  await logActivity(jobId, action, `${profile?.full_name || 'Technician'} ${label}`).catch(() => {})
}

export async function clockInAssignment(assignmentId) {
  const { error } = await supabase
    .from('appointment_assignments')
    .update({ actual_start: new Date().toISOString() })
    .eq('id', assignmentId)
  if (error) throw error
  await logClockEvent(assignmentId, 'clocked_in', 'clocked in on site')
}

export async function clockOutAssignment(assignmentId) {
  const { error } = await supabase
    .from('appointment_assignments')
    .update({ actual_end: new Date().toISOString() })
    .eq('id', assignmentId)
  if (error) throw error
  await logClockEvent(assignmentId, 'clocked_out', 'clocked out on site')
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
  const { data, error } = await supabase
    .from('appointments')
    .update(updates)
    .eq('id', id)
    .select()
  if (error) throw error
  if (!data || data.length === 0) throw new Error('Update failed.')
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

  const { data, error } = await supabase.from('appointments').delete().eq('id', id).select('id')
  if (error) throw error
  if (!data?.length) throw new Error('Delete failed — the appointment was not removed. Check your permissions.')
}
