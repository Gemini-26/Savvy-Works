import { useState } from 'react'
import { formatDate } from '../utils/formatDate'
import { summarizeOnSiteByPeriod, formatHoursDuration, formatMonthLabel } from '../utils/shiftSummary'

const TABS = [
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
]

// Hours on site only — used for team members (labourers/helpers), who have
// no login and therefore no day shift to compare against.
export default function OnSiteHoursSummary({ sessions }) {
  const [tab, setTab] = useState('daily')
  const rows = summarizeOnSiteByPeriod(sessions)[tab]
  const totalMs = rows.reduce((sum, r) => sum + r.ms, 0)

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
        <p className="text-sm text-gray-400">No completed on-site sessions yet.</p>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {rows.map(row => (
            <div key={row.key} className="flex items-center justify-between border-t border-gray-100 pt-2 first:border-t-0 first:pt-0">
              <p className="text-xs font-semibold text-gray-500">{label(row)}</p>
              <p className="text-xs font-semibold text-emerald-700">{formatHoursDuration(row.ms)}</p>
            </div>
          ))}
          <div className="flex items-center justify-between border-t border-gray-200 pt-2">
            <p className="text-xs font-bold text-gray-700">Total</p>
            <p className="text-xs font-bold text-emerald-700">{formatHoursDuration(totalMs)}</p>
          </div>
        </div>
      )}
    </div>
  )
}
