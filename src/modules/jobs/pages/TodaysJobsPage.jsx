import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import {
  CalendarDays, ChevronLeft, ChevronRight, ChevronDown, ClipboardList,
  CheckCircle, Truck, Clock, AlertTriangle, Users, RefreshCw,
} from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import PageContainer from '../../../shared/components/PageContainer.jsx'
import FilterBar from '../../../shared/components/FilterBar'
import { isFilterActive, matchesFilters, matchesWords, toOptions } from '../../../shared/utils/listFilters'
import { APPOINTMENT_STATUS_META } from '../../../shared/constants/appointmentStatuses'

// Every appointment status rolls up into one of these buckets so each
// technician's day reads as done / underway / still to do / hit a snag.
// Cancelled visits are left out of the totals entirely.
const BUCKETS = {
  done:    { label: 'Done',        color: '#16a34a', statuses: ['completed'] },
  active:  { label: 'In progress', color: '#f97316', statuses: ['on_route', 'on_site'] },
  pending: { label: 'Not started', color: '#3b82f6', statuses: ['not_dispatched', 'awaiting', 'received', 'accepted'] },
  issues:  { label: 'Issues',      color: '#dc2626', statuses: ['declined', 'no_access', 'abandoned', 'on_hold', 'awaiting_auth', 'follow_on'] },
}
const BUCKET_KEYS = Object.keys(BUCKETS)

function bucketOf(status) {
  return BUCKET_KEYS.find(k => BUCKETS[k].statuses.includes(status)) ?? 'pending'
}

// Signing a job off (and the admin confirming it) historically never touched
// the visit, so a finished job's appointment could sit on "On Site" forever.
// Once the job itself is signed off, an in-progress or not-started visit on
// it counts as completed. Issue statuses (no access, on hold…) are kept.
const JOB_SIGNED_OFF = ['pending_confirmation', 'completed', 'invoiced']
function withEffectiveStatus(appt) {
  const signedOff = JOB_SIGNED_OFF.includes(appt.jobs?.status)
  const open = ['active', 'pending'].includes(bucketOf(appt.status))
  return signedOff && open ? { ...appt, raw_status: appt.status, status: 'completed' } : appt
}

// Local-day boundaries as ISO instants, so "today" means today in SAST
// rather than today in UTC.
function dayRange(dateStr, days = 1) {
  const start = new Date(`${dateStr}T00:00:00`)
  const end = new Date(start)
  end.setDate(end.getDate() + days)
  return [start.toISOString(), end.toISOString()]
}

