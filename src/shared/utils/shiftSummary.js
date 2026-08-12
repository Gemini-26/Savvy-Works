import { toDateStr } from './formatDate'

export function formatHoursDuration(ms) {
  const totalMinutes = Math.round(ms / 60000)
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

// Monday of the week containing `date`.
function startOfWeek(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const day = d.getDay()
  const diff = (day === 0 ? -6 : 1) - day
  d.setDate(d.getDate() + diff)
  return d
}

// Groups closed shifts into daily/weekly/monthly total-hours buckets, newest first.
export function summarizeShiftsByPeriod(shifts) {
  const daily = {}
  const weekly = {}
  const monthly = {}

  for (const s of shifts) {
    if (!s.clock_out) continue
    const start = new Date(s.clock_in)
    const durationMs = new Date(s.clock_out) - start

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

// "2026-08" -> "August 2026"
export function formatMonthLabel(monthKey) {
  const [y, m] = monthKey.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' })
}
