// Where a team member / casual was clocked in: with the technician who
// clocked them in, or dropped off at a job site.
export function teamPlace(shift) {
  if (shift.mode === 'drop_off') return `Dropped off${shift.site_label ? ` at ${shift.site_label}` : ''}`
  return `With the technician${shift.site_label ? ` · ${shift.site_label}` : ''}`
}

// How long a team shift ran, in ms; an open one runs until now.
export function teamShiftMs(shift) {
  const end = shift.clock_out ? new Date(shift.clock_out) : new Date()
  return Math.max(0, end - new Date(shift.clock_in))
}
