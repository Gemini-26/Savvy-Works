import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, ChevronRight, Clock, Search, X } from 'lucide-react'
import PageContainer from '../../../shared/components/PageContainer.jsx'
import PageHeader from '../../../shared/components/PageHeader'
import EmptyState from '../../../shared/components/EmptyState'
import DateRangeFilter from '../../../shared/components/DateRangeFilter'
import ClockTimesModal from '../../../shared/components/ClockTimesModal'
import TeamShiftAdjustedNote from '../../../shared/components/TeamShiftAdjustedNote'
import { fetchTeamShiftsInRange, adjustTeamShiftTimes, onTeamShiftChange } from '../../../shared/services/teamShiftService'
import { makeRange, rangeBounds, isValidRange } from '../../../shared/utils/dateRange'
import { teamPlace, teamShiftMs } from '../../../shared/utils/teamShiftText'
import { formatHoursDuration } from '../../../shared/utils/shiftSummary'
import { formatDate, formatTime, toDateStr } from '../../../shared/utils/formatDate'
import { useCurrentUser } from '../../../hooks/useCurrentUser'

// A shift this long is almost always a clock-out nobody tapped.
const LONG_SHIFT_MS = 14 * 3_600_000

const STATUS_FILTERS = [
  { key: 'all',  label: 'All' },
  { key: 'in',   label: 'Still clocked in' },
  { key: 'out',  label: 'Clocked out' },
  { key: 'long', label: 'Long shifts' },
]

const SORTS = [
  { key: 'name',   label: 'Name A–Z' },
  { key: 'recent', label: 'Most recent' },
  { key: 'hours',  label: 'Most hours' },
]

// Casuals are added on the fly, so the same person is often on more than one
// team_members record ("Rowen" typed on two different days). Group by the
// name, ignoring case and extra spaces, so they read as one person.
const nameKey = name => (name || 'Unknown').trim().replace(/\s+/g, ' ').toLowerCase()

// How the name is shown on a block. Typed by technicians in a hurry
// ("tsepo kgomo", "jimmy"), so capitalise each word — it also keeps the heading
// the same whichever of a person's records a filter happens to leave first.
const displayName = name => (name || 'Unknown').trim().replace(/\s+/g, ' ')
  .replace(/(^|\s)(\p{L})/gu, (_, space, letter) => space + letter.toUpperCase())

function matchesSearch(shift, needle) {
  if (!needle) return true
  const haystack = [
    shift.team_members?.full_name,
    shift.site_label,
    shift.jobs?.job_ref,
    shift.jobs?.title,
    shift.jobs?.site_address,
    shift.clocked_in_by_profile?.full_name,
  ].filter(Boolean).join(' ').toLowerCase()
  return haystack.includes(needle)
}

function matchesStatus(shift, status) {
  if (status === 'in') return !shift.clock_out
  if (status === 'out') return !!shift.clock_out
  if (status === 'long') return teamShiftMs(shift) > LONG_SHIFT_MS
  return true
}

