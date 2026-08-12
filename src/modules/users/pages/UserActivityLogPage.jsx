import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { LogIn, KeyRound, Clock, Briefcase, Wrench } from 'lucide-react'
import PageContainer from '../../../shared/components/PageContainer.jsx'
import { fetchProfile } from '../services/profileService'
import { fetchUserActivityLog } from '../services/activityLogService'
import { fetchShiftHistory } from '../../../shared/services/workShiftService'
import ClockHoursSummary from '../../../shared/components/ClockHoursSummary'

const CATEGORY_STYLE = {
  login:    { icon: LogIn,     color: 'text-blue-600',   bg: 'bg-blue-50',   label: 'Login' },
  password: { icon: KeyRound,  color: 'text-amber-600',  bg: 'bg-amber-50',  label: 'Password' },
  clock:    { icon: Clock,     color: 'text-emerald-600', bg: 'bg-emerald-50', label: 'Work Shift' },
  job:      { icon: Briefcase, color: 'text-purple-600', bg: 'bg-purple-50', label: 'Job Response' },
  tools:    { icon: Wrench,    color: 'text-orange-600', bg: 'bg-orange-50', label: 'Tool Transaction' },
}

const FILTERS = [
  { key: 'all',      label: 'All' },
  { key: 'login',    label: 'Logins' },
  { key: 'password', label: 'Password' },
  { key: 'clock',    label: 'Clock In/Out' },
  { key: 'job',      label: 'Job Responses' },
  { key: 'tools',    label: 'Tool Transactions' },
]

function formatTimestamp(iso) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

export default function UserActivityLogPage() {
  const { id }   = useParams()
  const navigate = useNavigate()

  const [profile,  setProfile]  = useState(null)
  const [events,   setEvents]   = useState([])
  const [shifts,   setShifts]   = useState([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(null)
  const [filter,   setFilter]   = useState('all')

  useEffect(() => {
    Promise.all([fetchProfile(id), fetchUserActivityLog(id), fetchShiftHistory(id, 200)])
      .then(([profileData, eventData, shiftData]) => {
        setProfile(profileData)
        setEvents(eventData)
        setShifts(shiftData)
      })
      .catch(err => setError(err.message || 'Failed to load activity log'))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <PageContainer><p className="text-sm text-gray-400 mt-8">Loading…</p></PageContainer>
  if (error)   return <PageContainer><p className="text-sm text-red-500 mt-8">{error}</p></PageContainer>
  if (!profile) return <PageContainer><p className="text-sm text-red-500 mt-8">User not found.</p></PageContainer>

  const initial = profile.full_name?.[0]?.toUpperCase() || '?'
  const filtered = filter === 'all' ? events : events.filter(e => e.category === filter)

  const counts = events.reduce((acc, e) => {
    acc[e.category] = (acc[e.category] || 0) + 1
    return acc
  }, {})

  return (
    <PageContainer>

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center font-black text-xl text-white"
            style={{ backgroundColor: profile.color || '#3B82F6' }}
          >
            {initial}
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{profile.full_name}</h1>
            <p className="text-sm text-gray-500 capitalize">{profile.role} · Activity Log</p>
          </div>
        </div>
        <button type="button" onClick={() => navigate('/users/logs')}
          className="bg-blue-500 text-white px-4 py-2 rounded text-sm font-semibold hover:bg-blue-600 transition-colors">
          ← Back
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-6 max-w-2xl mb-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-bold text-gray-900">
          <Clock size={16} /> Hours Summary
        </div>
        <ClockHoursSummary shifts={shifts} />
      </div>

      <div className="flex gap-2 flex-wrap mb-4">
        {FILTERS.map(f => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              filter === f.key
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f.label}{f.key !== 'all' ? ` (${counts[f.key] || 0})` : ` (${events.length})`}
          </button>
        ))}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-6 max-w-2xl">
        {filtered.length === 0 ? (
          <p className="text-sm text-gray-400">No activity recorded yet.</p>
        ) : (
          <ul className="space-y-4">
            {filtered.map(e => {
              const style = CATEGORY_STYLE[e.category] || CATEGORY_STYLE.login
              const Icon = style.icon
              return (
                <li key={e.id} className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${style.bg}`}>
                    <Icon size={16} className={style.color} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900">{e.label}</p>
                    {e.detail && <p className="text-xs text-gray-500 mt-0.5">{e.detail}</p>}
                    <p className="text-xs text-gray-400 mt-0.5">{formatTimestamp(e.at)}</p>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

    </PageContainer>
  )
}
