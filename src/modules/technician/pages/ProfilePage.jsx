import { useEffect, useState } from 'react'
import { LogOut, Clock, MapPin, KeyRound } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { fetchActiveShift, clockInForWork, clockOutForWork, fetchShiftHistory, onWorkShiftChange } from '../../../shared/services/workShiftService'
import { fetchOnSiteHistory } from '../services/technicianService'
import { requestPasswordChange, fetchPendingPasswordRequest } from '../../users/services/profileService'
import ConfirmDialog from '../../../shared/components/ConfirmDialog'
import { formatTime, formatDate, toDateStr } from '../../../shared/utils/formatDate'

function formatDuration(ms) {
  const totalMinutes = Math.round(ms / 60000)
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export default function ProfilePage({ profile }) {
  const [shift, setShift] = useState(null)
  const [history, setHistory] = useState([])
  const [onSiteHistory, setOnSiteHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [confirmClockOut, setConfirmClockOut] = useState(false)
  const [pendingPasswordRequest, setPendingPasswordRequest] = useState(null)
  const [requestingPassword, setRequestingPassword] = useState(false)

  function loadHistory() {
    return fetchShiftHistory(profile.id).then(setHistory)
  }

  useEffect(() => {
    Promise.all([
      fetchActiveShift(profile.id).then(setShift),
      loadHistory(),
      fetchOnSiteHistory(profile.id).then(setOnSiteHistory),
    ]).finally(() => setLoading(false))
    fetchPendingPasswordRequest(profile.id).then(setPendingPasswordRequest).catch(() => {})
  }, [profile.id])

  useEffect(() => {
    return onWorkShiftChange(() => {
      fetchActiveShift(profile.id).then(setShift)
      loadHistory()
    })
  }, [profile.id])

  async function handleLogout() {
    await supabase.auth.signOut()
  }

  async function handleRequestPasswordChange() {
    setRequestingPassword(true)
    try {
      await requestPasswordChange(profile.id)
      setPendingPasswordRequest({ requested_at: new Date().toISOString() })
    } finally {
      setRequestingPassword(false)
    }
  }

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
      await loadHistory()
    } finally {
      setBusy(false)
      setConfirmClockOut(false)
    }
  }

  const historyByDay = history.reduce((acc, s) => {
    const key = toDateStr(s.clock_in)
    acc[key] = acc[key] || []
    acc[key].push(s)
    return acc
  }, {})
  const historyDays = Object.keys(historyByDay).sort((a, b) => b.localeCompare(a))

  const onSiteByDay = onSiteHistory.reduce((acc, s) => {
    const key = toDateStr(s.actual_start)
    acc[key] = acc[key] || []
    acc[key].push(s)
    return acc
  }, {})
  const onSiteDays = Object.keys(onSiteByDay).sort((a, b) => b.localeCompare(a))

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-lg font-bold text-gray-900">Profile</h1>

      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg shrink-0"
            style={{ backgroundColor: profile?.color || '#3B82F6' }}
          >
            {profile?.full_name?.[0]?.toUpperCase() || '?'}
          </div>
          <div>
            <p className="text-sm font-bold text-gray-900">{profile?.full_name}</p>
            <p className="text-xs text-gray-500 capitalize">{profile?.role}</p>
          </div>
        </div>
        <div className="text-sm text-gray-600 space-y-1 pt-2 border-t border-gray-100">
          {profile?.email && <p>{profile.email}</p>}
          {profile?.phone && <p>{profile.phone}</p>}
          {profile?.companies?.name && <p className="text-gray-400">{profile.companies.name}</p>}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
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
              onClick={() => setConfirmClockOut(true)}
              className="w-full bg-indigo-600 text-white text-sm font-semibold py-2.5 rounded-xl disabled:opacity-50"
            >
              Clock Out for the Day
            </button>
          </>
        ) : (
          <button
            disabled={busy}
            onClick={handleClockIn}
            className="w-full bg-blue-600 text-white text-sm font-semibold py-2.5 rounded-xl disabled:opacity-50"
          >
            Clock In for the Day
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
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

      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-bold text-gray-900">
          <MapPin size={16} /> On-Site Time
        </div>
        {loading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : onSiteDays.length === 0 ? (
          <p className="text-sm text-gray-400">No on-site records yet.</p>
        ) : (
          <div className="space-y-3">
            {onSiteDays.map(day => {
              const entries = onSiteByDay[day]
              const totalMs = entries.reduce((sum, s) => s.actual_end ? sum + (new Date(s.actual_end) - new Date(s.actual_start)) : sum, 0)
              return (
                <div key={day} className="border-t border-gray-100 pt-2 first:border-t-0 first:pt-0">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-gray-500">{formatDate(day)}</p>
                    <p className="text-xs font-semibold text-gray-700">{formatDuration(totalMs)}</p>
                  </div>
                  {entries.map(s => (
                    <div key={s.id} className="flex items-center justify-between">
                      <p className="text-xs text-gray-400 truncate">{s.job_title || s.job_ref || 'Job'}</p>
                      <p className="text-xs text-gray-400 shrink-0">
                        {formatTime(s.actual_start)} – {s.actual_end ? formatTime(s.actual_end) : 'In progress'}
                      </p>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {pendingPasswordRequest ? (
        <div className="w-full flex items-center justify-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 text-sm font-semibold py-2.5 rounded-xl">
          <KeyRound size={16} /> Password change requested
        </div>
      ) : (
        <button
          onClick={handleRequestPasswordChange}
          disabled={requestingPassword}
          className="w-full flex items-center justify-center gap-2 bg-white border border-gray-200 text-gray-700 text-sm font-semibold py-2.5 rounded-xl disabled:opacity-50"
        >
          <KeyRound size={16} /> {requestingPassword ? 'Requesting…' : 'Request Password Change'}
        </button>
      )}

      <button
        onClick={handleLogout}
        className="w-full flex items-center justify-center gap-2 bg-white border border-gray-200 text-red-600 text-sm font-semibold py-2.5 rounded-xl"
      >
        <LogOut size={16} /> Log Out
      </button>

      {confirmClockOut && (
        <ConfirmDialog
          title="Clock out for the day?"
          message="This ends your daily work shift record."
          confirmLabel="Clock Out"
          busy={busy}
          onConfirm={handleClockOut}
          onCancel={() => setConfirmClockOut(false)}
        />
      )}
    </div>
  )
}
