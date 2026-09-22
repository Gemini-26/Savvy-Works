import { useState } from 'react'
import { formatDate } from '../utils/formatDate'
import { summarizeShiftsByPeriod, summarizeHoursSplitByPeriod, formatHoursDuration, formatSignedHoursDuration, formatMonthLabel } from '../utils/shiftSummary'

const TABS = [
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
]

// Hours clocked in for the day, and — when on-site sessions are supplied —
// how many of those hours were actually spent on a job site, plus the
// difference payroll needs to allocate (travel, workshop, admin time).
export default function ClockHoursSummary({ shifts, onSiteSessions }) {
  const [tab, setTab] = useState('daily')
  const split = Array.isArray(onSiteSessions)
  const summary = split ? summarizeHoursSplitByPeriod(shifts, onSiteSessions) : summarizeShiftsByPeriod(shifts)
  const rows = summary[tab]

  function label(row) {
    if (tab === 'daily') return formatDate(row.key)
    if (tab === 'weekly') return `Week of ${formatDate(row.key)}`
    return formatMonthLabel(row.key)
  }

  const totals = split
    ? rows.reduce((acc, r) => ({
        clockedMs: acc.clockedMs + r.clockedMs,
        onSiteMs: acc.onSiteMs + r.onSiteMs,
        diffMs: acc.diffMs + r.diffMs,
      }), { clockedMs: 0, onSiteMs: 0, diffMs: 0 })
    : null

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
      ) : split ? (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-100">
                <th className="text-left py-1.5 pr-2">Period</th>
                <th className="text-right py-1.5 px-2">Clocked In</th>
                <th className="text-right py-1.5 px-2">On Site</th>
                <th className="text-right py-1.5 pl-2">Difference</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map(row => (
                <tr key={row.key}>
                  <td className="py-1.5 pr-2 font-semibold text-gray-500 whitespace-nowrap">{label(row)}</td>
                  <td className="py-1.5 px-2 text-right font-semibold text-gray-700">{formatHoursDuration(row.clockedMs)}</td>
                  <td className="py-1.5 px-2 text-right font-semibold text-emerald-700">{formatHoursDuration(row.onSiteMs)}</td>
                  <td className={`py-1.5 pl-2 text-right font-semibold ${row.diffMs < 0 ? 'text-red-600' : 'text-amber-600'}`}>
                    {formatSignedHoursDuration(row.diffMs)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-200">
                <td className="py-1.5 pr-2 font-bold text-gray-700">Total</td>
                <td className="py-1.5 px-2 text-right font-bold text-gray-900">{formatHoursDuration(totals.clockedMs)}</td>
                <td className="py-1.5 px-2 text-right font-bold text-emerald-700">{formatHoursDuration(totals.onSiteMs)}</td>
                <td className={`py-1.5 pl-2 text-right font-bold ${totals.diffMs < 0 ? 'text-red-600' : 'text-amber-600'}`}>
                  {formatSignedHoursDuration(totals.diffMs)}
                </td>
              </tr>
            </tfoot>
          </table>
          <p className="text-[11px] text-gray-400 mt-2">
            Difference = hours clocked in for the day minus hours clocked in on a job site (travel, workshop and admin time).
            A negative figure means on-site time was logged outside an open day shift.
          </p>
        </div>
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
