import { supabase } from '../../../lib/supabase'
import { getCurrentProfile } from '../../../services/authService'
import { logActivity } from '../../../shared/services/activityService'
import { notifyAdmins } from '../../../shared/services/notificationService'
import { clockInAssignment, clockOutAssignment } from '../../planner/services/appointmentService'
import { APPOINTMENT_STATUS_META, CUSTOMER_NOTIFIED_STATUSES } from '../../../shared/constants/appointmentStatuses'
import { getCurrentFix } from '../../../shared/utils/geo'
import { formatTime, todayStr } from '../../../shared/utils/formatDate'

// Statuses where the technician has not yet responded to the assignment.
export const PENDING_RESPONSE_STATUSES = ['not_dispatched', 'awaiting', 'received']

// Fetch every appointment this technician is assigned to, with job + customer info.
export async function fetchMyAppointments(technicianId) {
  const { data, error } = await supabase
    .from('appointment_assignments')
    .select(`
      id, actual_start, actual_end,
      appointments(
        id, scheduled_start, scheduled_end, status, notes, job_id,
        jobs(id, job_ref, title, priority, status, completed_at, archived_at, site_address, site_city, customers(customer_name, telephone, mobile))
      )
    `)
    .eq('technician_id', technicianId)
  if (error) throw error

  return (data || [])
    // A deleted job is archived, not removed, so its visits still exist —
    // hide them from the technician (restoring the job brings them back).
    .filter(row => row.appointments && !row.appointments.jobs?.archived_at)
    .map(row => ({
      assignmentId: row.id,
      actual_start: row.actual_start,
      actual_end: row.actual_end,
      ...row.appointments,
    }))
    .sort((a, b) => new Date(a.scheduled_start) - new Date(b.scheduled_start))
}

export async function fetchMyAppointment(appointmentId, technicianId) {
  const { data, error } = await supabase
    .from('appointment_assignments')
    .select(`
      id, actual_start, actual_end,
      appointments(
        id, scheduled_start, scheduled_end, status, notes, job_id,
        jobs(*, customers(customer_name, telephone, mobile))
      )
    `)
    .eq('appointment_id', appointmentId)
    .eq('technician_id', technicianId)
    .maybeSingle()
  if (error) throw error
  if (!data?.appointments || data.appointments.jobs?.archived_at) return null

  return {
    assignmentId: data.id,
    actual_start: data.actual_start,
    actual_end: data.actual_end,
    ...data.appointments,
  }
}

// Every visit this technician has on one job (past and upcoming), oldest first.
// Cancelled and declined visits are left out — they never happened on site.
export async function fetchMyJobVisits(jobId, technicianId) {
  const { data, error } = await supabase
    .from('appointment_assignments')
    .select('appointments!inner(id, scheduled_start, scheduled_end, status, job_id)')
    .eq('technician_id', technicianId)
    .eq('appointments.job_id', jobId)
  if (error) throw error

  return (data || [])
    .map(row => row.appointments)
    .filter(a => a && a.status !== 'cancelled' && a.status !== 'declined')
    .sort((a, b) => new Date(a.scheduled_start) - new Date(b.scheduled_start))
}

// A technician booking the next day of a multi-day job for themselves. The
// visit starts as Accepted (they chose it, so there is nothing to accept); the
// admins get a notification and an activity entry so the planner isn't a surprise.
// `date` is "YYYY-MM-DD" and the times "HH:mm", all local — see toISO in
// AppointmentModal for why they go through Date rather than being sent bare.
export async function bookFollowUpVisit({ jobId, technicianId, jobLabel, date, startTime, endTime, notes }) {
  const [y, m, d] = date.split('-').map(Number)
  const at = time => {
    const [hh, mm] = time.split(':').map(Number)
    return new Date(y, m - 1, d, hh, mm)
  }
  const start = at(startTime)
  const end = at(endTime)

  if (!(end > start)) throw new Error('End time must be after start time.')
  if (date < todayStr()) throw new Error('Pick today or a later day.')

  const { data: appt, error } = await supabase
    .from('appointments')
    .insert([{
      job_id: jobId,
      scheduled_start: start.toISOString(),
      scheduled_end: end.toISOString(),
      status: 'accepted',
      notes: notes?.trim() || null,
    }])
    .select()
    .single()
  if (error) throw error

  const { error: assignError } = await supabase
    .from('appointment_assignments')
    .insert([{ appointment_id: appt.id, technician_id: technicianId }])
  if (assignError) {
    // A visit nobody is assigned to would sit on the planner unclaimed.
    await supabase.from('appointments').delete().eq('id', appt.id)
    throw assignError
  }

  const profile = await getCurrentProfile().catch(() => null)
  const who = profile?.full_name || 'A technician'
  const when = `${start.toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' })}, ${formatTime(start)}–${formatTime(end)}`
  await logActivity(jobId, 'technician_assigned', `${who} booked another visit for ${when}`).catch(() => {})
  await notifyAdmins({
    title: 'Another visit booked',
    body: `${who} booked another visit on "${jobLabel || 'a job'}" for ${when}.`,
    link: `/jobs/${jobId}`,
  }).catch(() => {})

  return appt
}

