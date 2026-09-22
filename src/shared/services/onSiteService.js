import { supabase } from '../../lib/supabase'

// On-site time lives on appointment_assignments (actual_start/actual_end) —
// one row per person per appointment. This is deliberately separate from
// work_shifts, which is the clock in/out for the whole working day: a
// technician can be clocked in for 9 hours but only 5 of those on site.

// Every on-site session a technician (a real app user) has clocked,
// newest first, with the job it belongs to and who came along.
export async function fetchOnSiteSessions(technicianId, limit = 200) {
  const { data, error } = await supabase
    .from('appointment_assignments')
    .select(`
      id, actual_start, actual_end,
      appointments(job_id, jobs(job_ref, title)),
      assignment_team_members(team_members(id, full_name, role_title))
    `)
    .eq('technician_id', technicianId)
    .not('actual_start', 'is', null)
    .order('actual_start', { ascending: false })
    .limit(limit)
  if (error) throw error

  return (data || []).map(row => ({
    id: row.id,
    actual_start: row.actual_start,
    actual_end: row.actual_end,
    job_id: row.appointments?.job_id,
    job_ref: row.appointments?.jobs?.job_ref,
    job_title: row.appointments?.jobs?.title,
    team_members: (row.assignment_team_members || []).map(t => t.team_members).filter(Boolean),
  }))
}
