const clockTime = iso => new Date(iso).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })

// "Adjusted by an admin · originally in 07:45 · reason" under a team member's
// (or casual's) clock-in an admin corrected. The database keeps the first
// values in original_clock_in / original_clock_out; the reason is the note.
export default function TeamShiftAdjustedNote({ shift }) {
  if (!shift.original_clock_in && !shift.original_clock_out) return null
  return (
    <p className="text-xs text-amber-600">
      Adjusted by an admin
      {shift.original_clock_in && ` · originally in ${clockTime(shift.original_clock_in)}`}
      {shift.original_clock_out && ` · out ${clockTime(shift.original_clock_out)}`}
      {shift.note && <span className="text-gray-400"> · {shift.note}</span>}
    </p>
  )
}
