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
    // `*` rather than a column list so auto_clocked_out comes along once its
    // migration has run — and the screen still loads if this code is ever live first.
    .select(`
      *,
      appointments(id, job_id, jobs(job_ref, title, site_address, site_city)),
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
    auto_clocked_out: !!row.auto_clocked_out,
    // Both ids travel with the session: admin screens open a job by job_id,
    // the technician portal opens the same work by appointment id.
    appointment_id: row.appointments?.id,
    job_id: row.appointments?.job_id,
    job_ref: row.appointments?.jobs?.job_ref,
    job_title: row.appointments?.jobs?.title,
    site: [row.appointments?.jobs?.site_address, row.appointments?.jobs?.site_city].filter(Boolean).join(', '),
    team_members: (row.assignment_team_members || []).map(t => t.team_members).filter(Boolean),
  }))
}
