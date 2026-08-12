import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Mail, Phone, Building2, Pencil, Clock } from 'lucide-react'
import PageContainer from '../../../shared/components/PageContainer.jsx'
import { fetchActiveShift, clockInForWork, clockOutForWork, fetchShiftHistory, onWorkShiftChange } from '../../../shared/services/workShiftService'
import { formatTime, formatDate, toDateStr } from '../../../shared/utils/formatDate'
import ClockHoursSummary from '../../../shared/components/ClockHoursSummary'

function formatDuration(ms) {
  const totalMinutes = Math.round(ms / 60000)
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export default function MyProfilePage({ profile }) {
  const [shift, setShift] = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  function loadHistory(profileId) {
    return fetchShiftHistory(profileId, 200).then(setHistory)
  }

  useEffect(() => {
    if (!profile?.id) return
    Promise.all([
      fetchActiveShift(profile.id).then(setShift),
      loadHistory(profile.id),
    ]).finally(() => setLoading(false))
  }, [profile?.id])

  useEffect(() => {
    if (!profile?.id) return
    return onWorkShiftChange(() => {
      fetchActiveShift(profile.id).then(setShift)
      loadHistory(profile.id)
    })
  }, [profile?.id])

  async function handleClockIn() {
    setBusy(true)
    try {
      const s = await clockInForWork(profile.id)
      setShift(s)
    } finally {
      setBusy(false)
    }
  }

  async function handleClockOut() {
    setBusy(true)
    try {
      await clockOutForWork(shift.id)
      setShift(null)
      await loadHistory(profile.id)
    } finally {
      setBusy(false)
    }
  }

  if (!profile) {
    return (
      <PageContainer>
        <p className="text-sm text-gray-400">Loading…</p>
      </PageContainer>
    )
  }

  const historyByDay = history.reduce((acc, s) => {
    const key = toDateStr(s.clock_in)
    acc[key] = acc[key] || []
    acc[key].push(s)
    return acc
  }, {})
  const historyDays = Object.keys(historyByDay).sort((a, b) => b.localeCompare(a))

  return (
    <PageContainer>
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>
        <p className="text-sm text-gray-500 mt-0.5">Your account details</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 max-w-lg space-y-5">
        <div className="flex items-center gap-4">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center text-white font-bold text-2xl shrink-0"
            style={{ backgroundColor: profile.color || '#3B82F6' }}
          >
            {profile.full_name?.[0]?.toUpperCase() || '?'}
          </div>
          <div>
            <p className="text-lg font-bold text-gray-900">{profile.full_name}</p>
            <p className="text-sm text-gray-500 capitalize">{profile.role}</p>
          </div>
        </div>

        <div className="space-y-2 pt-2 border-t border-gray-100">
          {profile.email && (
            <p className="flex items-center gap-2 text-sm text-gray-600">
              <Mail size={14} className="text-gray-400" /> {profile.email}
            </p>
          )}
          {profile.phone && (
            <p className="flex items-center gap-2 text-sm text-gray-600">
              <Phone size={14} className="text-gray-400" /> {profile.phone}
            </p>
          )}
          {profile.companies?.name && (
            <p className="flex items-center gap-2 text-sm text-gray-600">
              <Building2 size={14} className="text-gray-400" /> {profile.companies.name}
            </p>
          )}
        </div>

        <Link
          to={`/users/${profile.id}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 pt-2"
        >
          <Pencil size={14} /> Edit profile
        </Link>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 max-w-lg space-y-3">
        <div className="flex items-center gap-2 text-sm font-bold text-gray-900">
          <Clock size={16} /> Work Shift
        </div>
        {loading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : shift ? (
          <>
            <p className="text-xs text-gray-500">Clocked in at {formatTime(shift.clock_in)}</p>
            <button
              disabled={busy}
              onClick={handleClockOut}
              className="bg-red-600 text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-50"
            >
              Clock Out
            </button>
          </>
        ) : (
          <button
            disabled={busy}
            onClick={handleClockIn}
            className="bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-50"
          >
            Clock In
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 max-w-lg space-y-3">
        <div className="flex items-center gap-2 text-sm font-bold text-gray-900">
          <Clock size={16} /> Hours Summary
        </div>
        {loading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : (
          <ClockHoursSummary shifts={history} />
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 max-w-lg space-y-3">
        <div className="flex items-center gap-2 text-sm font-bold text-gray-900">
          <Clock size={16} /> Clock History
        </div>
        {loading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : historyDays.length === 0 ? (
          <p className="text-sm text-gray-400">No completed shifts yet.</p>
        ) : (
          <div className="space-y-3">
            {historyDays.map(day => {
              const shifts = historyByDay[day]
              const totalMs = shifts.reduce((sum, s) => sum + (new Date(s.clock_out) - new Date(s.clock_in)), 0)
              return (
                <div key={day} className="border-t border-gray-100 pt-2 first:border-t-0 first:pt-0">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-gray-500">{formatDate(day)}</p>
                    <p className="text-xs font-semibold text-gray-700">{formatDuration(totalMs)}</p>
                  </div>
                  {shifts.map(s => (
                    <p key={s.id} className="text-xs text-gray-400">
                      {formatTime(s.clock_in)} – {formatTime(s.clock_out)}
                    </p>
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
