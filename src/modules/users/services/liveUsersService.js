import { supabase } from '../../../lib/supabase'
import { fetchActiveShiftsForCompany } from '../../../shared/services/workShiftService'

function siteAddress(job) {
  if (!job) return null
  return [job.site_address, job.site_city, job.site_county, job.site_postcode].filter(Boolean).join(', ') || null
}

// One row per currently clocked-in technician, enriched with their current
// in-progress job (for "where they are") and their next scheduled job.
export async function fetchLiveUsers() {
  const shifts = await fetchActiveShiftsForCompany()
  if (shifts.length === 0) return []

  const nowIso = new Date().toISOString()

  const rows = await Promise.all(shifts.map(async (shift) => {
    const technicianId = shift.technician_id

    // "On a job" isn't tracked on jobs.status (nothing ever sets it to
    // in_progress) — technicians clock in/out per appointment instead, via
    // appointment_assignments.actual_start/actual_end. An open assignment
    // (actual_start set, actual_end still null) is the real "on site now" signal.
    const [{ data: currentAssignments }, { data: nextAppointments }] = await Promise.all([
      supabase
        .from('appointment_assignments')
        .select('actual_start, appointments!inner(jobs(id, job_ref, title, site_address, site_city, site_county, site_postcode))')
        .eq('technician_id', technicianId)
        .not('actual_start', 'is', null)
        .is('actual_end', null)
        .order('actual_start', { ascending: false })
        .limit(1),
      supabase
        .from('appointments')
        .select('scheduled_start, jobs(id, job_ref, title, site_address, site_city, site_county, site_postcode), appointment_assignments!inner(technician_id)')
        .eq('appointment_assignments.technician_id', technicianId)
        .gt('scheduled_start', nowIso)
        .order('scheduled_start', { ascending: true })
        .limit(1),
    ])

    const currentJob = currentAssignments?.[0]?.appointments?.jobs ?? null
    const nextAppt = nextAppointments?.[0] ?? null
    const nextJob = nextAppt?.jobs ? { ...nextAppt.jobs, scheduled_for: nextAppt.scheduled_start } : null

    return {
      technicianId,
      fullName: shift.profiles?.full_name ?? 'Unknown',
      role: shift.profiles?.role ?? 'technician',
      color: shift.profiles?.color ?? null,
      clockIn: shift.clock_in,
      lastLat: shift.last_lat ?? null,
      lastLng: shift.last_lng ?? null,
      lastLocationAgeMs: shift.last_location_at ? Date.now() - new Date(shift.last_location_at).getTime() : Infinity,
      onJob: !!currentJob,
      currentJob: currentJob ? {
        id: currentJob.id,
        ref: currentJob.job_ref,
        title: currentJob.title,
        location: siteAddress(currentJob),
      } : null,
      nextJob: nextJob ? {
        id: nextJob.id,
        ref: nextJob.job_ref,
        title: nextJob.title,
        scheduledFor: nextJob.scheduled_for,
        location: siteAddress(nextJob),
      } : null,
    }
  }))

  return rows.sort((a, b) => new Date(a.clockIn) - new Date(b.clockIn))
}
