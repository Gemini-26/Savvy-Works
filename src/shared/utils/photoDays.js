import { toDateStr } from './formatDate'

// Job photos are filed under the local day they were uploaded ("2026-10-09"),
// so a multi-day job reads as one set of pictures per day on site.

const DAY_LABEL = new Intl.DateTimeFormat('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' })
const DAY_LABEL_YEAR = new Intl.DateTimeFormat('en-ZA', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })

function parseKey(key) {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function shiftKey(key, days) {
  const d = parseKey(key)
  d.setDate(d.getDate() + days)
  return toDateStr(d)
}

// The day a timestamp falls on, never later than today (a phone clock running
// ahead must not create a "tomorrow" tab).
export function dayKeyFor(value, todayKey) {
  const key = toDateStr(value)
  return key > todayKey ? todayKey : key
}

// "Today's Pictures", "Yesterday's Pictures", otherwise the date: "Mon, 5 Oct".
export function pictureDayLabel(key, todayKey) {
  if (key === todayKey) return "Today's Pictures"
  if (key === shiftKey(todayKey, -1)) return "Yesterday's Pictures"
  const d = parseKey(key)
  const fmt = d.getFullYear() === parseKey(todayKey).getFullYear() ? DAY_LABEL : DAY_LABEL_YEAR
  return fmt.format(d)
}

// Days to offer as tabs, newest first: today always, plus every earlier day
// that has photos or a visit by this technician on the job.
export function pictureDayKeys(photos, visits, todayKey) {
  const keys = new Set([todayKey])
  for (const p of photos) keys.add(dayKeyFor(p.created_at, todayKey))
  for (const v of visits) {
    const key = toDateStr(v.scheduled_start)
    if (key < todayKey) keys.add(key)
  }
  return [...keys].sort().reverse()
}
