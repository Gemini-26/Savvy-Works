import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Users, Phone, Clock, MapPin, Plus } from 'lucide-react'
import PageContainer from '../../../shared/components/PageContainer.jsx'
import OnSiteHoursSummary from '../../../shared/components/OnSiteHoursSummary'
import OnSiteSessionsList from '../../../shared/components/OnSiteSessionsList'
import { fetchTeamMember, fetchTeamMemberOnSiteSessions } from '../services/teamMembersService'
import ClockTimesModal from '../../../shared/components/ClockTimesModal'
import AddTeamShiftModal from '../../../shared/components/AddTeamShiftModal'
import AddOnSiteSessionsModal from '../../../shared/components/AddOnSiteSessionsModal'
import TeamShiftAdjustedNote from '../../../shared/components/TeamShiftAdjustedNote'
import { fetchTeamMemberShifts, adjustTeamShiftTimes, onTeamShiftChange } from '../../../shared/services/teamShiftService'
import { teamPlace } from '../../../shared/utils/teamShiftText'
import { formatDate, formatTime } from '../../../shared/utils/formatDate'
import { useCurrentUser } from '../../../hooks/useCurrentUser'

function formatSpan(from, to) {
  const minutes = Math.max(0, Math.round(((to ? new Date(to) : new Date()) - new Date(from)) / 60000))
  const h = Math.floor(minutes / 60)
  return h > 0 ? `${h}h ${String(minutes % 60).padStart(2, '0')}m` : `${minutes}m`
}

