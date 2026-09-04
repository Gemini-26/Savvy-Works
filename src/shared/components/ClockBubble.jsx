import { useEffect, useState } from 'react'
import { Clock, X, MapPin, MapPinOff } from 'lucide-react'
import { useCurrentUser } from '../../hooks/useCurrentUser'
import { useLocationTracking } from '../../hooks/useLocationTracking'
import { fetchActiveShift, clockInForWork, clockOutForWork, onWorkShiftChange } from '../services/workShiftService'

function formatElapsed(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  const pad = n => String(n).padStart(2, '0')
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}

export default function ClockBubble() {
  const { profile } = useCurrentUser()
  const [shift, setShift] = useState(null)
  const [loaded, setLoaded] = useState(false)
  const [now, setNow] = useState(Date.now())
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!profile?.id) return
    fetchActiveShift(profile.id).then(setShift).finally(() => setLoaded(true))
  }, [profile?.id])

  useEffect(() => {
    if (!profile?.id) return
    return onWorkShiftChange(() => {
      fetchActiveShift(profile.id).then(setShift)
    })
  }, [profile?.id])

  useEffect(() => {
    if (!shift) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [shift])

  const location = useLocationTracking(shift?.id ?? null)

  if (!profile?.id || !loaded) return null

  async function handleClockIn() {
    setBusy(true)
    try {
      const s = await clockInForWork(profile.id)
      setShift(s)
      setNow(Date.now())
    } finally {
      setBusy(false)
    }
  }

  async function handleClockOut() {
    setBusy(true)
    try {
      await clockOutForWork(shift.id)
      setShift(null)
      setOpen(false)
    } finally {
      setBusy(false)
    }
  }

  const elapsed = shift ? formatElapsed(now - new Date(shift.clock_in).getTime()) : null

  return (
    <div className="fixed bottom-20 lg:bottom-6 right-4 z-[9997] select-none">
      {open && (
        <div className="mb-2 w-56 bg-white border border-gray-200 rounded-xl shadow-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-gray-900 uppercase tracking-wide">Work Shift</span>
            <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">
              <X size={14} />
            </button>
          </div>
          {shift ? (
            <>
              <p className="text-2xl font-mono font-bold text-gray-900 tabular-nums mb-1">{elapsed}</p>
              <p className="text-xs text-gray-500 mb-3">
                Clocked in at {new Date(shift.clock_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>

              <div className="flex items-center justify-between mb-1 py-1.5 border-t border-b border-gray-100">
                <span className="flex items-center gap-1.5 text-xs font-medium text-gray-700">
                  {location.enabled ? <MapPin size={13} className="text-emerald-600" /> : <MapPinOff size={13} className="text-gray-400" />}
                  Share my location
                </span>
                <button
                  role="switch"
                  aria-checked={location.enabled}
                  onClick={() => location.toggle(!location.enabled)}
                  className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${location.enabled ? 'bg-emerald-500' : 'bg-gray-300'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${location.enabled ? 'translate-x-4' : ''}`} />
                </button>
              </div>
              {location.enabled && (
                <p className={`text-[11px] mb-3 ${location.status === 'denied' ? 'text-red-600' : location.status === 'granted' ? 'text-emerald-600' : 'text-gray-400'}`}>
                  {location.status === 'requesting' && 'Waiting for browser permission…'}
                  {location.status === 'granted' && 'Sharing your live location.'}
                  {location.status === 'denied' && "Blocked — allow location in your browser's site settings, then toggle off/on."}
                  {location.status === 'unsupported' && 'Location isn’t available on this device/browser.'}
                </p>
              )}
              {!location.enabled && <div className="mb-3" />}

              <button
                disabled={busy}
                onClick={handleClockOut}
                className="w-full bg-red-600 text-white text-sm font-semibold py-2 rounded-lg disabled:opacity-50"
              >
                Clock Out
              </button>
            </>
          ) : (
            <>
              <p className="text-xs text-gray-500 mb-3">Not clocked in.</p>
              <button
                disabled={busy}
                onClick={handleClockIn}
                className="w-full bg-blue-600 text-white text-sm font-semibold py-2 rounded-lg disabled:opacity-50"
              >
                Clock In
              </button>
            </>
          )}
        </div>
      )}

      <button
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-2 rounded-full shadow-lg px-3 py-2.5 font-mono text-sm font-semibold transition-colors
          ${shift ? 'bg-emerald-600 text-white' : 'bg-white text-gray-600 border border-gray-200'}`}
      >
        <Clock size={16} className={shift ? 'animate-pulse' : ''} />
        {shift ? elapsed : 'Clock In'}
      </button>
    </div>
  )
}
