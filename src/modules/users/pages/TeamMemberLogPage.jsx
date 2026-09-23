import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Users, Phone, Clock, MapPin } from 'lucide-react'
import PageContainer from '../../../shared/components/PageContainer.jsx'
import OnSiteHoursSummary from '../../../shared/components/OnSiteHoursSummary'
import OnSiteSessionsList from '../../../shared/components/OnSiteSessionsList'
import { fetchTeamMember, fetchTeamMemberOnSiteSessions } from '../services/teamMembersService'

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
        <OnSiteSessionsList
          sessions={sessions}
          renderWith={s => `With ${s.technician_name}${s.site ? ` · ${s.site}` : ''}`}
          onOpenJob={s => s.job_id && navigate(`/jobs/${s.job_id}`)}
          emptyLabel="This team member hasn't been logged on site yet."
        />
      </div>

    </PageContainer>
  )
}
