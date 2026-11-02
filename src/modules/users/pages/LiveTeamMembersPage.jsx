import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Radio, MapPin, Clock, Satellite, LogOut, UserCheck, Phone } from 'lucide-react'
import PageContainer from '../../../shared/components/PageContainer.jsx'
import PageHeader from '../../../shared/components/PageHeader'
import EmptyState from '../../../shared/components/EmptyState'
import DashboardCharts from '../../../shared/components/DashboardCharts.jsx'
import LiveTeamMembersMap from '../components/LiveTeamMembersMap.jsx'
import { technicianColor } from '../services/liveUsersService'
import { fetchLiveTeamMembers, clockOutTeamMember, onTeamShiftChange } from '../../../shared/services/teamShiftService'
import { formatHoursDuration } from '../../../shared/utils/shiftSummary'
import { reverseGeocode } from '../../../shared/utils/geocode'
import { useCurrentUser } from '../../../hooks/useCurrentUser'

const POLL_MS = 20000
const AVATAR_COLORS = ['#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EF4444', '#14B8A6', '#6366F1', '#EC4899']

function Avatar({ name }) {
  const bg = AVATAR_COLORS[name?.charCodeAt(0) % AVATAR_COLORS.length] || '#3B82F6'
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

// The street address of the spot the phone was at when they were clocked in.
function ClockInAddress({ lat, lng }) {
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

const clockTime = iso => new Date(iso).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })

