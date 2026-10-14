// A signed-off job can be booked again: an admin re-appoints a technician on
// it for another day. jobs.status keeps saying "completed", but that sign-off
// belongs to the earlier visits — the new visit has to behave like a fresh job
// (clock in, today's pictures, sign off again).

const SIGNED_OFF_STATUSES = ['pending_confirmation', 'completed', 'invoiced']

export const isSignedOff = job => SIGNED_OFF_STATUSES.includes(job?.status)

// True when `job` is signed off but this visit still has work to do.
// `clockIns` are the actual_start times of the people on the visit.
//
// Signing a job off marks the visits that had started as 'completed', so a
// visit that isn't is either a later booking or one nobody has clocked into.
// Once somebody has clocked in, only a clock-in after the job's sign-off
// counts — a clock-in before it is just the visit that was signed off.
export function isReturnVisit(job, visitStatus, clockIns = []) {
  if (!isSignedOff(job) || visitStatus === 'completed') return false

  const starts = clockIns.filter(Boolean).map(t => new Date(t).getTime())
  if (starts.length === 0) return true

  const signedOffAt = job.completed_at ? new Date(job.completed_at).getTime() : null
  return signedOffAt !== null && starts.some(t => t > signedOffAt)
}
