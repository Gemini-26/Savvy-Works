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
      shiftId: shift.id,
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

const FALLBACK_COLORS = ['#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EF4444', '#14B8A6', '#6366F1', '#EC4899']

// A technician's colour: their profile colour, or a stable fallback from their
// id so the same person is always the same colour on the list and the map.
export function technicianColor(profile, id) {
  if (profile?.color) return profile.color
  const key = String(id || '')
  let hash = 0
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0
  return FALLBACK_COLORS[hash % FALLBACK_COLORS.length]
}

// Every site being worked right now (someone clocked in, or status On Site)
// plus every upcoming visit, each carrying its assigned technicians.
export async function fetchSiteVisits() {
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)

  const { data, error } = await supabase
    .from('appointments')
    .select(`
      id, status, scheduled_start, scheduled_end,
      jobs(id, job_ref, title, archived_at, site_address, site_city, site_county, site_postcode),
      appointment_assignments(technician_id, actual_start, actual_end, profiles(id, full_name, color))
    `)
    .not('status', 'in', '(cancelled,completed,declined,invoiced)')
    .gte('scheduled_end', startOfToday.toISOString())
    .order('scheduled_start', { ascending: true })
    .limit(300)
  if (error) throw error

  const now = Date.now()
  return (data || [])
    .filter(a => a.jobs && !a.jobs.archived_at)
    .map(a => {
      const assignments = a.appointment_assignments || []
      const technicians = assignments.map(x => ({
        id: x.technician_id,
        name: x.profiles?.full_name ?? 'Unknown',
        color: technicianColor(x.profiles, x.technician_id),
      }))
      const current = a.status === 'on_site' || assignments.some(x => x.actual_start && !x.actual_end)
      return {
        id: a.id,
        jobId: a.jobs.id,
        title: a.jobs.title ?? a.jobs.job_ref,
        ref: a.jobs.job_ref,
        location: siteAddress(a.jobs),
        scheduledStart: a.scheduled_start,
        scheduledEnd: a.scheduled_end,
        status: a.status,
        technicians,
        color: technicians[0]?.color ?? '#9CA3AF',
        current,
      }
    })
    .filter(v => v.current || new Date(v.scheduledEnd ?? v.scheduledStart).getTime() >= now)
}
