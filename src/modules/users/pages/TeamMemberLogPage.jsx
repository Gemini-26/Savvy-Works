import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Users, Phone, Clock, MapPin } from 'lucide-react'
import PageContainer from '../../../shared/components/PageContainer.jsx'
import OnSiteHoursSummary from '../../../shared/components/OnSiteHoursSummary'
import { fetchTeamMember, fetchTeamMemberOnSiteSessions } from '../services/teamMembersService'
import { formatDate, formatTime, toDateStr } from '../../../shared/utils/formatDate'
import { formatHoursDuration } from '../../../shared/utils/shiftSummary'

// A team member (labourer/helper) has no login, so there is no day shift to
// show — their record is purely the on-site sessions a technician logged them
// onto, and the hours those add up to.
export default function TeamMemberLogPage() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [member, setMember] = useState(null)
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    Promise.all([fetchTeamMember(id), fetchTeamMemberOnSiteSessions(id)])
      .then(([memberData, sessionData]) => {
        setMember(memberData)
        setSessions(sessionData)
      })
      .catch(err => setError(err.message || 'Failed to load team member log'))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <PageContainer><p className="text-sm text-gray-400 mt-8">Loading…</p></PageContainer>
  if (error)   return <PageContainer><p className="text-sm text-red-500 mt-8">{error}</p></PageContainer>
  if (!member) return <PageContainer><p className="text-sm text-red-500 mt-8">Team member not found.</p></PageContainer>

  const byDay = sessions.reduce((acc, s) => {
    const key = toDateStr(s.actual_start)
    acc[key] = acc[key] || []
    acc[key].push(s)
    return acc
  }, {})
  const days = Object.keys(byDay).sort((a, b) => b.localeCompare(a))

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
              {member.role_title || 'Team member'} · On-Site Log
              {!member.is_active && <span className="text-gray-400"> · Inactive</span>}
            </p>
          </div>
        </div>
        <button type="button" onClick={() => navigate('/users/team/active')}
          className="bg-blue-500 text-white px-4 py-2 rounded text-sm font-semibold hover:bg-blue-600 transition-colors">
          ← Back
        </button>
      </div>

      {member.phone && (
        <p className="flex items-center gap-1.5 text-sm text-gray-600 mb-4">
          <Phone size={13} className="text-gray-400" /> {member.phone}
        </p>
      )}

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
        <div className="flex items-center gap-2 text-sm font-bold text-gray-900 mb-4">
          <MapPin size={16} /> On-Site Sessions ({sessions.length})
        </div>
        {days.length === 0 ? (
          <p className="text-sm text-gray-400">This team member hasn't been logged on site yet.</p>
        ) : (
          <div className="space-y-4">
            {days.map(day => {
              const entries = byDay[day]
              const totalMs = entries.reduce((sum, s) => s.actual_end ? sum + (new Date(s.actual_end) - new Date(s.actual_start)) : sum, 0)
              return (
                <div key={day} className="border-t border-gray-100 pt-3 first:border-t-0 first:pt-0">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-semibold text-gray-500">{formatDate(day)}</p>
                    <p className="text-xs font-semibold text-gray-700">{formatHoursDuration(totalMs)}</p>
                  </div>
                  {entries.map(s => (
                    <div key={s.id} className="flex items-start justify-between gap-3 py-1">
                      <div className="min-w-0">
                        <button
                          type="button"
                          onClick={() => s.job_id && navigate(`/jobs/${s.job_id}`)}
                          className="text-sm text-blue-600 hover:text-blue-700 font-medium truncate text-left"
                        >
                          {s.job_title || s.job_ref || 'Job'}
                        </button>
                        <p className="text-xs text-gray-400 truncate">
                          With {s.technician_name}{s.site ? ` · ${s.site}` : ''}
                        </p>
                      </div>
                      <p className="text-xs text-gray-500 shrink-0 text-right">
                        {formatTime(s.actual_start)} – {s.actual_end ? formatTime(s.actual_end) : 'On site now'}
                        {s.actual_end && (
                          <span className="block text-gray-400">
                            {formatHoursDuration(new Date(s.actual_end) - new Date(s.actual_start))}
                          </span>
                        )}
                      </p>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        )}
      </div>

    </PageContainer>
  )
}
