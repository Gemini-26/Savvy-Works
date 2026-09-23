import { useState, useEffect, useRef } from 'react'
import PageContainer from '../../../shared/components/PageContainer.jsx'
import { useProfiles } from '../../../shared/hooks/useProfiles'
import { fetchAppointmentsForDay } from '../services/appointmentService'
import AppointmentModal from '../components/AppointmentModal'
import AppointmentPreviewModal from '../components/AppointmentPreviewModal'
import { APPOINTMENT_STATUS_META as STATUS_META } from '../../../shared/constants/appointmentStatuses'

// ─── Grid constants ───────────────────────────────────────────────────────────
const DAY_START = 6     // 06:00
const DAY_END   = 20    // 20:00
const CELL_W    = 88    // px per hour
const ROW_H     = 60    // px per technician row (single job — no overlaps)
const LANE_H    = 30    // px per stacked job when a tech has overlapping jobs
const LANE_GAP  = 4     // px gap between stacked lanes
const ROW_PAD   = 6     // px vertical padding inside a row
const NAME_W    = 208   // px for the left name column
const HOURS     = Array.from({ length: DAY_END - DAY_START }, (_, i) => DAY_START + i)
const GRID_W    = HOURS.length * CELL_W

// Greedily assigns each appointment to a vertical "lane" so that jobs
// overlapping in time for the same technician stack below each other
// instead of rendering on top of one another.
function assignLanes(appointments) {
  const sorted = [...appointments].sort(
    (a, b) => new Date(a.scheduled_start) - new Date(b.scheduled_start)
  )
  const laneEndTimes = []
  const placed = sorted.map(appt => {
    const start = new Date(appt.scheduled_start).getTime()
    const end   = new Date(appt.scheduled_end).getTime()
    let lane = laneEndTimes.findIndex(endTime => endTime <= start)
    if (lane === -1) {
      lane = laneEndTimes.length
      laneEndTimes.push(end)
    } else {
      laneEndTimes[lane] = end
    }
    return { appt, lane }
  })
  return { placed, laneCount: laneEndTimes.length || 1 }
}

// ─── Date helpers ─────────────────────────────────────────────────────────────
function toDateStr(d) { return d.toISOString().split('T')[0] }
function today()      { return toDateStr(new Date()) }
function parseLocal(str) {
  const [y, m, d] = str.split('-').map(Number)
  return new Date(y, m - 1, d)
}
function shiftDate(str, days) {
  const d = parseLocal(str); d.setDate(d.getDate() + days); return toDateStr(d)
}
function formatDisplay(str) {
  return parseLocal(str).toLocaleDateString('en-ZA', {
    weekday: 'long', day: 'numeric', month: 'short', year: 'numeric',
  })
}

