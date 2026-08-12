import { useState } from 'react'
import { formatDate } from '../utils/formatDate'
import { summarizeShiftsByPeriod, formatHoursDuration, formatMonthLabel } from '../utils/shiftSummary'

const TABS = [
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
]

export default function ClockHoursSummary({ shifts }) {
  const [tab, setTab] = useState('daily')
  const summary = summarizeShiftsByPeriod(shifts)
  const rows = summary[tab]

  function label(row) {
    if (tab === 'daily') return formatDate(row.key)
    if (tab === 'weekly') return `Week of ${formatDate(row.key)}`
    return formatMonthLabel(row.key)
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {TABS.map(t => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
              tab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-400">No completed shifts yet.</p>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {rows.map(row => (
            <div key={row.key} className="flex items-center justify-between border-t border-gray-100 pt-2 first:border-t-0 first:pt-0">
              <p className="text-xs font-semibold text-gray-500">{label(row)}</p>
              <p className="text-xs font-semibold text-gray-700">{formatHoursDuration(row.ms)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