export async function respondToAppointment(appointmentId, status) {
  const { data: appt, error: fetchErr } = await supabase
    .from('appointments')
    .select('job_id, jobs(title, job_ref)')
    .eq('id', appointmentId)
    .maybeSingle()
  if (fetchErr) throw fetchErr

  const { error } = await supabase
    .from('appointments')
    .update({ status })
    .eq('id', appointmentId)
  if (error) throw error

  const profile = await getCurrentProfile().catch(() => null)
  const actorFallback = profile?.role === 'admin' ? 'An admin' : 'A technician'
  const jobLabel = appt?.jobs?.title || appt?.jobs?.job_ref || 'a job'
  const verb = status === 'accepted' ? 'accepted' : 'declined'

  if (appt?.job_id) {
    await logActivity(appt.job_id, `technician_${verb}`, `${profile?.full_name || actorFallback} ${verb} the appointment`).catch(() => {})
    await notifyAdmins({
      title: `Job ${verb}`,
      body: `${profile?.full_name || actorFallback} ${verb} "${jobLabel}".`,
      link: `/jobs/${appt.job_id}`,
    }).catch(() => {})
  }
}

// Technician-driven status update after acceptance (On Route, On Site,
// No Access, On Hold, Awaiting Auth, Follow On, Abandoned). Logs the change,
// notifies admins so the Time Planner reflects it immediately, and — for
// statuses in CUSTOMER_NOTIFIED_STATUSES — emails the customer directly.
export async function updateAppointmentStatus(appointmentId, status) {
  const { data: appt, error: fetchErr } = await supabase
    .from('appointments')
    .select('job_id, jobs(title, job_ref)')
    .eq('id', appointmentId)
    .maybeSingle()
  if (fetchErr) throw fetchErr

  const { error } = await supabase
    .from('appointments')
    .update({ status })
    .eq('id', appointmentId)
  if (error) throw error

  const profile = await getCurrentProfile().catch(() => null)
  const actorFallback = profile?.role === 'admin' ? 'An admin' : 'A technician'
  const jobLabel = appt?.jobs?.title || appt?.jobs?.job_ref || 'a job'
  const label = APPOINTMENT_STATUS_META[status]?.label || status

  if (appt?.job_id) {
    await logActivity(appt.job_id, 'technician_status_update', `${profile?.full_name || actorFallback} set "${jobLabel}" to ${label}`).catch(() => {})
    await notifyAdmins({
      title: `Job status: ${label}`,
      body: `${profile?.full_name || actorFallback} marked "${jobLabel}" as ${label}.`,
      link: `/jobs/${appt.job_id}`,
    }).catch(() => {})
  }

  if (CUSTOMER_NOTIFIED_STATUSES.has(status)) {
    await supabase.functions.invoke('notify-customer-status', {
      body: { appointment_id: appointmentId, status },
    }).catch(() => {})
  }
}

// Per-job clock in/out — reuses the same appointment_assignments columns
// the admin side uses, so both views stay in sync automatically.
//
// Here the technician is the one tapping the button, so their phone's position
// goes along with it and the database checks it against the job's site fence.
// It's a soft check: it never blocks the clock event, and it resolves to the
// verdict ({ status, distance, fence }, or null) so the screen can say so.
export async function clockIn(assignmentId) {
  return clockInAssignment(assignmentId, { fix: await getCurrentFix() })
}

export async function clockOut(assignmentId) {
  return clockOutAssignment(assignmentId, { fix: await getCurrentFix() })
}

// On-site clock history for a technician — one row per appointment they
// clocked into, carrying the job number/title and who was on site with them.
export { fetchOnSiteSessions as fetchOnSiteHistory } from '../../../shared/services/onSiteService'
