import { useEffect, useMemo, useState } from 'react'
import { Search, MapPin, Plus } from 'lucide-react'
import { useCurrentUser } from '../../hooks/useCurrentUser'
import { fetchDropOffJobs } from '../services/teamShiftService'
import { fetchMyAppointments } from '../../modules/technician/services/technicianService'
import { toDateStr, todayStr } from '../utils/formatDate'

// "Which job?" — the job number a team member is clocked in on (with the
// technician, or dropped off at a site).
// The technician's own jobs for today come first, then any other open job
// (a labourer is often sent to a site the technician isn't booked on).
//
// "+ Add job site" is for a job that isn't on the system yet: they type a job
// number or an address. onChange gets an existing job, or { id: null,
// site_text } for typed text (null while nothing is picked/typed). If what
// they typed is exactly an open job's number, that job is used, so the
// clock-in is still linked to it.
export default function JobSitePicker({ value, onChange, label = 'Job number', addLabel = 'New job number' }) {
  const { profile } = useCurrentUser()
  const [jobs, setJobs] = useState([])
  const [todayIds, setTodayIds] = useState(() => new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState(false)
  const [siteText, setSiteText] = useState('')

  useEffect(() => {
    let alive = true
    fetchDropOffJobs()
      .then(list => alive && setJobs(list))
      .catch(err => alive && setError(err.message || 'Could not load jobs'))
      .finally(() => alive && setLoading(false))
    if (profile?.id) {
      fetchMyAppointments(profile.id)
        .then(appts => {
          if (!alive) return
          const today = todayStr()
          setTodayIds(new Set(appts.filter(a => toDateStr(a.scheduled_start) === today).map(a => a.job_id)))
        })
        .catch(() => {})
    }
    return () => { alive = false }
  }, [profile?.id])

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const matches = needle
      ? jobs.filter(j => [j.job_ref, j.title, j.site_address, j.site_city, j.customers?.customer_name]
          .some(v => v && String(v).toLowerCase().includes(needle)))
      : jobs
    // Stable sort: today's jobs float to the top, the rest keep newest-first.
    return [...matches].sort((a, b) => Number(todayIds.has(b.id)) - Number(todayIds.has(a.id))).slice(0, 40)
  }, [jobs, todayIds, query])

  function typeSite(text) {
    setSiteText(text)
    const typed = text.trim()
    if (!typed) return onChange(null)
    const match = jobs.find(j => j.job_ref && j.job_ref.toLowerCase() === typed.toLowerCase())
    onChange(match || { id: null, site_text: typed })
  }

  function startAdding() {
    setAdding(true)
    setSiteText('')
    onChange(null)
  }

  function stopAdding() {
    setAdding(false)
    setSiteText('')
    onChange(null)
  }

  if (adding) {
    const linked = value?.id ? value : null
    return (
      <div className="space-y-1.5">
        <p className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
          <MapPin size={13} className="text-gray-400" /> {addLabel}
          <span className="text-red-500">*</span>
        </p>
        <input
          autoFocus
          value={siteText}
          maxLength={120}
          onChange={e => typeSite(e.target.value)}
          placeholder="Job number or job site, e.g. JB-2026-30905 or 12 Main Rd"
          className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        {linked && (
          <p className="text-xs text-emerald-700">
            That is job {linked.job_ref}
            {[linked.site_address, linked.site_city].filter(Boolean).length > 0 && ` (${[linked.site_address, linked.site_city].filter(Boolean).join(', ')})`}
            {' '}— it will be linked to it.
          </p>
        )}
        <button type="button" onClick={stopAdding} className="text-xs font-semibold text-blue-600">
          ← Pick from the list instead
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
        <MapPin size={13} className="text-gray-400" /> {label}
        <span className="text-red-500">*</span>
      </p>

      <div className="relative">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search job no., address or customer"
          className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="max-h-44 overflow-y-auto space-y-1.5">
        {loading ? (
          <p className="text-sm text-gray-400">Loading jobs…</p>
        ) : shown.length === 0 ? (
          <p className="text-sm text-gray-400">No open jobs match.</p>
        ) : shown.map(j => {
          const selected = value?.id === j.id
          const place = [j.site_address, j.site_city].filter(Boolean).join(', ')
          return (
            <button
              key={j.id}
              type="button"
              onClick={() => onChange(selected ? null : j)}
              className={`w-full text-left rounded-lg border px-3 py-2 transition-colors ${selected ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'}`}
            >
              <span className="flex items-center gap-1.5 text-sm font-medium text-gray-900">
                <span className="truncate">{j.job_ref || 'Job'}{j.customers?.customer_name ? ` · ${j.customers.customer_name}` : ''}</span>
                {todayIds.has(j.id) && (
                  <span className="shrink-0 text-[10px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-full px-1.5 py-0.5">Today</span>
                )}
              </span>
              <span className="block text-xs text-gray-500 truncate">{place || j.title || 'No address on the job'}</span>
            </button>
          )
        })}
      </div>

      <button type="button" onClick={startAdding} className="flex items-center gap-1.5 text-sm font-semibold text-blue-600 pt-0.5">
        <Plus size={15} /> Add job site
      </button>
    </div>
  )
}
