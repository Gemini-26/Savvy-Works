import { useState } from 'react'
import ClockTimesModal from './ClockTimesModal'
import JobSitePicker from './JobSitePicker'
import { addTeamShift } from '../services/teamShiftService'
import { useCurrentUser } from '../../hooks/useCurrentUser'

// Admin adds a clock-in for a team member that nobody tapped — e.g. the
// technician forgot to clock them in. Same dialog as correcting times, plus
// the job they worked on and whether they were with the technician or left
// at the site. Leave the clock-out empty to put them on the clock now.
export default function AddTeamShiftModal({ member, onClose }) {
  const { profile } = useCurrentUser()
  const [job, setJob] = useState(null)
  const [mode, setMode] = useState('with_technician')

  return (
    <ClockTimesModal
      title={member.is_casual ? 'Add casual clock-in' : 'Add team member clock-in'}
      personName={member.full_name}
      startLabel="Clocked in"
      endLabel="Clocked out"
      openLabel="Still clocked in"
      requireStart
      submitLabel="Add times"
      note="For a day nobody clocked them in. It is marked as added by an admin on their record."
      onSubmit={async ({ start, end, reason }) => {
        await addTeamShift(member.id, {
          clock_in: start,
          clock_out: end,
          job,
          mode,
          clockedOutBy: profile?.id ?? null,
        }, reason)
      }}
      onClose={onClose}
    >
      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1">Were they…</label>
        <select value={mode} onChange={e => setMode(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
          <option value="with_technician">With the technician</option>
          <option value="drop_off">Dropped off at the site</option>
        </select>
      </div>
      <JobSitePicker value={job} onChange={setJob} />
    </ClockTimesModal>
  )
}
