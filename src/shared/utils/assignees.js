import { supabase } from '../../lib/supabase'
import { idsMatching } from './listFilters'

// Ids of jobs any of the given staff are on — assigned to one of the job's
// appointments (how technicians are normally allocated) or set as its owner.
export async function jobIdsForStaff(staffIds) {
  if (!staffIds.length) return []
  const [{ data: appts, error: e1 }, { data: owned, error: e2 }] = await Promise.all([
    supabase
      .from('appointments')
      .select('job_id, appointment_assignments!inner(technician_id)')
      .in('appointment_assignments.technician_id', staffIds),
    supabase.from('jobs').select('id').in('assigned_to', staffIds),
  ])
  if (e1) throw e1
  if (e2) throw e2
  return [...new Set([...(appts ?? []).map(a => a.job_id), ...(owned ?? []).map(j => j.id)].filter(Boolean))]
}

// Ids of jobs someone whose name contains `term` is on.
export async function jobIdsForStaffNamed(term) {
  return jobIdsForStaff(await idsMatching('profiles', ['full_name'], term))
}

// Embed for everyone on a job — its owner plus staff on its appointments.
// Use inside a jobs select, e.g. `jobs(${JOB_ASSIGNEES_SELECT})`, or at the top
// level of a query on jobs.
export const JOB_ASSIGNEES_SELECT =
  'assigned_to, owner:profiles!assigned_to(full_name), appointments(status, appointment_assignments(technician_id, profiles(full_name)))'

// De-duplicated names of everyone on a job, skipping cancelled appointments,
// for the "Assigned To" columns.
export function jobAssignees(job) {
  if (!job) return []
  const people = new Map()
  if (job.owner) people.set(job.assigned_to, job.owner.full_name)
  for (const appt of job.appointments ?? []) {
    if (appt.status === 'cancelled') continue
    for (const asg of appt.appointment_assignments ?? []) {
      if (asg.profiles) people.set(asg.technician_id, asg.profiles.full_name)
    }
  }
  return [...people.values()].filter(Boolean)
}
