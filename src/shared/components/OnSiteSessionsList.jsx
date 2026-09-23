import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { formatDate, formatTime, toDateStr } from '../utils/formatDate'
import { formatHoursDuration } from '../utils/shiftSummary'

// The day-by-day on-site log, shared by team members (who have no login, so
// this is their whole record) and technicians (who have this alongside their
// day shift). The two differ only in who the "with" line names and where a
// job opens — admin screens open a job, the technician portal opens the
// appointment — so both are passed in.
//
// Sessions are paged rather than rendered all at once: a busy technician
// racks these up every working day, and a single unbounded list would turn
// into an endless scroll within a few months.
export default function OnSiteSessionsList({ sessions, renderWith, onOpenJob, emptyLabel, pageSize = 25 }) {
  const [page, setPage] = useState(0)

  const pageCount = Math.max(1, Math.ceil(sessions.length / pageSize))
  // Clamped rather than reset, so a shrinking list (a filter change, a
  // reload with fewer rows) can't strand the view on a page past the end.
  const current = Math.min(page, pageCount - 1)
  const from = current * pageSize
  const visible = sessions.slice(from, from + pageSize)

  const byDay = visible.reduce((acc, s) => {
    const key = toDateStr(s.actual_start)
    acc[key] = acc[key] || []
    acc[key].push(s)
    return acc
  }, {})
  const days = Object.keys(byDay).sort((a, b) => b.localeCompare(a))

  if (sessions.length === 0) {
    return <p className="text-sm text-gray-400">{emptyLabel}</p>
  }

  return (
    <div className="space-y-4">
      {days.map(day => {
        const entries = byDay[day]
        const totalMs = entries.reduce((sum, s) => s.actual_end ? sum + (new Date(s.actual_end) - new Date(s.actual_start)) : sum, 0)
        return (
          <div key={day} className="border-t border-gray-100 pt-3 first:border-t-0 first:pt-0">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-semibold text-gray-500">{formatDate(day)}</p>
              <p className="text-xs font-semibold text-gray-700">{formatHoursDuration(totalMs)}</p>
            </div>
            {entries.map(s => {
              const withLine = renderWith?.(s)
              return (
                <div key={s.id} className="flex items-start justify-between gap-3 py-1">
                  <div className="min-w-0">
                    <button
                      type="button"
                      onClick={() => onOpenJob?.(s)}
                      className="text-sm text-blue-600 hover:text-blue-700 font-medium truncate text-left"
                    >
                      {s.job_title || s.job_ref || 'Job'}
                    </button>
                    {withLine && <p className="text-xs text-gray-400 truncate">{withLine}</p>}
                  </div>
                  <p className="text-xs text-gray-500 shrink-0 text-right">
                    {formatTime(s.actual_start)} – {s.actual_end ? formatTime(s.actual_end) : 'On site now'}
                    {s.actual_end && (
                      <span className="block text-gray-400">
                        {formatHoursDuration(new Date(s.actual_end) - new Date(s.actual_start))}
                      </span>
                    )}
                  </p>
                </div>
              )
            })}
          </div>
        )
      })}

      {pageCount > 1 && (
        <div className="flex items-center justify-between border-t border-gray-200 pt-3">
          <p className="text-xs text-gray-500 tabular-nums">
            {from + 1}–{from + visible.length} of {sessions.length}
          </p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={current === 0}
              onClick={() => setPage(current - 1)}
              aria-label="Previous page"
              className="p-1.5 rounded-lg border border-gray-200 text-gray-600 disabled:opacity-40 disabled:cursor-default hover:bg-gray-50"
            >
              <ChevronLeft size={14} />
            </button>
            <p className="text-xs text-gray-500 tabular-nums px-1">{current + 1} / {pageCount}</p>
            <button
              type="button"
              disabled={current >= pageCount - 1}
              onClick={() => setPage(current + 1)}
              aria-label="Next page"
              className="p-1.5 rounded-lg border border-gray-200 text-gray-600 disabled:opacity-40 disabled:cursor-default hover:bg-gray-50"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
