import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Clock, CalendarDays, CalendarRange } from 'lucide-react'
import { fetchMyAppointments } from '../services/technicianService'
import { formatDate, formatTime, toDateStr } from '../../../shared/utils/formatDate'

export default function MySchedulePage({ profile }) {
  const [appointments, setAppointments] = useState([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    fetchMyAppointments(profile.id)
      .then(data => setAppointments(data.filter(a => a.status !== 'cancelled' && a.status !== 'declined')))
      .finally(() => setLoading(false))
  }, [profile.id])

  if (loading) return <div className="p-4 text-sm text-gray-500">Loading…</div>

  const groups = appointments.reduce((acc, appt) => {
    const key = toDateStr(appt.scheduled_start)
    acc[key] = acc[key] || []
    acc[key].push(appt)
    return acc
  }, {})

  const days = Object.keys(groups).sort((a, b) => b.localeCompare(a))

  const todayStr = toDateStr(new Date())
  const now = new Date()
  const weekEnd = new Date(now); weekEnd.setDate(now.getDate() + 7)
  const todayCount = (groups[todayStr] || []).length
  const weekCount = appointments.filter(a => {
    const d = new Date(a.scheduled_start)
    return d >= now && d <= weekEnd
  }).length

  return (
    <div className="p-4 space-y-5">
      <h1 className="text-lg font-bold text-gray-900">My Schedule</h1>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 p-3">
          <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center mb-2">
            <CalendarDays size={16} className="text-blue-600" />
          </div>
          <div className="text-lg font-bold text-gray-900 tabular-nums">{todayCount}</div>
          <div className="text-xs text-gray-500">Today</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-3">
          <div className="w-8 h-8 bg-indigo-50 rounded-lg flex items-center justify-center mb-2">
            <CalendarRange size={16} className="text-indigo-600" />
          </div>
          <div className="text-lg font-bold text-gray-900 tabular-nums">{weekCount}</div>
          <div className="text-xs text-gray-500">This Week</div>
        </div>
      </div>

      {days.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-8">Nothing scheduled.</p>
      )}

      {days.map(day => (
        <div key={day}>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{formatDate(day)}</p>
          <div className="space-y-2">
            {groups[day].map(appt => (
              <button
                key={appt.id}
                onClick={() => navigate(`/jobs/${appt.id}`)}
                className="w-full text-left bg-white rounded-xl border border-gray-200 p-3 flex items-center justify-between"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{appt.jobs?.title || appt.jobs?.job_ref}</p>
                  <p className="text-xs text-gray-500 truncate">{appt.jobs?.customers?.customer_name}</p>
                </div>
                <span className="shrink-0 flex items-center gap-1 text-xs text-gray-500">
                  <Clock size={12} /> {formatTime(appt.scheduled_start)}
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
