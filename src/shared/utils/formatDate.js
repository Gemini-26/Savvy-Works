// All dates are treated as local time (South Africa, SAST = UTC+2).
// Never use new Date(dateStr).toISOString() — that converts to UTC and shifts the day.

const SHORT    = new Intl.DateTimeFormat('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })
const LONG     = new Intl.DateTimeFormat('en-ZA', { day: '2-digit', month: 'long',  year: 'numeric' })
const DATETIME = new Intl.DateTimeFormat('en-ZA', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const TIME     = new Intl.DateTimeFormat('en-ZA', { hour: '2-digit', minute: '2-digit' })

function toDate(value) {
  if (!value) return null
  if (value instanceof Date) return value
  // "2026-06-23" → parse as local midnight, not UTC midnight
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-').map(Number)
    return new Date(y, m - 1, d)
  }
  return new Date(value)
}

// "23 Jun 2026"
export function formatDate(value) {
  const d = toDate(value)
  return d ? SHORT.format(d) : '—'
}

// "23 June 2026"
export function formatDateLong(value) {
  const d = toDate(value)
  return d ? LONG.format(d) : '—'
}

// "23 Jun 2026, 14:30"
export function formatDateTime(value) {
  if (!value) return '—'
  return DATETIME.format(new Date(value))
}

// "14:30"
export function formatTime(value) {
  if (!value) return '—'
  return TIME.format(new Date(value))
}

// "Today", "Yesterday", "2 days ago", or falls back to formatDate
export function formatDateRelative(value) {
  const d = toDate(value)
  if (!d) return '—'
  const now   = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diffDays = Math.round((today - target) / 86_400_000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays === -1) return 'Tomorrow'
  if (diffDays > 1 && diffDays < 8) return `${diffDays} days ago`
  return SHORT.format(d)
}

// "2026-06-23" — safe local ISO date string for DB/input fields
export function toDateStr(value) {
  const d = toDate(value)
  if (!d) return ''
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Today as "2026-06-23"
export function todayStr() {
  return toDateStr(new Date())
}
