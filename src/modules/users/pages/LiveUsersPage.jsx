import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Radio, MapPin, Briefcase, Clock, Satellite } from 'lucide-react'
import PageContainer from '../../../shared/components/PageContainer.jsx'
import PageHeader from '../../../shared/components/PageHeader'
import EmptyState from '../../../shared/components/EmptyState'
import DashboardCharts from '../../../shared/components/DashboardCharts.jsx'
import LiveUsersMap from '../components/LiveUsersMap.jsx'
import { fetchLiveUsers } from '../services/liveUsersService'
import { onWorkShiftChange } from '../../../shared/services/workShiftService'
import { formatHoursDuration } from '../../../shared/utils/shiftSummary'
import { reverseGeocode } from '../../../shared/utils/geocode'

const POLL_MS = 20000
const AVATAR_COLORS = ['#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EF4444', '#14B8A6', '#6366F1', '#EC4899']

function Avatar({ name, color }) {
  const bg = color || AVATAR_COLORS[name?.charCodeAt(0) % AVATAR_COLORS.length] || '#3B82F6'
  return (
    <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white text-sm uppercase flex-shrink-0"
      style={{ backgroundColor: bg }}>
      {name?.[0] ?? '?'}
    </div>
  )
}

function LiveDuration({ since }) {
  const [, tick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => tick(n => n + 1), 1000)
    return () => clearInterval(id)
  }, [])
  return <span className="tabular-nums">{formatHoursDuration(Date.now() - new Date(since).getTime())}</span>
}

function GpsAddress({ lat, lng }) {
  const [address, setAddress] = useState(undefined)

  useEffect(() => {
    let cancelled = false
    setAddress(undefined)
    reverseGeocode(lat, lng).then(a => { if (!cancelled) setAddress(a) })
    return () => { cancelled = true }
  }, [lat, lng])

  if (address === undefined) return <span className="text-gray-400"> (looking up address…)</span>
  if (!address) return null
  return <span className="text-gray-500"> ({address})</span>
}

export default function LiveUsersPage() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  async function load() {
    try {
      const data = await fetchLiveUsers()
      setUsers(data)
      setError(null)
    } catch (err) {
      setError(err.message || 'Failed to load live users')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    const interval = setInterval(load, POLL_MS)
    const unsubscribe = onWorkShiftChange(load)
    return () => { clearInterval(interval); unsubscribe() }
  }, [])

  const onJobCount = users.filter(u => u.onJob).length
  const idleCount = users.length - onJobCount

  const roleCounts = users.reduce((acc, u) => {
    acc[u.role] = (acc[u.role] || 0) + 1
    return acc
  }, {})

  const bar = {
    title: 'Online now',
    color: '#3B82F6',
    data: [
      { name: 'On a job', value: onJobCount },
      { name: 'Online, idle', value: idleCount },
    ],
  }
  const line = {
    title: 'Hours online (this session)',
    color: '#10B981',
    data: users.map(u => ({
      name: u.fullName.split(' ')[0],
      value: Math.round((Date.now() - new Date(u.clockIn).getTime()) / 3600000 * 10) / 10,
    })),
  }
  const pie = {
    title: 'Online by role',
    data: Object.entries(roleCounts).map(([name, value]) => ({ name, value })),
  }

  return (
    <PageContainer>
      <PageHeader title="Live Users" subtitle="Who's online right now, what they're working on, and where they're headed next" />

      <div className="flex items-center gap-2 text-sm">
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
        </span>
        <span className="text-gray-600">
          <span className="font-semibold text-gray-900">{users.length}</span> user{users.length === 1 ? '' : 's'} online now
        </span>
      </div>

      <DashboardCharts bar={bar} line={line} pie={pie} loading={loading} />

      {!loading && users.length > 0 && <LiveUsersMap users={users} />}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>
      )}

      {loading ? (
        <p className="text-sm text-gray-400">Loading live users…</p>
      ) : users.length === 0 ? (
        <EmptyState title="No one is clocked in" description="Live users will appear here as soon as someone clocks in for work." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {users.map(u => (
            <div key={u.technicianId} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <Avatar name={u.fullName} color={u.color} />
                  <div>
                    <Link to={`/users/${u.technicianId}`} className="font-semibold text-gray-900 hover:text-blue-600">
                      {u.fullName}
                    </Link>
                    <div className="text-xs text-gray-400 capitalize">{u.role}</div>
                  </div>
                </div>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${u.onJob ? 'bg-blue-50 text-blue-700' : 'bg-green-50 text-green-700'}`}>
                  <Radio size={11} />
                  {u.onJob ? 'On a job' : 'Online'}
                </span>
              </div>

              <div className="mt-4 space-y-2 text-sm">
                <div className="flex items-center gap-2 text-gray-600">
                  <Clock size={14} className="text-gray-400 flex-shrink-0" />
                  Online for <LiveDuration since={u.clockIn} />
                </div>

                <div className="flex items-center gap-2 text-gray-600">
                  <Satellite size={14} className="text-gray-400 flex-shrink-0" />
                  {u.lastLat != null && u.lastLocationAgeMs < 15 * 60 * 1000 ? (
                    <span className="text-emerald-600">
                      GPS live ({Math.round(u.lastLocationAgeMs / 60000)}m ago)
                      <GpsAddress lat={u.lastLat} lng={u.lastLng} />
                    </span>
                  ) : (
                    <span className="text-gray-400">No live GPS fix</span>
                  )}
                </div>

                <div className="flex items-start gap-2 text-gray-600">
                  <MapPin size={14} className="text-gray-400 flex-shrink-0 mt-0.5" />
                  {u.currentJob ? (
                    <span>
                      <Link to={`/jobs/${u.currentJob.id}`} className="text-gray-900 font-medium hover:text-blue-600">
                        {u.currentJob.title ?? u.currentJob.ref}
                      </Link>
                      {u.currentJob.location && <span className="text-gray-500"> — {u.currentJob.location}</span>}
                    </span>
                  ) : (
                    <span className="text-gray-400">No current job site</span>
                  )}
                </div>

                <div className="flex items-start gap-2 text-gray-600">
                  <Briefcase size={14} className="text-gray-400 flex-shrink-0 mt-0.5" />
                  {u.nextJob ? (
                    <span>
                      Next: <Link to={`/jobs/${u.nextJob.id}`} className="text-gray-900 font-medium hover:text-blue-600">
                        {u.nextJob.title ?? u.nextJob.ref}
                      </Link>
                      {u.nextJob.location && <span className="text-gray-500"> — {u.nextJob.location}</span>}
                    </span>
                  ) : (
                    <span className="text-gray-400">No upcoming job scheduled</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </PageContainer>
  )
}