function toDateStr(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function shiftDate(dateStr, delta) {
  const d = new Date(`${dateStr}T00:00:00`)
  d.setDate(d.getDate() + delta)
  return toDateStr(d)
}

function formatTime(iso) {
  return iso ? new Date(iso).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' }) : '—'
}

function formatHours(ms) {
  if (!ms) return '—'
  const mins = Math.round(ms / 60000)
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`
}

async function fetchDay(dateStr) {
  const [from, to] = dayRange(dateStr)
  const { data, error } = await supabase
    .from('appointments')
    .select(`
      id, scheduled_start, scheduled_end, status, job_id,
      jobs(id, job_ref, title, priority, status, job_type, site_address, site_city, archived_at, customers(customer_name)),
      appointment_assignments(id, technician_id, actual_start, actual_end, profiles(id, full_name, color, role))
    `)
    .gte('scheduled_start', from)
    .lt('scheduled_start', to)
    .neq('status', 'cancelled')
    .order('scheduled_start')
  if (error) throw error
  return (data ?? []).filter(a => !a.jobs?.archived_at).map(withEffectiveStatus)
}

// Scheduled vs completed for the 7 days ending on the selected date.
async function fetchWeekTrend(dateStr) {
  const firstDay = shiftDate(dateStr, -6)
  const [from, to] = dayRange(firstDay, 7)
  const { data, error } = await supabase
    .from('appointments')
    .select('scheduled_start, status, jobs(status, archived_at)')
    .gte('scheduled_start', from)
    .lt('scheduled_start', to)
    .neq('status', 'cancelled')
  if (error) throw error

  const days = Array.from({ length: 7 }, (_, i) => shiftDate(firstDay, i))
  const rows = Object.fromEntries(days.map(d => [d, { scheduled: 0, completed: 0 }]))
  for (const a of (data ?? []).filter(x => !x.jobs?.archived_at).map(withEffectiveStatus)) {
    const key = toDateStr(new Date(a.scheduled_start))
    if (!rows[key]) continue
    rows[key].scheduled += 1
    if (a.status === 'completed') rows[key].completed += 1
  }
  return days.map(d => ({
    name: new Date(`${d}T00:00:00`).toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric' }),
    ...rows[d],
  }))
}

async function fetchTechnicians() {
  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, color, role')
    .eq('is_active', true)
    .eq('role', 'technician')
    .order('full_name')
  return data ?? []
}

// Folds the day's appointments into one row per technician. A visit with a
// lead + second tech counts toward both of them.
function buildTechRows(appointments, technicians) {
  const rows = new Map()
  const ensure = p => {
    if (!rows.has(p.id)) {
      rows.set(p.id, {
        id: p.id, name: p.full_name ?? 'Unknown', color: p.color || '#3B82F6',
        done: 0, active: 0, pending: 0, issues: 0, total: 0, onSiteMs: 0, jobs: [],
      })
    }
    return rows.get(p.id)
  }
  for (const t of technicians) ensure(t)

  for (const appt of appointments) {
    const bucket = bucketOf(appt.status)
    for (const asg of appt.appointment_assignments ?? []) {
      if (!asg.profiles) continue
      const row = ensure(asg.profiles)
      row[bucket] += 1
      row.total += 1
      if (asg.actual_start) {
        const end = asg.actual_end ? new Date(asg.actual_end) : new Date()
        row.onSiteMs += Math.max(0, end - new Date(asg.actual_start))
      }
      row.jobs.push({ appt, asg })
    }
  }

  return [...rows.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
}

// Jobs scheduled to start in each hour vs jobs signed off in each hour.
function buildHourly(appointments) {
  const hours = Array.from({ length: 24 }, (_, h) => ({ hour: h, scheduled: 0, completed: 0 }))
  for (const a of appointments) {
    hours[new Date(a.scheduled_start).getHours()].scheduled += 1
    if (a.status === 'completed') {
      const ends = (a.appointment_assignments ?? []).map(x => x.actual_end).filter(Boolean).sort()
      const finished = ends.at(-1) ?? a.scheduled_end
      hours[new Date(finished).getHours()].completed += 1
    }
  }
  const used = hours.filter(h => h.scheduled || h.completed).map(h => h.hour)
  const first = Math.min(7, ...used)
  const last = Math.max(17, ...used)
  return hours.slice(first, last + 1).map(h => ({ ...h, name: `${String(h.hour).padStart(2, '0')}:00` }))
}

// Everything about a visit that the search bar / Keywords box looks through.
function keywordText(a) {
  const j = a.jobs ?? {}
  return [
    j.job_ref, j.title, j.customers?.customer_name, j.priority, j.status, j.job_type, j.site_address, j.site_city,
    a.status, APPOINTMENT_STATUS_META[a.status]?.label, BUCKETS[bucketOf(a.status)].label,
    ...(a.appointment_assignments ?? []).map(x => x.profiles?.full_name),
  ].join(' ')
}

const tooltipStyle = { fontSize: 12, borderRadius: 8 }
const axisTick = { fontSize: 11, fill: '#6B7280' }

function ChartCard({ title, subtitle, className = '', height = 'h-72', children }) {
  return (
    <div className={`bg-white rounded-xl border border-gray-200 p-5 ${className}`}>
      <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
      {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
      <div className={`${height} mt-3`}>{children}</div>
    </div>
  )
}

function EmptyChart({ text = 'No jobs scheduled' }) {
  return <div className="h-full flex items-center justify-center text-sm text-gray-400">{text}</div>
}

function StatusPill({ status }) {
  const meta = APPOINTMENT_STATUS_META[status]
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-50 text-gray-700 border border-gray-200">
      <span className="w-2 h-2 rounded-full" style={{ background: meta?.dot ?? '#9ca3af' }} />
      {meta?.label ?? status}
    </span>
  )
}

function ProgressBar({ row }) {
  if (!row.total) return <div className="h-2 rounded-full bg-gray-100" />
  return (
    <div className="flex h-2 rounded-full overflow-hidden bg-gray-100">
      {BUCKET_KEYS.map(k => row[k] > 0 && (
        <div key={k} style={{ width: `${(row[k] / row.total) * 100}%`, background: BUCKETS[k].color }} />
      ))}
    </div>
  )
}

export default function TodaysJobsPage() {
  const today = toDateStr(new Date())
  const [date, setDate] = useState(today)
  const [appointments, setAppointments] = useState([])
  const [technicians, setTechnicians] = useState([])
  const [trend, setTrend] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [updatedAt, setUpdatedAt] = useState(null)
  const [expanded, setExpanded] = useState(null)
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState({})

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true)
    try {
      const [day, techs, week] = await Promise.all([fetchDay(date), fetchTechnicians(), fetchWeekTrend(date)])
      setAppointments(day)
      setTechnicians(techs)
      setTrend(week)
      setError(null)
      setUpdatedAt(new Date())
    } catch (err) {
      setError(err.message ?? 'Could not load jobs')
    } finally {
      setLoading(false)
    }
  }, [date])

  useEffect(() => { load() }, [load])

  // Keep today's board live while it's open on the office screen.
  useEffect(() => {
    if (date !== today) return
    const t = setInterval(() => load(true), 60_000)
    return () => clearInterval(t)
  }, [date, today, load])

  const filterFields = useMemo(() => {
    const people = new Map(technicians.map(t => [t.id, t.full_name]))
    for (const a of appointments) {
      for (const asg of a.appointment_assignments ?? []) if (asg.profiles) people.set(asg.profiles.id, asg.profiles.full_name)
    }
    const statuses = [...new Set(appointments.map(a => a.status))]
    return [
      { key: 'keywords',   label: 'Keywords',   type: 'text', placeholder: 'Any words', hint: 'Searches the job ref, title, customer, technician, status, priority, job type and address' },
      { key: 'jobRef',     label: 'Job Ref',    type: 'text', placeholder: 'Job ref or title' },
      { key: 'customer',   label: 'Customer',   type: 'text', placeholder: 'Customer name' },
      { key: 'technician', label: 'Technician', type: 'multi', options: [...people].map(([value, label]) => ({ value, label: label ?? 'Unknown' })).sort((a, b) => a.label.localeCompare(b.label)) },
      { key: 'bucket',     label: 'Progress',   type: 'multi', options: BUCKET_KEYS.map(k => ({ value: k, label: BUCKETS[k].label })) },
      { key: 'status',     label: 'App. Status', type: 'multi', options: statuses.map(st => ({ value: st, label: APPOINTMENT_STATUS_META[st]?.label ?? st })) },
      { key: 'priority',   label: 'Priority',   type: 'multi', options: toOptions(['low', 'medium', 'high', 'urgent']) },
    ]
  }, [appointments, technicians])

  const filtering = !!search.trim() || Object.values(filters).some(isFilterActive)

  // Everything on the board below (KPIs, charts, breakdown) follows the search
  // and filters; the 7-day trend stays unfiltered as a baseline.
  const visibleAppointments = useMemo(() => {
    return appointments.filter(a => {
      if (!matchesWords(keywordText(a), search)) return false
      return matchesFilters(a, filterFields, filters, (row, key) =>
        key === 'technician' ? (row.appointment_assignments ?? []).map(x => x.technician_id)
        : key === 'bucket' ? bucketOf(row.status)
        : key === 'priority' ? row.jobs?.priority
        : key === 'keywords' ? keywordText(row)
        : key === 'jobRef' ? [row.jobs?.job_ref, row.jobs?.title]
        : key === 'customer' ? row.jobs?.customers?.customer_name
        : row.status)
    })
  }, [appointments, search, filters, filterFields])

  const techRows = useMemo(() => {
    // While filtering, only show technicians with matching jobs.
    const rows = buildTechRows(visibleAppointments, filtering ? [] : technicians)
    const techIds = filters.technician ?? []
    return techIds.length ? rows.filter(r => techIds.includes(r.id)) : rows
  }, [visibleAppointments, technicians, filtering, filters.technician])
  const hourly = useMemo(() => buildHourly(visibleAppointments), [visibleAppointments])

  const totals = useMemo(() => {
    const t = { total: visibleAppointments.length, done: 0, active: 0, pending: 0, issues: 0, unassigned: 0 }
    for (const a of visibleAppointments) {
      t[bucketOf(a.status)] += 1
      if (!(a.appointment_assignments ?? []).length) t.unassigned += 1
    }
    return t
  }, [visibleAppointments])

  const statusBreakdown = useMemo(() => {
    const counts = {}
    for (const a of visibleAppointments) counts[a.status] = (counts[a.status] || 0) + 1
    return Object.entries(counts)
      .map(([status, value]) => ({
        name: APPOINTMENT_STATUS_META[status]?.label ?? status,
        value,
        color: APPOINTMENT_STATUS_META[status]?.dot ?? '#9ca3af',
      }))
      .sort((a, b) => b.value - a.value)
  }, [visibleAppointments])

  const busyTechs = techRows.filter(r => r.total > 0)
  const completionPct = totals.total ? Math.round((totals.done / totals.total) * 100) : 0
  const isToday = date === today
  const heading = isToday
    ? "Today's Jobs"
    : new Date(`${date}T00:00:00`).toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  const kpis = [
    { label: 'Jobs loaded',   value: totals.total,   icon: ClipboardList, color: 'text-blue-600',   bg: 'bg-blue-50',   hint: totals.unassigned ? `${totals.unassigned} unassigned` : 'All assigned' },
    { label: 'Done',          value: totals.done,    icon: CheckCircle,   color: 'text-green-600',  bg: 'bg-green-50',  hint: `${completionPct}% complete` },
    { label: 'In progress',   value: totals.active,  icon: Truck,         color: 'text-orange-600', bg: 'bg-orange-50', hint: 'On route / on site' },
    { label: 'Not started',   value: totals.pending, icon: Clock,         color: 'text-indigo-600', bg: 'bg-indigo-50', hint: 'Awaiting / accepted' },
    { label: 'Issues',        value: totals.issues,  icon: AlertTriangle, color: 'text-red-600',    bg: 'bg-red-50',    hint: 'No access, on hold…' },
    { label: 'Technicians out', value: busyTechs.length, icon: Users,     color: 'text-slate-700',  bg: 'bg-slate-100', hint: `of ${techRows.length} on the board` },
  ]

  return (
    <PageContainer>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{heading}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Each technician's workload for the day
            {updatedAt && <span className="text-gray-400"> · updated {formatTime(updatedAt.toISOString())}{isToday && ', refreshes every minute'}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setDate(d => shiftDate(d, -1))} className="p-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50" aria-label="Previous day">
            <ChevronLeft size={16} />
          </button>
          <label className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-sm">
            <CalendarDays size={15} className="text-gray-400" />
            <input type="date" value={date} onChange={e => e.target.value && setDate(e.target.value)} className="outline-none bg-transparent" />
          </label>
          <button onClick={() => setDate(d => shiftDate(d, 1))} className="p-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50" aria-label="Next day">
            <ChevronRight size={16} />
          </button>
          {!isToday && (
            <button onClick={() => setDate(today)} className="px-3 py-2 rounded-lg text-sm font-medium text-blue-600 hover:bg-blue-50">Today</button>
          )}
          <button onClick={() => load()} className="p-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50" aria-label="Refresh">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        placeholder="Search job ref, title, customer, technician…"
        fields={filterFields}
        values={filters}
        onChange={setFilters}
      />

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {kpis.map(card => {
          const Icon = card.icon
          return (
            <div key={card.label} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className={`w-10 h-10 ${card.bg} rounded-lg flex items-center justify-center mb-3`}>
                <Icon size={20} className={card.color} />
              </div>
              <div className="text-2xl font-bold text-gray-900 tabular-nums">{loading ? '–' : card.value}</div>
              <div className="text-sm text-gray-600 mt-0.5">{card.label}</div>
              <div className="text-xs text-gray-400 mt-0.5">{loading ? ' ' : card.hint}</div>
            </div>
          )
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartCard
          title="Jobs per technician"
          subtitle="Loaded for the day, split by progress"
          className="lg:col-span-2"
          height={busyTechs.length > 6 ? 'h-96' : 'h-72'}
        >
          {loading || !techRows.length ? <EmptyChart text={loading ? 'Loading…' : 'No technicians found'} /> : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={techRows} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#F1F5F9" />
                <XAxis type="number" tick={axisTick} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={axisTick} axisLine={false} tickLine={false} width={110} />
                <Tooltip cursor={{ fill: '#F8FAFC' }} contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {BUCKET_KEYS.map((k, i) => (
                  <Bar key={k} dataKey={k} name={BUCKETS[k].label} stackId="jobs" fill={BUCKETS[k].color}
                    radius={i === BUCKET_KEYS.length - 1 ? [0, 4, 4, 0] : 0} maxBarSize={28} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Status breakdown" subtitle={`${totals.total} job${totals.total === 1 ? '' : 's'} on the board`}>
          {loading || !statusBreakdown.length ? <EmptyChart text={loading ? 'Loading…' : undefined} /> : (
            <div className="relative h-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={statusBreakdown} dataKey="value" nameKey="name" cx="50%" cy="45%" innerRadius={55} outerRadius={80} paddingAngle={2}>
                    {statusBreakdown.map(s => <Cell key={s.name} fill={s.color} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute left-0 right-0 flex flex-col items-center pointer-events-none" style={{ top: 'calc(45% - 22px)' }}>
                <span className="text-2xl font-bold text-gray-900 tabular-nums">{completionPct}%</span>
                <span className="text-[11px] text-gray-400">done</span>
              </div>
            </div>
          )}
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Through the day" subtitle="Jobs scheduled to start vs jobs signed off, per hour">
          {loading || !totals.total ? <EmptyChart text={loading ? 'Loading…' : undefined} /> : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={hourly} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                <XAxis dataKey="name" tick={axisTick} axisLine={false} tickLine={false} />
                <YAxis tick={axisTick} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="scheduled" name="Scheduled" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="completed" name="Completed" stroke="#16a34a" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Last 7 days" subtitle="Jobs loaded vs jobs completed each day">
          {loading || !trend.length ? <EmptyChart text={loading ? 'Loading…' : undefined} /> : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trend} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                <XAxis dataKey="name" tick={axisTick} axisLine={false} tickLine={false} />
                <YAxis tick={axisTick} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip cursor={{ fill: '#F8FAFC' }} contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="scheduled" name="Loaded" fill="#93c5fd" radius={[4, 4, 0, 0]} maxBarSize={28} />
                <Bar dataKey="completed" name="Completed" fill="#16a34a" radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Technician breakdown</h2>
          <Link to="/planner/time" className="text-sm text-blue-600 hover:text-blue-700 font-medium">Open Time Planner →</Link>
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Loading…</div>
        ) : !techRows.length ? (
          <div className="p-8 text-center text-gray-500 text-sm">No technicians on the board for this day.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-100">
                  <th className="text-left px-5 py-3">Technician</th>
                  <th className="text-right px-3 py-3">Loaded</th>
                  <th className="text-right px-3 py-3">Done</th>
                  <th className="text-right px-3 py-3">In progress</th>
                  <th className="text-right px-3 py-3">Not started</th>
                  <th className="text-right px-3 py-3">Issues</th>
                  <th className="text-left px-5 py-3 min-w-[160px]">Progress</th>
                  <th className="text-right px-5 py-3">On site</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {techRows.map(row => {
                  const open = expanded === row.id
                  const pct = row.total ? Math.round((row.done / row.total) * 100) : 0
                  return (
                    <Fragment key={row.id}>
                      <tr
                        className={`transition-colors ${row.total ? 'cursor-pointer hover:bg-gray-50' : 'text-gray-400'}`}
                        onClick={() => row.total && setExpanded(open ? null : row.id)}
                      >
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2 font-medium text-gray-900">
                            <ChevronDown size={14} className={`text-gray-400 transition-transform ${open ? '' : '-rotate-90'} ${row.total ? '' : 'invisible'}`} />
                            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: row.color }} />
                            {row.name}
                            {!row.total && <span className="text-xs font-normal text-gray-400">· no jobs</span>}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums font-semibold text-gray-900">{row.total}</td>
                        <td className="px-3 py-3 text-right tabular-nums text-green-700">{row.done}</td>
                        <td className="px-3 py-3 text-right tabular-nums text-orange-600">{row.active}</td>
                        <td className="px-3 py-3 text-right tabular-nums text-blue-600">{row.pending}</td>
                        <td className="px-3 py-3 text-right tabular-nums text-red-600">{row.issues}</td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <div className="flex-1"><ProgressBar row={row} /></div>
                            <span className="text-xs text-gray-500 tabular-nums w-9 text-right">{pct}%</span>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-right tabular-nums text-gray-600">{formatHours(row.onSiteMs)}</td>
                      </tr>
                      {open && (
                        <tr className="bg-gray-50/60">
                          <td colSpan={8} className="px-5 py-3">
                            <div className="space-y-2">
                              {row.jobs.map(({ appt, asg }) => (
                                <div key={asg.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 bg-white rounded-lg border border-gray-200 px-4 py-2.5">
                                  <span className="text-xs text-gray-500 tabular-nums w-24">
                                    {formatTime(appt.scheduled_start)}–{formatTime(appt.scheduled_end)}
                                  </span>
                                  <Link to={`/jobs/${appt.job_id}`} className="font-medium text-gray-900 hover:text-blue-600 flex-1 min-w-[180px]">
                                    <span className="font-mono text-xs text-gray-400 mr-2">{appt.jobs?.job_ref ?? '—'}</span>
                                    {appt.jobs?.title ?? 'Untitled job'}
                                  </Link>
                                  <span className="text-gray-500 text-xs">{appt.jobs?.customers?.customer_name ?? ''}</span>
                                  <StatusPill status={appt.status} />
                                  <span className="text-xs text-gray-400 tabular-nums">
                                    {asg.actual_start ? `On site ${formatTime(asg.actual_start)}${asg.actual_end ? `–${formatTime(asg.actual_end)}` : ' (now)'}` : 'Not clocked in'}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </PageContainer>
  )
}
