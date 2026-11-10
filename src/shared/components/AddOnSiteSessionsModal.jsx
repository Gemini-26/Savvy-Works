import { useEffect, useMemo, useState } from 'react'
import { Search, X } from 'lucide-react'
import { fetchRecentOnSiteAssignments, addTeamMemberToAssignments } from '../../modules/users/services/teamMembersService'
import { formatDate, formatTime } from '../utils/formatDate'
import { formatHoursDuration } from '../utils/shiftSummary'

const RANGES = [7, 14, 30, 90]

// A session still open has no hours counted yet, so it can't double-count any:
// it is treated as zero-length rather than running to now (an old one a
// technician never clocked out of would otherwise "overlap" everything since).
function windowOf(s) {
  const start = new Date(s.actual_start).getTime()
  return [start, s.actual_end ? new Date(s.actual_end).getTime() : start]
}

function overlaps(a, b) {
  const [aStart, aEnd] = windowOf(a)
  const [bStart, bEnd] = windowOf(b)
  return aStart < bEnd && bStart < aEnd
}

// Admin gives a team member on-site hours the technician never logged them
// onto. A team member's on-site hours are the technician's clock window on
// each job they are put on, so this lists technicians' recent on-site sessions
// and links the team member to the ones they were really on. `mySessions` is
// what they are already on (to flag a session that would count the same hours
// twice).
export default function AddOnSiteSessionsModal({ member, mySessions = [], onClose, onSaved }) {
  const [days, setDays] = useState(14)
  // What the last fetch returned, and for which range — still loading while
  // that isn't the range now selected.
  const [result, setResult] = useState({ days: null, rows: [], error: null })
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState(() => new Set())
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)

  useEffect(() => {
    let alive = true
    fetchRecentOnSiteAssignments(days)
      .then(list => alive && setResult({ days, rows: list, error: null }))
      .catch(err => alive && setResult({ days, rows: [], error: err.message || 'Could not load on-site sessions' }))
    return () => { alive = false }
  }, [days])

  const rows = result.rows
  const loading = result.days !== days
  const error = result.error || saveError

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return rows
    return rows.filter(r => [r.technician_name, r.job_ref, r.job_title, r.customer_name, r.site]
      .some(v => v && String(v).toLowerCase().includes(needle)))
  }, [rows, query])

  const pickedRows = rows.filter(r => picked.has(r.id))
  const clashes = new Set(
    rows
      .filter(r => !r.team_member_ids.includes(member.id))
      .filter(r => mySessions.some(s => overlaps(s, r)) || pickedRows.some(p => p.id !== r.id && overlaps(p, r)))
      .map(r => r.id),
  )
  const pickedClashes = pickedRows.filter(r => clashes.has(r.id)).length

  function toggle(id) {
    setPicked(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setSaveError(null)
    try {
      await addTeamMemberToAssignments(member, pickedRows)
      await onSaved?.()
      onClose()
    } catch (err) {
      setSaveError(err.message || 'Failed to add on-site hours')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <form onSubmit={handleSave} onClick={e => e.stopPropagation()}
        className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="font-semibold text-gray-900">Add on-site hours</h2>
            <p className="text-xs text-gray-500 mt-0.5">{member.full_name}</p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3 overflow-y-auto">
          <p className="text-xs text-gray-500 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
            Tick the technician sessions {member.full_name.split(' ')[0]} was on site for. They are credited the
            technician's on-site time for each one. If that time is wrong, fix it on the job
            (<span className="font-semibold">Edit clock times</span>), which updates their hours too.
            Only sessions where the technician clocked on site are listed.
          </p>

          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search technician, job no., address or customer"
                className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <select value={days} onChange={e => setDays(Number(e.target.value))} aria-label="How far back"
              className="px-2 py-2 text-sm rounded-lg border border-gray-300 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500">
              {RANGES.map(d => <option key={d} value={d}>Last {d} days</option>)}
            </select>
          </div>

          {loading ? (
            <p className="text-sm text-gray-400">Loading on-site sessions…</p>
          ) : shown.length === 0 ? (
            <p className="text-sm text-gray-400">
              {rows.length === 0
                ? `No technician has clocked on site in the last ${days} days.`
                : 'No sessions match your search.'}
            </p>
          ) : (
            <div className="space-y-1.5">
              {shown.map(r => {
                const linked = r.team_member_ids.includes(member.id)
                const on = linked || picked.has(r.id)
                return (
                  <label key={r.id}
                    className={`flex items-start gap-3 rounded-lg border px-3 py-2 ${
                      linked ? 'border-gray-200 bg-gray-50 opacity-70' : on ? 'border-blue-400 bg-blue-50 cursor-pointer' : 'border-gray-200 hover:bg-gray-50 cursor-pointer'
                    }`}>
                    <input type="checkbox" className="mt-1" checked={on} disabled={linked} onChange={() => toggle(r.id)} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-gray-900 truncate">
                        {r.job_ref || 'Job'}{r.customer_name ? ` · ${r.customer_name}` : ''}
                      </span>
                      <span className="block text-xs text-gray-500 truncate">{r.site || r.job_title || 'No address on the job'}</span>
                      <span className="block text-xs text-gray-500">
                        {r.technician_name} · {formatDate(r.actual_start)} · {formatTime(r.actual_start)} – {r.actual_end ? formatTime(r.actual_end) : 'on site now'}
                        {r.actual_end && ` · ${formatHoursDuration(new Date(r.actual_end) - new Date(r.actual_start))}`}
                      </span>
                      {linked && <span className="block text-[11px] font-semibold text-emerald-700">Already on this</span>}
                      {!linked && clashes.has(r.id) && (
                        <span className="block text-[11px] font-semibold text-amber-600">Overlaps another session of theirs</span>
                      )}
                    </span>
                  </label>
                )
              })}
            </div>
          )}

          {pickedClashes > 0 && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              {pickedClashes === 1 ? '1 session you ticked overlaps' : `${pickedClashes} sessions you ticked overlap`} another
              session of theirs, so the same hours would be counted twice. Untick it unless that is right.
            </p>
          )}

          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">{error}</div>}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100 shrink-0">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 rounded-lg">Cancel</button>
          <button type="submit" disabled={saving || pickedRows.length === 0}
            className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50">
            {saving ? 'Adding…' : pickedRows.length === 0 ? 'Add hours' : `Add ${pickedRows.length} session${pickedRows.length === 1 ? '' : 's'}`}
          </button>
        </div>
      </form>
    </div>
  )
}
