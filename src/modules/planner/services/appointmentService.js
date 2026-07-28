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

export async function fetchAppointmentsForDay(dateStr) {
  const start = `${dateStr}T00:00:00`
  const end   = `${dateStr}T23:59:59`
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
      appointment_assignments(id, technician_id, actual_start, actual_end, profiles(id, full_name, color))
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

export async function updateAppointmentTechnicians(appointmentId, technicianIds) {
  const { data: existing } = await supabase
    .from('appointment_assignments')
    .select('technician_id')
    .eq('appointment_id', appointmentId)
  const priorIds = (existing || []).map(r => r.technician_id)

  const { error: de } = await supabase
    .from('appointment_assignments')
    .delete()
    .eq('appointment_id', appointmentId)
  if (de) throw de

  if (technicianIds.length > 0) {
    const rows = technicianIds.map(tid => ({
      appointment_id: appointmentId,
      technician_id:  tid,
    }))
    const { error } = await supabase.from('appointment_assignments').insert(rows)
    if (error) throw error
  }

  const { data: appt } = await supabase.from('appointments').select('job_id').eq('id', appointmentId).maybeSingle()
  if (appt?.job_id) {
    const [names, profile] = await Promise.all([technicianNames(technicianIds), getCurrentProfile().catch(() => null)])
    await logActivity(appt.job_id, 'technician_reassigned', `Technicians updated to ${names.join(', ') || 'none'} by ${profile?.full_name || 'admin'}`).catch(() => {})

    const newlyAdded = technicianIds.filter(tid => !priorIds.includes(tid))
    await notifyNewAssignees(newlyAdded, appt.job_id)
  }
}

export async function deleteAppointment(id) {
  const { error } = await supabase.from('appointments').delete().eq('id', id)
  if (error) throw error
}