// ─── Block positioning helpers ────────────────────────────────────────────────
function blockLeft(isoStr) {
  const d = new Date(isoStr)
  const h = d.getHours() + d.getMinutes() / 60
  return Math.max(0, (h - DAY_START) * CELL_W)
}
function blockWidth(startIso, endIso) {
  const diff = (new Date(endIso) - new Date(startIso)) / 3_600_000
  return Math.max(diff * CELL_W - 2, 24)
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function AppointmentBlock({ appt, top, height, onPreview }) {
  const meta  = STATUS_META[appt.status] || STATUS_META.not_dispatched
  const left  = blockLeft(appt.scheduled_start)
  const width = blockWidth(appt.scheduled_start, appt.scheduled_end)
  const title = appt.jobs?.title || appt.jobs?.job_ref || 'Appointment'
  const cust  = appt.jobs?.customers?.customer_name

  return (
    <div
      className={`absolute rounded text-white text-[11px] px-2 py-0.5 overflow-hidden cursor-pointer hover:brightness-110 transition-all shadow-sm select-none z-10 ${meta.bar}`}
      style={{ left, width, top, height }}
      onClick={e => { e.stopPropagation(); onPreview(appt) }}
      title={`${title}${cust ? ` — ${cust}` : ''}`}
    >
      <div className="font-semibold leading-tight truncate">{title}</div>
      {cust && height > 24 && <div className="truncate opacity-80 text-[10px]">{cust}</div>}
    </div>
  )
}

function TechRow({ tech, appointments, onPreview, onClickCell, isUnassigned }) {
  const initial = tech.full_name?.[0]?.toUpperCase() || '?'
  const color   = tech.color || '#6b7280'

  const { placed, laneCount } = assignLanes(appointments)
  const rowH = laneCount <= 1
    ? ROW_H
    : ROW_PAD * 2 + laneCount * LANE_H + (laneCount - 1) * LANE_GAP

  return (
    <div className="flex border-b border-gray-100 last:border-0" style={{ height: rowH }}>
      {/* Sticky left: name cell */}
      <div
        className="shrink-0 sticky left-0 z-10 bg-white border-r border-gray-200 flex items-center px-3 gap-2.5"
        style={{ width: NAME_W }}
      >
        {isUnassigned ? (
          <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-xs font-bold flex-shrink-0">
            ?
          </div>
        ) : (
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
            style={{ backgroundColor: color }}
          >
            {initial}
          </div>
        )}
        <div className="min-w-0">
          <div className="text-sm font-medium text-gray-800 truncate leading-tight">{tech.full_name}</div>
          {!isUnassigned && (
            <div className="text-xs text-gray-400 capitalize leading-tight">{tech.role}</div>
          )}
        </div>
      </div>

      {/* Timeline area */}
      <div className="relative flex-1 min-w-0" style={{ width: GRID_W }}>
        {/* Hour grid cells (clickable to create appointment) */}
        {HOURS.map((h, i) => (
          <div
            key={h}
            className="absolute top-0 bottom-0 border-r border-gray-100 hover:bg-blue-50 transition-colors cursor-cell"
            style={{ left: i * CELL_W, width: CELL_W }}
            onClick={() => onClickCell(tech, h)}
          />
        ))}

        {/* Appointment blocks — stacked into lanes when they overlap */}
        {placed.map(({ appt, lane }) => {
          const top    = laneCount <= 1 ? ROW_PAD : ROW_PAD + lane * (LANE_H + LANE_GAP)
          const height = laneCount <= 1 ? rowH - ROW_PAD * 2 : LANE_H
          return (
            <AppointmentBlock key={appt.id} appt={appt} top={top} height={height} onPreview={onPreview} />
          )
        })}
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function TimePlannerPage() {
  const [date,          setDate]          = useState(today())
  const [appointments,  setAppointments]  = useState([])
  const [loading,       setLoading]       = useState(true)
  const [error,         setError]         = useState(null)
  const [modal,         setModal]         = useState(null)  // null | { mode, appt?, techId?, startHour? }
  const [preview,       setPreview]       = useState(null)  // null | appointment being previewed
  const { profiles }                      = useProfiles()
  const scrollRef                         = useRef(null)

  useEffect(() => { load() }, [date])

  // Scroll to 07:00 on load
  useEffect(() => {
    if (!loading && scrollRef.current) {
      scrollRef.current.scrollLeft = (7 - DAY_START) * CELL_W - 20
    }
  }, [loading])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchAppointmentsForDay(date)
      setAppointments(data)
    } catch (err) {
      setError(err.message || 'Failed to load appointments')
    } finally {
      setLoading(false)
    }
  }

  // Group appointments by technician id
  const byTech = {}
  appointments.forEach(appt => {
    const assignments = appt.appointment_assignments || []
    if (assignments.length === 0) {
      byTech['unassigned'] = [...(byTech['unassigned'] || []), appt]
    } else {
      assignments.forEach(aa => {
        byTech[aa.technician_id] = [...(byTech[aa.technician_id] || []), appt]
      })
    }
  })

  const unassigned = byTech['unassigned'] || []

  // Current time line
  const now    = new Date()
  const nowH   = now.getHours() + now.getMinutes() / 60
  const nowX   = NAME_W + (nowH - DAY_START) * CELL_W
  const showNow = date === today() && nowH >= DAY_START && nowH <= DAY_END

  function openPreview(appt) {
    setPreview(appt)
  }

  function openEditFromPreview(appt) {
    setPreview(null)
    setModal({ mode: 'edit', appt })
  }

  function openNew(tech, startHour) {
    setModal({
      mode: 'new',
      techId: tech.id === 'unassigned' ? null : tech.id,
      startHour,
    })
  }

  function openNewBlank() {
    setModal({ mode: 'new' })
  }

  return (
    <PageContainer>

      {/* ── Header ── */}
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setDate(shiftDate(date, -1))}
            className="w-8 h-8 flex items-center justify-center rounded border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors text-sm"
          >
            ‹
          </button>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
          />
          <button
            onClick={() => setDate(shiftDate(date, 1))}
            className="w-8 h-8 flex items-center justify-center rounded border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors text-sm"
          >
            ›
          </button>
          <span className="text-sm font-semibold text-gray-700 hidden sm:block">
            {formatDisplay(date)}
          </span>
          {date !== today() && (
            <button
              onClick={() => setDate(today())}
              className="px-3 py-1.5 text-xs font-medium border border-gray-300 rounded text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Today
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            className="w-8 h-8 flex items-center justify-center rounded border border-gray-300 text-gray-500 hover:bg-gray-50 transition-colors"
            title="Refresh"
          >
            ↺
          </button>
          <button
            onClick={openNewBlank}
            className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-semibold hover:bg-blue-700 transition-colors"
          >
            + New Appointment
          </button>
        </div>
      </div>

      {/* ── Status legend ── */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {Object.entries(STATUS_META).map(([key, meta]) => (
          <div key={key} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: meta.dot }} />
            <span className="text-[11px] text-gray-500">{meta.label}</span>
          </div>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* ── Planner grid ── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <p className="text-sm text-gray-400 p-6">Loading appointments…</p>
        ) : (
          <div
            ref={scrollRef}
            className="overflow-x-auto"
            style={{ position: 'relative' }}
          >
            <div style={{ minWidth: NAME_W + GRID_W }}>

              {/* ── Hour header ── */}
              <div
                className="flex sticky top-0 z-20 bg-white border-b border-gray-200"
                style={{ height: 36 }}
              >
                <div
                  className="shrink-0 sticky left-0 z-30 bg-gray-50 border-r border-gray-200 flex items-center px-3"
                  style={{ width: NAME_W }}
                >
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                    Technician
                  </span>
                </div>
                <div className="flex" style={{ width: GRID_W }}>
                  {HOURS.map(h => (
                    <div
                      key={h}
                      className="shrink-0 flex items-center justify-center text-xs text-gray-400 border-r border-gray-100 last:border-0"
                      style={{ width: CELL_W }}
                    >
                      {String(h).padStart(2, '0')}:00
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Current time line ── */}
              {showNow && (
                <div
                  className="absolute top-9 bottom-0 w-0.5 bg-red-500 z-20 pointer-events-none"
                  style={{ left: nowX }}
                >
                  <div className="w-2 h-2 rounded-full bg-red-500 -ml-0.5 -mt-1" />
                </div>
              )}

              {/* ── Unassigned row ── */}
              <TechRow
                tech={{ full_name: 'Unassigned Appointments', id: 'unassigned' }}
                appointments={unassigned}
                onPreview={openPreview}
                onClickCell={(_, h) => openNew({ id: 'unassigned' }, h)}
                isUnassigned
              />

              {/* ── Technician rows ── */}
              {profiles.length === 0 ? (
                <div className="flex items-center justify-center py-12 text-sm text-gray-400">
                  No active users found.{' '}
                  <a href="/users/new" className="text-blue-600 hover:underline ml-1">Add users</a>{' '}
                  to see them here.
                </div>
              ) : (
                profiles.map(tech => (
                  <TechRow
                    key={tech.id}
                    tech={tech}
                    appointments={byTech[tech.id] || []}
                    onPreview={openPreview}
                    onClickCell={openNew}
                    isUnassigned={false}
                  />
                ))
              )}

            </div>
          </div>
        )}
      </div>

      {/* ── Appointment count ── */}
      {!loading && (
        <p className="text-xs text-gray-400">
          {appointments.length} appointment{appointments.length !== 1 ? 's' : ''} on this day
        </p>
      )}

      {/* ── Preview ── */}
      {preview && (
        <AppointmentPreviewModal
          appointment={preview}
          onClose={() => setPreview(null)}
          onEdit={openEditFromPreview}
        />
      )}

      {/* ── Modal ── */}
      {modal && (
        <AppointmentModal
          appointment={modal.appt || null}
          presetDate={date}
          presetStartHour={modal.startHour ?? 9}
          presetTechId={modal.techId ?? null}
          onClose={() => setModal(null)}
          onSaved={load}
        />
      )}

    </PageContainer>
  )
}
