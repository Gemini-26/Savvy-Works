import { toDateStr } from './formatDate'

// Quick ranges for the clock-in screens. "from" and "to" are local calendar
// days ("2026-11-05"), both inclusive.
export const RANGE_PRESETS = [
  { key: 'today', label: 'Today' },
  { key: '7d',    label: 'Last 7 days' },
  { key: '14d',   label: 'Last 14 days' },
  { key: 'month', label: 'This month' },
  { key: 'custom', label: 'Custom' },
]

function daysAgo(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return toDateStr(d)
}

export function rangeForPreset(key) {
  const today = toDateStr(new Date())
  switch (key) {
    case 'today': return { from: today, to: today }
    case '14d':   return { from: daysAgo(13), to: today }
    case 'month': {
      const now = new Date()
      return { from: toDateStr(new Date(now.getFullYear(), now.getMonth(), 1)), to: today }
    }
    case '7d':
    default:      return { from: daysAgo(6), to: today }
  }
}

export function makeRange(key = '7d') {
  return { preset: key, ...rangeForPreset(key) }
}

// The inclusive local-day range as the instants the database compares against:
// midnight at the start of "from" up to (not including) midnight after "to".
export function rangeBounds({ from, to }) {
  const [fy, fm, fd] = from.split('-').map(Number)
  const [ty, tm, td] = to.split('-').map(Number)
  return {
    fromIso: new Date(fy, fm - 1, fd).toISOString(),
    toIso: new Date(ty, tm - 1, td + 1).toISOString(),
  }
}

export function isValidRange({ from, to } = {}) {
  return !!from && !!to && from <= to
}
