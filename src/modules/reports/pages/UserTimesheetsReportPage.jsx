import { useEffect, useState } from 'react'
import { Clock } from 'lucide-react'
import PageContainer from '../../../shared/components/PageContainer.jsx'
import PageHeader from '../../../shared/components/PageHeader'
import EmptyState from '../../../shared/components/EmptyState'
import { fetchActiveShiftsForCompany, fetchShiftHistoryForCompany, onWorkShiftChange } from '../../../shared/services/workShiftService'
import { formatTime, formatDate, toDateStr } from '../../../shared/utils/formatDate'

function formatDuration(ms) {
  const totalMinutes = Math.round(ms / 60000)
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function elapsedSince(iso) {
  return formatDuration(Date.now() - new Date(iso).getTime())
}

export default function UserTimesheetsReportPage() {
  const [active, setActive] = useState([])
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  function reload() {
    return Promise.all([
      fetchActiveShiftsForCompany(),
      fetchShiftHistoryForCompany(),
    ]).then(([a, h]) => { setActive(a); setHistory(h) })
  }

  useEffect(() => {
    reload()
      .catch(err => setError(err.message || 'Failed to load timesheets'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    return onWorkShiftChange(() => { reload().catch(() => {}) })
  }, [])

  const historyByDay = history.reduce((acc, s) => {
    const key = toDateStr(s.clock_in)
    acc[key] = acc[key] || []
    acc[key].push(s)
    return acc
  }, {})
  const historyDays = Object.keys(historyByDay).sort((a, b) => b.localeCompare(a))

  return (
    <PageContainer>
      <PageHeader title="User Timesheets Report" subtitle="Who's clocked in now, and past clock in/out history for the whole team" />

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-2 text-sm font-bold text-gray-900 mb-3">
              <Clock size={16} className="text-emerald-600" /> Currently Clocked In ({active.length})
            </div>
            {active.length === 0 ? (
              <p className="text-sm text-gray-400">No one is currently clocked in.</p>
            ) : (
              <div className="divide-y divide-gray-50">
                {active.map(s => (
                  <div key={s.id} className="flex items-center justify-between py-2.5">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0"
                        style={{ backgroundColor: s.profiles?.color || '#3B82F6' }}
                      >
                        {s.profiles?.full_name?.[0]?.toUpperCase() || '?'}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{s.profiles?.full_name || 'Unknown'}</p>
                        <p className="text-xs text-gray-500 capitalize">{s.profiles?.role}</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <p className="text-sm font-mono font-semibold text-emerald-700">{elapsedSince(s.clock_in)}</p>
                      <p className="text-xs text-gray-400">since {formatTime(s.clock_in)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-2 text-sm font-bold text-gray-900 mb-3">
              <Clock size={16} /> Shift History
            </div>
            {historyDays.length === 0 ? (
              <EmptyState title="No completed shifts yet" description="Completed clock in/out shifts will show up here." />
            ) : (
              <div className="space-y-4">
                {historyDays.map(day => (
                  <div key={day} className="border-t border-gray-100 pt-3 first:border-t-0 first:pt-0">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">{formatDate(day)}</p>
                    <div className="divide-y divide-gray-50">
                      {historyByDay[day].map(s => (
                        <div key={s.id} className="flex items-center justify-between py-1.5">
                          <p className="text-sm text-gray-700">{s.profiles?.full_name || 'Unknown'}</p>
                          <div className="text-right">
                            <p className="text-xs text-gray-500">{formatTime(s.clock_in)} – {formatTime(s.clock_out)}</p>
                            <p className="text-xs text-gray-400">{formatDuration(new Date(s.clock_out) - new Date(s.clock_in))}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </PageContainer>
  )
}