export default function LiveTeamMembersPage() {
  const { isAdmin } = useCurrentUser()
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [confirmingId, setConfirmingId] = useState(null)
  const [clockingOutId, setClockingOutId] = useState(null)

  async function load() {
    try {
      setMembers(await fetchLiveTeamMembers())
      setError(null)
    } catch (err) {
      setError(err.message || 'Failed to load live team members')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    const interval = setInterval(load, POLL_MS)
    const unsubscribe = onTeamShiftChange(load)
    return () => { clearInterval(interval); unsubscribe() }
  }, [])

  async function handleClockOut(m) {
    setClockingOutId(m.shiftId)
    setError(null)
    try {
      await clockOutTeamMember(m.shiftId)
      setMembers(prev => prev.filter(x => x.shiftId !== m.shiftId))
    } catch (err) {
      setError(err.message || 'Failed to clock out team member')
    } finally {
      setClockingOutId(null)
      setConfirmingId(null)
    }
  }

  const droppedOff = members.filter(m => m.dropOff).length
  const byTechnician = members.reduce((acc, m) => {
    const name = m.clockedBy?.name ?? 'Unknown'
    acc[name] = (acc[name] || 0) + 1
    return acc
  }, {})

  const bar = {
    title: 'Clocked in now',
    color: '#3B82F6',
    data: [
      { name: 'With a technician', value: members.length - droppedOff },
      { name: 'Dropped off', value: droppedOff },
    ],
  }
  const line = {
    title: 'Hours on the clock',
    color: '#10B981',
    data: members.map(m => ({
      name: m.fullName.split(' ')[0],
      value: Math.round((Date.now() - new Date(m.clockIn).getTime()) / 3600000 * 10) / 10,
    })),
  }
  const pie = {
    title: 'Clocked in by',
    data: Object.entries(byTechnician).map(([name, value]) => ({ name, value })),
  }

  return (
    <PageContainer>
      <PageHeader title="Live Team Members" subtitle="Which team members are clocked in right now, who clocked them in, and where" />

      <div className="flex items-center gap-2 text-sm">
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
        </span>
        <span className="text-gray-600">
          <span className="font-semibold text-gray-900">{members.length}</span> team member{members.length === 1 ? '' : 's'} clocked in now
          {members.length > 0 && <span className="text-gray-400"> · {droppedOff} dropped off</span>}
        </span>
      </div>

      <DashboardCharts bar={bar} line={line} pie={pie} loading={loading} />

      {!loading && members.length > 0 && <LiveTeamMembersMap members={members} />}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>
      )}

      {loading ? (
        <p className="text-sm text-gray-400">Loading live team members…</p>
      ) : members.length === 0 ? (
        <EmptyState
          title="No team members are clocked in"
          description="They appear here as soon as a technician clocks them in from the clock button."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {members.map(m => (
            <div key={m.shiftId} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar name={m.fullName} />
                  <div className="min-w-0">
                    <Link to={`/users/team/${m.teamMemberId}`} className="font-semibold text-gray-900 hover:text-blue-600">
                      {m.fullName}
                    </Link>
                    <div className="text-xs text-gray-400">
                      {m.roleTitle || 'Team member'}
                      {m.isCasual && (
                        <span className="ml-1.5 text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0.5">Casual</span>
                      )}
                    </div>
                  </div>
                </div>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${m.dropOff ? 'bg-blue-50 text-blue-700' : 'bg-green-50 text-green-700'}`}>
                  <Radio size={11} />
                  {m.dropOff ? 'Dropped off' : 'With technician'}
                </span>
              </div>

              {isAdmin && (
                <div className="mt-3">
                  {confirmingId === m.shiftId ? (
                    <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                      <span className="text-xs text-red-700">Clock out {m.fullName.split(' ')[0]} now?</span>
                      <button
                        onClick={() => handleClockOut(m)}
                        disabled={clockingOutId === m.shiftId}
                        className="ml-auto text-xs font-semibold text-red-700 hover:text-red-800 disabled:opacity-50"
                      >
                        {clockingOutId === m.shiftId ? 'Clocking out…' : 'Yes, clock out'}
                      </button>
                      <button
                        onClick={() => setConfirmingId(null)}
                        className="text-xs font-medium text-gray-500 hover:text-gray-700"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmingId(m.shiftId)}
                      className="flex items-center gap-1.5 text-xs font-medium text-red-600 hover:text-red-700"
                    >
                      <LogOut size={12} /> Clock out
                    </button>
                  )}
                </div>
              )}

              <div className="mt-4 space-y-2 text-sm">
                <div className="flex items-center gap-2 text-gray-600">
                  <Clock size={14} className="text-gray-400 flex-shrink-0" />
                  <span>
                    Clocked in for <LiveDuration since={m.clockIn} />
                    <span className="text-gray-400"> · since {clockTime(m.clockIn)}{m.adjusted ? ' (adjusted)' : ''}</span>
                  </span>
                </div>

                <div className="flex items-start gap-2 text-gray-600">
                  <UserCheck size={14} className="text-gray-400 flex-shrink-0 mt-0.5" />
                  {m.clockedBy ? (
                    <span>
                      Clocked in by{' '}
                      <Link to={`/users/${m.clockedBy.id}`} className="text-gray-900 font-medium hover:text-blue-600">
                        {m.clockedBy.name}
                      </Link>
                      <span
                        className="inline-block w-2 h-2 rounded-full ml-1.5 align-middle"
                        style={{ backgroundColor: technicianColor(m.clockedBy, m.clockedBy.id) }}
                      />
                      {m.clockedBy.role && <span className="text-xs text-gray-400 capitalize"> · {m.clockedBy.role}</span>}
                    </span>
                  ) : (
                    <span className="text-gray-400">Clocked in by someone no longer on the system</span>
                  )}
                </div>

                <div className="flex items-start gap-2 text-gray-600">
                  <MapPin size={14} className="text-gray-400 flex-shrink-0 mt-0.5" />
                  {m.dropOff ? (
                    m.job ? (
                      <span>
                        Dropped off at{' '}
                        <Link to={`/jobs/${m.job.id}`} className="text-gray-900 font-medium hover:text-blue-600">
                          {m.job.title ?? m.job.ref}
                        </Link>
                        {m.job.location && <span className="text-gray-500"> — {m.job.location}</span>}
                      </span>
                    ) : (
                      <span>Dropped off at <span className="text-gray-900 font-medium">{m.siteLabel || 'a job site'}</span></span>
                    )
                  ) : (
                    <span className="text-gray-500">With {m.clockedBy?.name ?? 'the technician who clocked them in'}</span>
                  )}
                </div>

                <div className="flex items-start gap-2 text-gray-600">
                  <Satellite size={14} className="text-gray-400 flex-shrink-0 mt-0.5" />
                  {m.lat != null ? (
                    <span className="text-emerald-600">
                      Clocked in here
                      <ClockInAddress lat={m.lat} lng={m.lng} />
                    </span>
                  ) : (
                    <span className="text-gray-400">No clock-in location recorded</span>
                  )}
                </div>

                {m.phone && (
                  <div className="flex items-center gap-2 text-gray-600">
                    <Phone size={14} className="text-gray-400 flex-shrink-0" />
                    <a href={`tel:${m.phone.replace(/\s+/g, '')}`} className="hover:text-blue-600">{m.phone}</a>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </PageContainer>
  )
}
