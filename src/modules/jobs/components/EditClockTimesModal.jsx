import ClockTimesModal from '../../../shared/components/ClockTimesModal'
import { adjustAssignmentTimes } from '../../planner/services/appointmentService'

// Admin-only correction of one person's on-site clock for one appointment.
// Team members riding this assignment are paid off the same window.
export default function EditClockTimesModal({ assignment, crew = [], onClose, onSaved }) {
  const name = assignment.profiles?.full_name || 'Technician'
  return (
    <ClockTimesModal
      title="Edit on-site clock times"
      personName={name}
      startLabel="Clock in (arrived on site)"
      endLabel="Clock out (left site)"
      openLabel="Still on site"
      start={assignment.actual_start}
      end={assignment.actual_end}
      originalStart={assignment.original_actual_start}
      originalEnd={assignment.original_actual_end}
      note={crew.length > 0
        ? `Also updates the hours for ${crew.map(m => m.full_name).join(', ')}, who were on site with ${name.split(' ')[0]}.`
        : null}
      onSubmit={async ({ start, end, reason }) => {
        await adjustAssignmentTimes(assignment.id, { actual_start: start, actual_end: end }, reason)
        await onSaved?.()
      }}
      onClose={onClose}
    />
  )
}