// A team member (labourer/helper) has no login. Their record has two parts:
// the clock-ins a technician did for them from the floating clock button
// (their day), and the on-site sessions a technician logged them onto, with
// the hours those add up to.
export default function TeamMemberLogPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { isAdmin } = useCurrentUser()

  const [member, setMember] = useState(null)
  const [sessions, setSessions] = useState([])
  const [clockIns, setClockIns] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [editing, setEditing] = useState(null)
  const [adding, setAdding] = useState(false)
  const [addingSessions, setAddingSessions] = useState(false)

  useEffect(() => {
    Promise.all([fetchTeamMember(id), fetchTeamMemberOnSiteSessions(id), fetchTeamMemberShifts(id)])
      .then(([memberData, sessionData, shiftData]) => {
        setMember(memberData)
        setSessions(sessionData)
        setClockIns(shiftData)
      })
      .catch(err => setError(err.message || 'Failed to load team member log'))
      .finally(() => setLoading(false))
  }, [id])

  // An admin corrected a time (or someone clocked this person in/out): refetch
  // just the clock-ins.
  useEffect(() => onTeamShiftChange(() => {
    fetchTeamMemberShifts(id).then(setClockIns).catch(() => {})
  }), [id])

  if (loading) return <PageContainer><p className="text-sm text-gray-400 mt-8">Loading…</p></PageContainer>
  if (error)   return <PageContainer><p className="text-sm text-red-500 mt-8">{error}</p></PageContainer>
  if (!member) return <PageContainer><p className="text-sm text-red-500 mt-8">Team member not found.</p></PageContainer>

  return (
    <PageContainer>

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center">
            <Users size={20} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{member.full_name}</h1>
            <p className="text-sm text-gray-500">
              {member.is_casual ? 'Casual' : (member.role_title || 'Team member')} · On-Site Log
              {!member.is_active && !member.is_casual && <span className="text-gray-400"> · Inactive</span>}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <button type="button" onClick={() => navigate(`/users/team/${id}/documents`)}
              className="bg-indigo-600 text-white px-4 py-2 rounded text-sm font-semibold hover:bg-indigo-700 transition-colors">
              📁 Documents
            </button>
          )}
          <button type="button" onClick={() => navigate('/users/team/active')}
            className="bg-blue-500 text-white px-4 py-2 rounded text-sm font-semibold hover:bg-blue-600 transition-colors">
            ← Back
          </button>
        </div>
      </div>

      {member.phone && (
        <p className="flex items-center gap-1.5 text-sm text-gray-600 mb-4">
          <Phone size={13} className="text-gray-400" /> {member.phone}
        </p>
      )}

      <div className="bg-white border border-gray-200 rounded-xl p-6 max-w-2xl mb-4">
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="flex items-center gap-2 text-sm font-bold text-gray-900">
            <Clock size={16} /> Clock-ins ({clockIns.length})
          </div>
          {isAdmin && (
            <button type="button" onClick={() => setAdding(true)}
              className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700">
              <Plus size={14} /> Add times
            </button>
          )}
        </div>
        <p className="text-[11px] text-gray-400 mb-3">
          Clocked in and out by a technician from the clock button — either with them, or when dropping them off at a site.
        </p>
        {clockIns.length === 0 ? (
          <p className="text-sm text-gray-400">This team member hasn't been clocked in yet.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {clockIns.map(c => (
              <div key={c.id} className="py-2.5 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">
                    {formatDate(c.clock_in)} · {formatTime(c.clock_in)} – {c.clock_out ? formatTime(c.clock_out) : <span className="text-emerald-600">still clocked in</span>}
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    {teamPlace(c)}
                    {c.clocked_in_by_profile?.full_name ? ` · In by ${c.clocked_in_by_profile.full_name}` : ''}
                    {c.clock_out && c.clocked_out_by_profile?.full_name ? ` · Out by ${c.clocked_out_by_profile.full_name}` : ''}
                  </p>
                  <TeamShiftAdjustedNote shift={c} />
                </div>
                <div className="text-right shrink-0">
                  <span className="text-sm font-semibold text-gray-700 tabular-nums">{formatSpan(c.clock_in, c.clock_out)}</span>
                  {isAdmin && (
                    <button type="button" onClick={() => setEditing(c)} className="block ml-auto text-xs font-semibold text-blue-600 hover:text-blue-700">
                      Edit times
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-6 max-w-2xl mb-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-bold text-gray-900">
          <Clock size={16} /> Hours On Site
        </div>
        <OnSiteHoursSummary sessions={sessions} />
        <p className="text-[11px] text-gray-400">
          Team members clock in and out with the technician who brought them, so their hours
          are that technician's on-site window for each job.
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-6 max-w-2xl">
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2 text-sm font-bold text-gray-900">
            <MapPin size={16} /> On-Site Sessions ({sessions.length})
          </div>
          {isAdmin && (
            <button type="button" onClick={() => setAddingSessions(true)}
              className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700">
              <Plus size={14} /> Add on-site hours
            </button>
          )}
        </div>
        <OnSiteSessionsList
          sessions={sessions}
          renderWith={s => `With ${s.technician_name}${s.site ? ` · ${s.site}` : ''}`}
          onOpenJob={s => s.job_id && navigate(`/jobs/${s.job_id}`)}
          emptyLabel="This team member hasn't been logged on site yet."
        />
      </div>

      {adding && <AddTeamShiftModal member={member} onClose={() => setAdding(false)} />}

      {addingSessions && (
        <AddOnSiteSessionsModal
          member={member}
          mySessions={sessions}
          onSaved={async () => setSessions(await fetchTeamMemberOnSiteSessions(id))}
          onClose={() => setAddingSessions(false)}
        />
      )}

      {editing && (
        <ClockTimesModal
          title={member.is_casual ? 'Edit casual clock-in' : 'Edit team member clock-in'}
          personName={member.full_name}
          startLabel="Clocked in"
          endLabel="Clocked out"
          openLabel="Still clocked in"
          start={editing.clock_in}
          end={editing.clock_out}
          originalStart={editing.original_clock_in}
          originalEnd={editing.original_clock_out}
          note={`${teamPlace(editing)}${editing.clocked_in_by_profile?.full_name ? ` · clocked in by ${editing.clocked_in_by_profile.full_name}` : ''}. Set a clock-out to close one that was never tapped.`}
          onSubmit={async ({ start, end, reason }) => {
            await adjustTeamShiftTimes(editing.id, { clock_in: start, clock_out: end }, reason)
          }}
          onClose={() => setEditing(null)}
        />
      )}

    </PageContainer>
  )
}
