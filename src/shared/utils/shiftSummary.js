import { toDateStr } from './formatDate'

export function formatHoursDuration(ms) {
  const totalMinutes = Math.round(ms / 60000)
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

// Signed version for the payroll difference column. Anything that rounds to
// zero minutes prints as a plain "0m" rather than "-0m".
export function formatSignedHoursDuration(ms) {
  const text = formatHoursDuration(Math.abs(ms))
  return ms < 0 && text !== '0m' ? `-${text}` : text
}

// Monday of the week containing `date`.
function startOfWeek(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const day = d.getDay()
  const diff = (day === 0 ? -6 : 1) - day
  d.setDate(d.getDate() + diff)
  return d
}

// Buckets any list of start→end ranges into daily/weekly/monthly totals
// (keyed on the day the range started), newest first. Rows with no end
// time are still running and are skipped — they have no final duration yet.
function summarizeRangesByPeriod(rows, getStart, getEnd) {
  const daily = {}
  const weekly = {}
  const monthly = {}

  for (const row of rows || []) {
    const endValue = getEnd(row)
    const startValue = getStart(row)
    if (!endValue || !startValue) continue
    const start = new Date(startValue)
    const durationMs = new Date(endValue) - start

    const dayKey = toDateStr(start)
    daily[dayKey] = (daily[dayKey] || 0) + durationMs

    const weekKey = toDateStr(startOfWeek(start))
    weekly[weekKey] = (weekly[weekKey] || 0) + durationMs

    const monthKey = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`
    monthly[monthKey] = (monthly[monthKey] || 0) + durationMs
  }

  const toSortedList = obj =>
    Object.entries(obj)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, ms]) => ({ key, ms }))

  return {
    daily: toSortedList(daily),
    weekly: toSortedList(weekly),
    monthly: toSortedList(monthly),
  }
}

// Groups closed shifts into daily/weekly/monthly total-hours buckets, newest first.
export function summarizeShiftsByPeriod(shifts) {
  return summarizeRangesByPeriod(shifts, s => s.clock_in, s => s.clock_out)
}

// Same daily/weekly/monthly bucketing, but for on-site sessions
// (appointment_assignments rows: actual_start → actual_end).
export function summarizeOnSiteByPeriod(sessions) {
  return summarizeRangesByPeriod(sessions, s => s.actual_start, s => s.actual_end)
}

// Payroll view: for every period that has either kind of time, how many
// hours were clocked in for the day, how many of those were actually on
// site, and the difference between the two (travel, workshop, admin,
// anything not logged against a job).
export function summarizeHoursSplitByPeriod(shifts, onSiteSessions) {
  const clocked = summarizeShiftsByPeriod(shifts)
  const onSite = summarizeOnSiteByPeriod(onSiteSessions)

  const merge = (clockedRows, onSiteRows) => {
    const byKey = new Map()
    for (const row of clockedRows) byKey.set(row.key, { key: row.key, clockedMs: row.ms, onSiteMs: 0 })
    for (const row of onSiteRows) {
      const existing = byKey.get(row.key)
      if (existing) existing.onSiteMs = row.ms
      else byKey.set(row.key, { key: row.key, clockedMs: 0, onSiteMs: row.ms })
    }
    return [...byKey.values()]
      .map(row => ({ ...row, diffMs: row.clockedMs - row.onSiteMs }))
      .sort((a, b) => b.key.localeCompare(a.key))
  }

  return {
    daily:   merge(clocked.daily,   onSite.daily),
    weekly:  merge(clocked.weekly,  onSite.weekly),
    monthly: merge(clocked.monthly, onSite.monthly),
  }
}

// "2026-08" -> "August 2026"
export function formatMonthLabel(monthKey) {
  const [y, m] = monthKey.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' })
}

// The "with …" line under a technician's on-site session: the crew they
// signed onto the job, then where it was. Worded so it reads the same to an
// admin looking at someone else's log as to the technician reading their own.
export function describeOnSiteCrew(session) {
  const names = (session.team_members || []).map(m => m.full_name).filter(Boolean)
  const crew = names.length ? `With ${names.join(', ')}` : 'No crew'
  return session.site ? `${crew} · ${session.site}` : crew
}
