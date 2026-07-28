import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapPin, Clock, ChevronRight, Briefcase, CheckCircle, XCircle, Ban } from 'lucide-react'
import { fetchMyAppointments, respondToAppointment, PENDING_RESPONSE_STATUSES } from '../services/technicianService'
import { formatDate, formatTime } from '../../../shared/utils/formatDate'

const STATUS_STYLES = {
  not_dispatched: 'bg-gray-100 text-gray-600',
  awaiting:       'bg-gray-100 text-gray-600',
  received:       'bg-amber-100 text-amber-700',
  accepted:       'bg-blue-100 text-blue-700',
  declined:       'bg-red-100 text-red-700',
  on_route:       'bg-purple-100 text-purple-700',
  on_site:        'bg-indigo-100 text-indigo-700',
  completed:      'bg-green-100 text-green-700',
  follow_on:      'bg-amber-100 text-amber-700',
  abandoned:      'bg-red-100 text-red-700',
  no_access:      'bg-red-100 text-red-700',
  cancelled:      'bg-gray-100 text-gray-500',
}

const JOB_STATUS_LABELS = {
  on_hold:              'On Hold',
  pending_confirmation: 'Awaiting Confirmation',
  completed:            'Completed',
  invoiced:             'Completed',
}

const JOB_STATUS_STYLES = {
  on_hold:              'bg-orange-100 text-orange-700',
  pending_confirmation: 'bg-amber-100 text-amber-700',
  completed:            'bg-green-100 text-green-700',
  invoiced:             'bg-green-100 text-green-700',
}

function AppointmentCard({ appt, onRespond }) {
  const navigate = useNavigate()
  const job = appt.jobs
  const isPending = PENDING_RESPONSE_STATUSES.includes(appt.status)
  const [busy, setBusy] = useState(false)

  async function respond(e, status) {
    e.stopPropagation()
    setBusy(true)
    try {
      await onRespond(appt.id, status)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      onClick={() => navigate(`/jobs/${appt.id}`)}
      className="bg-white rounded-xl border border-gray-200 p-4 space-y-3 active:bg-gray-50"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold text-gray-900 truncate">{job?.title || job?.job_ref || 'Job'}</p>
          <p className="text-xs text-gray-500 truncate">{job?.customers?.customer_name}</p>
        </div>
        <div className="flex shrink-0 gap-1">
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full capitalize ${STATUS_STYLES[appt.status] || 'bg-gray-100 text-gray-600'}`}>
            {appt.status?.replace(/_/g, ' ')}
          </span>
          {JOB_STATUS_LABELS[job?.status] && (
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${JOB_STATUS_STYLES[job.status]}`}>
              {JOB_STATUS_LABELS[job.status]}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <Clock size={13} /> {formatDate(appt.scheduled_start)}, {formatTime(appt.scheduled_start)}
        </span>
        {job?.site_address && (
          <span className="flex items-center gap-1 truncate">
            <MapPin size={13} /> <span className="truncate">{job.site_address}</span>
          </span>
        )}
      </div>

      {isPending ? (
        <div className="flex gap-2 pt-1">
          <button
            disabled={busy}
            onClick={e => respond(e, 'accepted')}
            className="flex-1 bg-green-600 text-white text-xs font-semibold py-2 rounded-lg disabled:opacity-50"
          >
            Accept
          </button>
          <button
            disabled={busy}
            onClick={e => respond(e, 'declined')}
            className="flex-1 bg-white border border-red-300 text-red-600 text-xs font-semibold py-2 rounded-lg disabled:opacity-50"
          >
            Decline
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-end text-blue-600 text-xs font-medium">
          View details <ChevronRight size={14} />
        </div>
      )}
    </div>
  )
}

export default function MyJobsPage({ profile }) {
  const [appointments, setAppointments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState(null)

  async function load() {
    try {
      const data = await fetchMyAppointments(profile.id)
      setAppointments(data.filter(a => a.status !== 'cancelled'))
    } catch (err) {
      setError(err.message || 'Failed to load jobs')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [profile.id])

  async function handleRespond(appointmentId, status) {
    await respondToAppointment(appointmentId, status)
    await load()
  }

  if (loading) return <div className="p-4 text-sm text-gray-500">Loading…</div>
  if (error) return <div className="p-4 text-sm text-red-600">{error}</div>

  const isCompleted = a => ['completed', 'invoiced'].includes(a.jobs?.status)
  const isCancelled = a => a.status === 'cancelled' || a.jobs?.status === 'cancelled'
  const isDeclined  = a => a.status === 'declined'
  const isDone = a => isCompleted(a) || isDeclined(a) || isCancelled(a)
  const sorted = [...appointments].sort((a, b) => new Date(b.scheduled_start) - new Date(a.scheduled_start))
  const active = sorted.filter(a => !isDone(a))
  const past = sorted.filter(isDone)

  const stats = [
    { key: 'active',    label: 'Active Jobs',    value: active.length,                             icon: Briefcase,  color: 'text-blue-600',   bg: 'bg-blue-50' },
    { key: 'completed', label: 'Completed',      value: appointments.filter(isCompleted).length,   icon: CheckCircle, color: 'text-green-600',  bg: 'bg-green-50' },
    { key: 'cancelled', label: 'Cancelled',      value: appointments.filter(isCancelled).length,   icon: Ban,         color: 'text-gray-600',   bg: 'bg-gray-100' },
    { key: 'declined',  label: 'Declined',       value: appointments.filter(isDeclined).length,    icon: XCircle,     color: 'text-red-600',    bg: 'bg-red-50' },
  ]

  const filterFns = {
    active:    a => !isDone(a),
    completed: isCompleted,
    cancelled: isCancelled,
    declined:  isDeclined,
  }
  const filtered = filter ? sorted.filter(filterFns[filter]) : null

  return (
    <div className="p-4 space-y-5">
      <h1 className="text-lg font-bold text-gray-900">My Jobs</h1>

      <div className="grid grid-cols-2 gap-3">
        {stats.map(card => {
          const Icon = card.icon
          const isActive = filter === card.key
          return (
            <button
              key={card.key}
              onClick={() => setFilter(isActive ? null : card.key)}
              className={`text-left bg-white rounded-xl border p-3 transition-colors ${isActive ? 'border-blue-400 ring-1 ring-blue-400' : 'border-gray-200'}`}
            >
              <div className={`w-8 h-8 ${card.bg} rounded-lg flex items-center justify-center mb-2`}>
                <Icon size={16} className={card.color} />
              </div>
              <div className="text-lg font-bold text-gray-900 tabular-nums">{card.value}</div>
              <div className="text-xs text-gray-500">{card.label}</div>
            </button>
          )
        })}
      </div>

      {filtered ? (
        <div className="space-y-3">
          {filtered.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No jobs in this category.</p>
          ) : (
            filtered.map(appt => (
              <AppointmentCard key={appt.id} appt={appt} onRespond={handleRespond} />
            ))
          )}
        </div>
      ) : (
        <>
          {active.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-8">No jobs assigned right now.</p>
          )}

          <div className="space-y-3">
            {active.map(appt => (
              <AppointmentCard key={appt.id} appt={appt} onRespond={handleRespond} />
            ))}
          </div>

          {past.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">History</p>
              <div className="space-y-3">
                {past.map(appt => (
                  <AppointmentCard key={appt.id} appt={appt} onRespond={handleRespond} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