// Casuals are one-day labourers a technician adds on the fly from the clock-in
// screen (team_members.is_casual). Each time one is clocked in is a row in
// team_member_shifts — this page lists them for a date range, one block per
// person, and lets an admin correct the times.
export default function CasualClockInsPage() {
  const { isAdmin } = useCurrentUser()
  const [range, setRange] = useState(() => makeRange('7d'))
  const [shifts, setShifts] = useState([])
  const [loadedRange, setLoadedRange] = useState(null)
  const [error, setError] = useState(null)
  const [editing, setEditing] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)

  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [sort, setSort] = useState('name')
  // Names (nameKey) whose block is folded shut.
  const [collapsed, setCollapsed] = useState(() => new Set())

  const { from, to } = range
  const valid = isValidRange({ from, to })
  // Loading until the current dates have come back once; a refetch after an
  // edit or a clock-in swaps the rows in place without blanking the list.
  const rangeKey = `${from}|${to}`
  const loading = valid && loadedRange !== rangeKey

  useEffect(() => {
    if (!valid) return
    let cancelled = false
    const { fromIso, toIso } = rangeBounds({ from, to })
    fetchTeamShiftsInRange({ from: fromIso, to: toIso, casualOnly: true })
      .then(rows => { if (!cancelled) { setShifts(rows); setError(null); setLoadedRange(`${from}|${to}`) } })
      .catch(err => { if (!cancelled) { setError(err.message || 'Failed to load casual clock-ins'); setLoadedRange(`${from}|${to}`) } })
    return () => { cancelled = true }
  }, [from, to, valid, reloadKey])

  // Someone clocked in/out or an admin edited a time elsewhere: refetch.
  useEffect(() => onTeamShiftChange(() => setReloadKey(k => k + 1)), [])

  const needle = search.trim().toLowerCase()
  const filtering = !!needle || status !== 'all'

  const visible = useMemo(
    () => shifts.filter(s => matchesSearch(s, needle) && matchesStatus(s, status)),
    [shifts, needle, status],
  )

  // One block per person (by name). Shifts arrive newest first, so the first
  // one seen for a name is their most recent.
  const groups = useMemo(() => {
    const byName = new Map()
    for (const s of visible) {
      const key = nameKey(s.team_members?.full_name)
      if (!byName.has(key)) {
        byName.set(key, {
          key,
          name: displayName(s.team_members?.full_name),
          linkId: s.team_member_id,
          memberIds: new Set(),
          shifts: [],
          days: new Set(),
          totalMs: 0,
          open: 0,
        })
      }
      const g = byName.get(key)
      g.memberIds.add(s.team_member_id)
      g.shifts.push(s)
      g.days.add(toDateStr(s.clock_in))
      g.totalMs += teamShiftMs(s)
      if (!s.clock_out) g.open += 1
    }
    const list = [...byName.values()]
    if (sort === 'hours') list.sort((a, b) => b.totalMs - a.totalMs || a.name.localeCompare(b.name))
    else if (sort === 'recent') list.sort((a, b) => new Date(b.shifts[0].clock_in) - new Date(a.shifts[0].clock_in))
    else list.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
    return list
  }, [visible, sort])

  const totalMs = groups.reduce((sum, g) => sum + g.totalMs, 0)
  const stillIn = groups.reduce((sum, g) => sum + g.open, 0)
  const allCollapsed = groups.length > 0 && groups.every(g => collapsed.has(g.key))

  function toggle(key) {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function clearFilters() {
    setSearch('')
    setStatus('all')
  }

  return (
    <PageContainer>
      <PageHeader
        title="Casual Clock-ins"
        subtitle="Every time a one-day casual was clocked in on a site — one block per person, with when, where, who clocked them and the hours"
      />

      <div className="mt-4">
        <DateRangeFilter value={range} onChange={setRange} />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mt-4">{error}</div>
      )}

      {!valid ? (
        <p className="text-sm text-gray-400 mt-4">Pick a from and to date.</p>
      ) : loading ? (
        <p className="text-sm text-gray-400 mt-4">Loading…</p>
      ) : shifts.length === 0 ? (
        <EmptyState title="No casuals clocked in" description="No casual was clocked in during this period." />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 mt-4">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search name, job number or site"
                aria-label="Search casual clock-ins"
                className="w-64 max-w-full pl-8 pr-7 py-1.5 text-xs border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {search && (
                <button type="button" onClick={() => setSearch('')} aria-label="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X size={13} />
                </button>
              )}
            </div>

            {STATUS_FILTERS.map(f => (
              <button
                key={f.key}
                type="button"
                onClick={() => setStatus(f.key)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                  status === f.key ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {f.label}
              </button>
            ))}

            <label className="flex items-center gap-1.5 text-xs text-gray-500 ml-auto">
              Sort
              <select
                value={sort}
                onChange={e => setSort(e.target.value)}
                className="px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {SORTS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
            </label>
            {groups.length > 0 && (
              <button
                type="button"
                onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(groups.map(g => g.key)))}
                className="text-xs font-semibold text-blue-600 hover:text-blue-700"
              >
                {allCollapsed ? 'Expand all' : 'Collapse all'}
              </button>
            )}
          </div>

          {filtering && (
            <p className="text-xs text-gray-500 mt-2">
              Showing {visible.length} of {shifts.length} clock-ins.{' '}
              <button type="button" onClick={clearFilters} className="font-semibold text-blue-600 hover:text-blue-700">Clear filters</button>
            </p>
          )}

          {visible.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-6 mt-4 text-center">
              <p className="text-sm font-medium text-gray-900">No clock-ins match</p>
              <p className="text-xs text-gray-500 mt-1">Try a different name, or clear the filters.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                <Stat label="Casuals" value={groups.length} />
                <Stat label="Clock-ins" value={visible.length} />
                <Stat label="Total hours" value={formatHoursDuration(totalMs)} />
                <Stat label="Still clocked in" value={stillIn} highlight={stillIn > 0} />
              </div>

              <div className="space-y-3 mt-4">
                {groups.map(g => {
                  const isOpen = !collapsed.has(g.key)
                  return (
                    <div key={g.key} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                      <div
                        onClick={() => toggle(g.key)}
                        className="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 select-none"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <button
                            type="button"
                            aria-expanded={isOpen}
                            aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${g.name}`}
                            onClick={e => { e.stopPropagation(); toggle(g.key) }}
                            className="text-gray-400 hover:text-gray-600 shrink-0"
                          >
                            {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          </button>
                          <Link
                            to={`/users/team/${g.linkId}`}
                            onClick={e => e.stopPropagation()}
                            className="text-sm font-bold text-gray-900 hover:text-blue-600 truncate"
                          >
                            {g.name}
                          </Link>
                          <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0.5 shrink-0">Casual</span>
                          {g.open > 0 && (
                            <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-1.5 py-0.5 shrink-0">
                              Clocked in now
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 shrink-0 text-right">
                          {g.days.size} day{g.days.size === 1 ? '' : 's'} · {g.shifts.length} clock-in{g.shifts.length === 1 ? '' : 's'} ·{' '}
                          <span className="font-semibold text-gray-700">{formatHoursDuration(g.totalMs)}</span>
                        </p>
                      </div>

                      {isOpen && (
                        <div className="divide-y divide-gray-50 border-t border-gray-100 px-4">
                          {g.shifts.map(s => {
                            const ms = teamShiftMs(s)
                            return (
                              <div key={s.id} className="flex items-start justify-between gap-3 py-2.5">
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-gray-900">
                                    {formatDate(s.clock_in)} · {formatTime(s.clock_in)} – {s.clock_out
                                      ? formatTime(s.clock_out)
                                      : <span className="text-emerald-600">still clocked in</span>}
                                  </p>
                                  <p className="text-xs text-gray-500 truncate">
                                    {teamPlace(s)}
                                    {s.clocked_in_by_profile?.full_name ? ` · In by ${s.clocked_in_by_profile.full_name}` : ''}
                                    {s.clock_out && s.clocked_out_by_profile?.full_name ? ` · Out by ${s.clocked_out_by_profile.full_name}` : ''}
                                    {s.clock_out && s.auto_clocked_out ? ' · Out automatically' : ''}
                                  </p>
                                  <TeamShiftAdjustedNote shift={s} />
                                </div>
                                <div className="text-right shrink-0">
                                  <p className="text-sm font-semibold text-gray-700 tabular-nums flex items-center justify-end gap-1">
                                    <Clock size={12} className="text-gray-400" /> {formatHoursDuration(ms)}
                                  </p>
                                  {ms > LONG_SHIFT_MS && (
                                    <p className="text-[11px] font-semibold text-amber-600">Long shift — check the times</p>
                                  )}
                                  {isAdmin && (
                                    <button type="button" onClick={() => setEditing(s)} className="text-xs font-semibold text-blue-600 hover:text-blue-700">
                                      Edit times
                                    </button>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </>
      )}

      {editing && (
        <ClockTimesModal
          title="Edit casual clock-in"
          personName={editing.team_members?.full_name}
          startLabel="Clocked in"
          endLabel="Clocked out"
          openLabel="Still clocked in"
          start={editing.clock_in}
          end={editing.clock_out}
          originalStart={editing.original_clock_in}
          originalEnd={editing.original_clock_out}
          note={`${teamPlace(editing)}${editing.clocked_in_by_profile?.full_name ? ` · clocked in by ${editing.clocked_in_by_profile.full_name}` : ''}. Set a clock-out to close one that was never tapped.`}
          onSubmit={async ({ start, end, reason }) => {
            await adjustTeamShiftTimes(editing.id, { clock_in: start, clock_out: end }, reason)
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </PageContainer>
  )
}

function Stat({ label, value, highlight = false }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 px-4 py-3">
      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{label}</p>
      <p className={`text-xl font-bold tabular-nums ${highlight ? 'text-emerald-600' : 'text-gray-900'}`}>{value}</p>
    </div>
  )
}
