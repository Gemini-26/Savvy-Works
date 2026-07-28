import { supabase } from '../../../lib/supabase'
import { getCurrentProfile } from '../../../services/authService'
import { logActivity } from '../../../shared/services/activityService'
import { notifyAdmins } from '../../../shared/services/notificationService'
import { clockInAssignment, clockOutAssignment } from '../../planner/services/appointmentService'

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
        jobs(id, job_ref, title, priority, status, site_address, site_city, customers(customer_name, telephone, mobile))
      )
    `)
    .eq('technician_id', technicianId)
  if (error) throw error

  return (data || [])
    .filter(row => row.appointments)
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
  if (!data) return null

  return {
    assignmentId: data.id,
    actual_start: data.actual_start,
    actual_end: data.actual_end,
    ...data.appointments,
  }
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
  const jobLabel = appt?.jobs?.title || appt?.jobs?.job_ref || 'a job'
  const verb = status === 'accepted' ? 'accepted' : 'declined'

  if (appt?.job_id) {
    await logActivity(appt.job_id, `technician_${verb}`, `${profile?.full_name || 'Technician'} ${verb} the appointment`).catch(() => {})
    await notifyAdmins({
      title: `Job ${verb}`,
      body: `${profile?.full_name || 'A technician'} ${verb} "${jobLabel}".`,
      link: `/jobs/${appt.job_id}`,
    }).catch(() => {})
  }
}

// Per-job clock in/out — reuses the same appointment_assignments columns
// the admin side uses, so both views stay in sync automatically.
export const clockIn = clockInAssignment
export const clockOut = clockOutAssignment

// On-site clock history for a technician — one row per appointment they
// clocked into, carrying the job number/title for record-keeping.
export async function fetchOnSiteHistory(technicianId) {
  const { data, error } = await supabase
    .from('appointment_assignments')
    .select(`
      id, actual_start, actual_end,
      appointments(job_id, jobs(job_ref, title))
    `)
    .eq('technician_id', technicianId)
    .not('actual_start', 'is', null)
    .order('actual_start', { ascending: false })
  if (error) throw error

  return (data || []).map(row => ({
    id: row.id,
    actual_start: row.actual_start,
    actual_end: row.actual_end,
    job_ref: row.appointments?.jobs?.job_ref,
    job_title: row.appointments?.jobs?.title,
  }))
}
