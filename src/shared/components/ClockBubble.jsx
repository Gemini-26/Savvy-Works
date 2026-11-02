import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Clock, X, MapPin, MapPinOff, UserPlus, Truck, Users } from 'lucide-react'
import { useCurrentUser } from '../../hooks/useCurrentUser'
import { useLocationTracking } from '../../hooks/useLocationTracking'
import { fetchActiveShift, clockInForWork, clockOutForWork, onWorkShiftChange } from '../services/workShiftService'
import { fetchOpenTeamShifts, clockInTeamMembers, clockOutTeamMember, onTeamShiftChange } from '../services/teamShiftService'
import { useFaceCheck } from '../hooks/useFaceCheck'
import { fetchFaceEnrolment } from '../services/faceService'
import { preloadFaceEngine } from '../utils/faceEngine'
import SelectTeamModal from '../../modules/technician/components/SelectTeamModal'
import DropOffJobPicker from './DropOffJobPicker'

function formatElapsed(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  const pad = n => String(n).padStart(2, '0')
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}

// "1h 05m" — for the team list, where ticking seconds would only be noise.
function formatSince(ms) {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000))
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`
}

const formatClockTime = value => new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

export default function ClockBubble() {
  const { profile } = useCurrentUser()
  const [shift, setShift] = useState(null)
  const [loaded, setLoaded] = useState(false)
  const [now, setNow] = useState(Date.now())
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  // Team members clocked in from this button — by this person or any other
  // technician, so anyone can clock out someone who was dropped off.
  const [teamShifts, setTeamShifts] = useState([])
  const [teamModal, setTeamModal] = useState(null)       // null | 'with' | 'dropoff'
  const [dropJob, setDropJob] = useState(null)
  const [teamBusy, setTeamBusy] = useState(false)
  const [teamError, setTeamError] = useState(null)
  const [teamNote, setTeamNote] = useState(null)         // { tone: 'green' | 'amber', text }
  const [outBusyId, setOutBusyId] = useState(null)

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
    if (!profile?.id) return
    const refresh = () => fetchOpenTeamShifts().then(setTeamShifts).catch(() => {})
    refresh()
    return onTeamShiftChange(refresh)
  }, [profile?.id])

  // Someone else may have clocked a team member in or out since this phone
  // last looked — catch up whenever the panel is opened.
  useEffect(() => {
    if (!open || !profile?.id) return
    fetchOpenTeamShifts().then(setTeamShifts).catch(() => {})
  }, [open, profile?.id])

  const ticking = !!shift || teamShifts.length > 0
  useEffect(() => {
    if (!ticking) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [ticking])

  const location = useLocationTracking(shift?.id ?? null)
  const { askFace, recordFace, faceDialog } = useFaceCheck()

  // Anyone who clocks in with their face gets the face models fetched quietly
  // ahead of time, so the first clock-in of the day doesn't wait on them.
  useEffect(() => {
    if (!profile?.id) return
    fetchFaceEnrolment()
      .then(e => { if (e.profileIds.has(profile.id)) preloadFaceEngine() })
      .catch(() => {})
  }, [profile?.id])

  if (!profile?.id || !loaded) return null

  async function handleClockIn() {
    setBusy(true)
    try {
      const face = await askFace('shift_in')
      if (!face) return
      const s = await clockInForWork(profile.id)
      setShift(s)
      setNow(Date.now())
      recordFace('shift_in', face, { shiftId: s.id })
    } finally {
      setBusy(false)
    }
  }

  async function handleClockOut() {
    setBusy(true)
    try {
      const face = await askFace('shift_out')
      if (!face) return
      await clockOutForWork(shift.id)
      recordFace('shift_out', face, { shiftId: shift.id })
      setShift(null)
      setOpen(false)
    } finally {
      setBusy(false)
    }
  }

  function openTeamModal(kind) {
    setTeamError(null)
    setTeamNote(null)
    setDropJob(null)
    setTeamModal(kind)
  }

  function closeTeamModal() {
    if (teamBusy) return
    setTeamModal(null)
    setDropJob(null)
    setTeamError(null)
  }

  async function handleTeamClockIn(ids) {
    const dropOff = teamModal === 'dropoff'
    if (dropOff && !dropJob) {
      setTeamError('Pick the job site you are dropping them at.')
      return
    }
    setTeamBusy(true)
    setTeamError(null)
    try {
      const { done, failed } = await clockInTeamMembers(ids, {
        mode: dropOff ? 'drop_off' : 'with_technician',
        job: dropOff ? dropJob : null,
      })
      if (done.length > 0) {
        const where = dropOff ? ` at ${dropJob.job_ref || 'the job site'}` : ''
        const who = `${done.length} team member${done.length === 1 ? '' : 's'}`
        setTeamNote(failed.length > 0
          ? { tone: 'amber', text: `${who} clocked in${where}. ${failed.length} could not be: ${failed[0].message}.` }
          : { tone: 'green', text: `${who} clocked in${where}.` })
        setTeamModal(null)
        setDropJob(null)
      } else {
        setTeamError(failed[0]?.message || 'Could not clock them in.')
      }
    } catch (err) {
      setTeamError(err.message || 'Could not clock them in.')
    } finally {
      setTeamBusy(false)
    }
  }

  async function handleTeamClockOut(t) {
    setOutBusyId(t.id)
    setTeamNote(null)
    try {
      await clockOutTeamMember(t.id)
      setTeamNote({ tone: 'green', text: `${t.team_members?.full_name || 'Team member'} clocked out.` })
    } catch (err) {
      setTeamNote({ tone: 'amber', text: err.message || 'Could not clock them out.' })
      fetchOpenTeamShifts().then(setTeamShifts).catch(() => {})
    } finally {
      setOutBusyId(null)
    }
  }

  const elapsed = shift ? formatElapsed(now - new Date(shift.clock_in).getTime()) : null
  const clockedInTeamIds = new Set(teamShifts.map(t => t.team_member_id))

  return (
    <div className="fixed bottom-20 lg:bottom-6 right-4 z-[9997] select-none">
      {open && (
        <div className="mb-2 w-64 bg-white border border-gray-200 rounded-xl shadow-xl p-4 max-h-[75vh] overflow-y-auto">
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
                  {location.status === 'requesting' && (location.isNative ? 'Waiting for permission…' : 'Waiting for browser permission…')}
                  {location.status === 'granted' && 'Sharing your live location.'}
                  {location.status === 'reconnecting' && 'Reconnecting GPS…'}
                  {location.status === 'denied' && (location.isNative
                    ? 'Blocked — allow Location for Savvy Works in your phone’s app settings, then toggle off/on.'
                    : "Blocked — allow location in your browser's site settings, then toggle off/on.")}
                  {location.status === 'unsupported' && 'Location isn’t available on this device/browser.'}
                </p>
              )}
              {/* Tracking is running but only survives while the app is on
                  screen — the "all the time" grant lives behind a disclosure
                  screen on the Profile page, so point there rather than
                  prompting from inside a toggle. */}
              {location.enabled && location.isNative && location.status === 'granted' && !location.backgroundReady && (
                <Link
                  to="/profile"
                  onClick={() => setOpen(false)}
                  className="block text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5 mb-3"
                >
                  Stops when your screen locks — finish setup under Profile → Background Access.
                </Link>
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

          {/* Team members have no login, so the person holding the phone
              clocks them in and out. */}
          <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
            <span className="block text-xs font-bold text-gray-900 uppercase tracking-wide">Team</span>
            <button
              type="button"
              onClick={() => openTeamModal('with')}
              className="w-full flex items-center justify-center gap-2 bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold py-2 rounded-lg"
            >
              <UserPlus size={14} /> Clock-in Team member
            </button>
            <button
              type="button"
              onClick={() => openTeamModal('dropoff')}
              className="w-full flex items-center justify-center gap-2 bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold py-2 rounded-lg"
            >
              <Truck size={14} /> Drop-off and clock-in Team member
            </button>

            {teamNote && (
              <p className={`text-[11px] ${teamNote.tone === 'green' ? 'text-emerald-700' : 'text-amber-700'}`}>{teamNote.text}</p>
            )}

            {teamShifts.length > 0 && (
              <div className="space-y-1.5 max-h-44 overflow-y-auto">
                <p className="text-[11px] font-semibold text-gray-500">Clocked in ({teamShifts.length})</p>
                {teamShifts.map(t => (
                  <div key={t.id} className="flex items-center gap-2 rounded-lg border border-gray-200 px-2 py-1.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-gray-900 truncate">{t.team_members?.full_name || 'Team member'}</p>
                      <p className="text-[10px] text-gray-500">
                        In {formatClockTime(t.clock_in)} · {formatSince(now - new Date(t.clock_in).getTime())}
                      </p>
                      {t.mode === 'drop_off' && (
                        <p className="text-[10px] text-gray-500 leading-tight break-words">
                          Drop-off{t.site_label ? `: ${t.site_label}` : ''}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      disabled={outBusyId === t.id}
                      onClick={() => handleTeamClockOut(t)}
                      className="text-[11px] font-semibold text-red-600 shrink-0 disabled:opacity-50"
                    >
                      {outBusyId === t.id ? '…' : 'Clock out'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-2 rounded-full shadow-lg px-3 py-2.5 font-mono text-sm font-semibold transition-colors
          ${shift ? 'bg-emerald-600 text-white' : 'bg-white text-gray-600 border border-gray-200'}`}
      >
        <Clock size={16} className={shift ? 'animate-pulse' : ''} />
        {shift ? elapsed : 'Clock In'}
        {teamShifts.length > 0 && (
          <span
            className={`flex items-center gap-1 text-xs ${shift ? 'text-emerald-100' : 'text-blue-600'}`}
            title={`${teamShifts.length} team member${teamShifts.length === 1 ? '' : 's'} clocked in`}
          >
            <Users size={13} />{teamShifts.length}
          </span>
        )}
      </button>

      {teamModal && (
        <SelectTeamModal
          heading={teamModal === 'dropoff' ? 'Drop-off and clock-in' : 'Clock-in Team member'}
          intro={teamModal === 'dropoff'
            ? 'Pick who you are dropping off, and the job site below. They are clocked in at that site from now.'
            : 'Pick who is with you. They are clocked in from now, until you or another technician clocks them out.'}
          confirmLabel={n => (n > 0
            ? `${teamModal === 'dropoff' ? 'Drop off & clock in' : 'Clock in'} ${n} team member${n === 1 ? '' : 's'}`
            : 'Pick a team member')}
          busyLabel="Clocking in…"
          busy={teamBusy}
          disabledIds={clockedInTeamIds}
          requireSelection
          confirmDisabled={teamModal === 'dropoff' && !dropJob}
          onConfirm={handleTeamClockIn}
          onClose={closeTeamModal}
        >
          {teamModal === 'dropoff' && <DropOffJobPicker value={dropJob} onChange={setDropJob} />}
          {teamError && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded">{teamError}</div>
          )}
        </SelectTeamModal>
      )}
      {faceDialog}
    </div>
  )
}
