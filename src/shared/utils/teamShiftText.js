// Where a team member / casual was clocked in: with the technician who
// clocked them in, or dropped off at a job site.
export function teamPlace(shift) {
  if (shift.mode === 'drop_off') return `Dropped off${shift.site_label ? ` at ${shift.site_label}` : ''}`
  return `With the technician${shift.site_label ? ` · ${shift.site_label}` : ''}`
}

// A clock-in an admin typed in afterwards (nobody tapped the clock) starts its
// note with this, so the timesheets can say so. The database has no column for
// it; the note is the only free text on the row.
export const ADDED_NOTE = 'Added by an admin'

export function isAddedByAdmin(shift) {
  return !!shift?.note && shift.note.startsWith(ADDED_NOTE)
}

// How long a team shift ran, in ms; an open one runs until now.
export function teamShiftMs(shift) {
  const end = shift.clock_out ? new Date(shift.clock_out) : new Date()
  return Math.max(0, end - new Date(shift.clock_in))
}
