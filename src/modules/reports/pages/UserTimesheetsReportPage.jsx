import { useEffect, useState } from 'react'
import { Clock, Users } from 'lucide-react'
import PageContainer from '../../../shared/components/PageContainer.jsx'
import PageHeader from '../../../shared/components/PageHeader'
import EmptyState from '../../../shared/components/EmptyState'
import Avatar from '../../../shared/components/Avatar'
import { fetchActiveShiftsForCompany, fetchShiftHistoryForCompany, onWorkShiftChange, adjustShiftTimes } from '../../../shared/services/workShiftService'
import { fetchOpenTeamShifts, fetchTeamShiftHistoryForCompany, onTeamShiftChange, adjustTeamShiftTimes } from '../../../shared/services/teamShiftService'
import { formatDateTime, formatDate, toDateStr } from '../../../shared/utils/formatDate'
import ClockTimesModal from '../../../shared/components/ClockTimesModal'
import DateRangeFilter from '../../../shared/components/DateRangeFilter'
import TeamShiftAdjustedNote from '../../../shared/components/TeamShiftAdjustedNote'
import { makeRange, rangeBounds, isValidRange } from '../../../shared/utils/dateRange'
import { teamPlace } from '../../../shared/utils/teamShiftText'
import { useCurrentUser } from '../../../hooks/useCurrentUser'

// Team members have no login: a technician clocks them in and out, either
// with them or by dropping them at a job site. One-day casuals are team
// members too, flagged so they read differently here.
function TeamBadge({ casual = false }) {
  return casual ? (
    <span className="ml-1.5 text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0.5 align-middle">
      Casual
    </span>
  ) : (
    <span className="ml-1.5 text-[10px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-full px-1.5 py-0.5 align-middle">
      Team
    </span>
  )
}

// "Adjusted by X · originally 09:45 · reason" under an admin-corrected shift.
function AdjustedNote({ shift }) {
  if (!shift.times_adjusted_at) return null
  const original = shift.original_clock_in
    ? ` · originally in ${new Date(shift.original_clock_in).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}`
    : ''
  return (
    <p className="text-xs text-amber-600">
      Adjusted by {shift.times_adjusted_by_name || 'an admin'}{original}
      {shift.adjustment_reason && <span className="text-gray-400"> · {shift.adjustment_reason}</span>}
    </p>
  )
}

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
  const [editing, setEditing] = useState(null)
  const [teamActive, setTeamActive] = useState([])
  const [teamHistory, setTeamHistory] = useState([])
  const [editingTeam, setEditingTeam] = useState(null)
  const [range, setRange] = useState(() => makeRange('7d'))
  const [reloadKey, setReloadKey] = useState(0)
  const { isAdmin } = useCurrentUser()

  const { from, to } = range
  const valid = isValidRange({ from, to })

  // Who is clocked in now is always shown; the history is whatever started in
  // the chosen dates (so an old forgotten clock-out can be found and fixed).
  useEffect(() => {
    if (!valid) return
    let cancelled = false
    const { fromIso, toIso } = rangeBounds({ from, to })
    const dates = { from: fromIso, to: toIso }
    Promise.all([
      fetchActiveShiftsForCompany(),
      fetchShiftHistoryForCompany(100, dates),
      fetchOpenTeamShifts(),
      fetchTeamShiftHistoryForCompany(100, dates),
    ])
      .then(([a, h, ta, th]) => {
        if (cancelled) return
        setActive(a); setHistory(h); setTeamActive(ta); setTeamHistory(th); setError(null)
      })
      .catch(err => { if (!cancelled) setError(err.message || 'Failed to load timesheets') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [from, to, valid, reloadKey])

  // Any clock-in/out or admin edit elsewhere refetches the lot.
  useEffect(() => {
    const refresh = () => setReloadKey(k => k + 1)
    const offWork = onWorkShiftChange(refresh)
    const offTeam = onTeamShiftChange(refresh)
    return () => { offWork(); offTeam() }
  }, [])

  // People and team members share the day groups, newest first, so one glance
  // at a day shows everyone who worked it.
  const historyEntries = [
    ...history.map(s => ({ kind: 'user', s })),
    ...teamHistory.map(s => ({ kind: 'team', s })),
  ].sort((a, b) => new Date(b.s.clock_in) - new Date(a.s.clock_in))

  const historyByDay = historyEntries.reduce((acc, entry) => {
    const key = toDateStr(entry.s.clock_in)
    acc[key] = acc[key] || []
    acc[key].push(entry)
    return acc
  }, {})
  const historyDays = Object.keys(historyByDay).sort((a, b) => b.localeCompare(a))

  return (
    <PageContainer>
      <PageHeader title="User Timesheets Report" subtitle="Who's clocked in now, and past clock in/out history for the whole team, including team members" />

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
                      <Avatar name={s.profiles?.full_name} color={s.profiles?.color || '#3B82F6'} url={s.profiles?.avatar_url} size={32} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{s.profiles?.full_name || 'Unknown'}</p>
                        <p className="text-xs text-gray-500 capitalize">{s.profiles?.role}</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <p className="text-sm font-mono font-semibold text-emerald-700">{elapsedSince(s.clock_in)}</p>
                      <p className="text-xs text-gray-400">since {formatDateTime(s.clock_in)}</p>
                      <AdjustedNote shift={s} />
                      {isAdmin && (
                        <button type="button" onClick={() => setEditing(s)} className="text-xs font-semibold text-blue-600 hover:text-blue-700">
                          Edit times
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-2 text-sm font-bold text-gray-900 mb-3">
              <Users size={16} className="text-emerald-600" /> Team Members Clocked In ({teamActive.length})
            </div>
            {teamActive.length === 0 ? (
              <p className="text-sm text-gray-400">No team members are currently clocked in.</p>
            ) : (
              <div className="divide-y divide-gray-50">
                {teamActive.map(t => (
                  <div key={t.id} className="flex items-center justify-between py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {t.team_members?.full_name || 'Unknown'}<TeamBadge casual={!!t.team_members?.is_casual} />
                      </p>
                      <p className="text-xs text-gray-500 truncate">{teamPlace(t)}</p>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <p className="text-sm font-mono font-semibold text-emerald-700">{elapsedSince(t.clock_in)}</p>
                      <p className="text-xs text-gray-400">since {formatDateTime(t.clock_in)}</p>
                      {t.clocked_in_by_profile?.full_name && (
                        <p className="text-xs text-gray-400">In by {t.clocked_in_by_profile.full_name}</p>
                      )}
                      <TeamShiftAdjustedNote shift={t} />
                      {isAdmin && (
                        <button type="button" onClick={() => setEditingTeam(t)} className="text-xs font-semibold text-blue-600 hover:text-blue-700">
                          Edit times
                        </button>
                      )}
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
            <div className="mb-4">
              <DateRangeFilter value={range} onChange={setRange} />
            </div>
            {!valid && <p className="text-sm text-gray-400">Pick a from and to date.</p>}
            {historyDays.length === 0 ? (
              <EmptyState title="No completed shifts yet" description="Completed clock in/out shifts will show up here." />
            ) : (
              <div className="space-y-4">
                {historyDays.map(day => (
                  <div key={day} className="border-t border-gray-100 pt-3 first:border-t-0 first:pt-0">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">{formatDate(day)}</p>
                    <div className="divide-y divide-gray-50">
                      {historyByDay[day].map(({ kind, s }) => kind === 'team' ? (
                        <div key={s.id} className="flex items-center justify-between py-1.5">
                          <div className="min-w-0">
                            <p className="text-sm text-gray-700">{s.team_members?.full_name || 'Unknown'}<TeamBadge casual={!!s.team_members?.is_casual} /></p>
                            <p className="text-xs text-gray-400 truncate">{teamPlace(s)}</p>
                          </div>
                          <div className="text-right shrink-0 ml-3">
                            <p className="text-xs text-gray-500">{formatDateTime(s.clock_in)} – {formatDateTime(s.clock_out)}</p>
                            <p className="text-xs text-gray-400">{formatDuration(new Date(s.clock_out) - new Date(s.clock_in))}</p>
                            <p className="text-xs text-gray-400">
                              {s.clocked_in_by_profile?.full_name ? `In by ${s.clocked_in_by_profile.full_name}` : ''}
                              {s.clocked_out_by_profile?.full_name ? ` · Out by ${s.clocked_out_by_profile.full_name}` : ''}
                            </p>
                            <TeamShiftAdjustedNote shift={s} />
                            {isAdmin && (
                              <button type="button" onClick={() => setEditingTeam(s)} className="text-xs font-semibold text-blue-600 hover:text-blue-700">
                                Edit times
                              </button>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div key={s.id} className="flex items-center justify-between py-1.5">
                          <p className="text-sm text-gray-700">{s.profiles?.full_name || 'Unknown'}</p>
                          <div className="text-right">
                            <p className="text-xs text-gray-500">{formatDateTime(s.clock_in)} – {formatDateTime(s.clock_out)}</p>
                            <p className="text-xs text-gray-400">{formatDuration(new Date(s.clock_out) - new Date(s.clock_in))}</p>
                            {s.clocked_out_by && s.clocked_out_by !== s.technician_id && (
                              <p className="text-xs text-amber-600">Clocked out by {s.clocked_out_by_profile?.full_name || 'admin'}</p>
                            )}
                            <AdjustedNote shift={s} />
                            {isAdmin && (
                              <button type="button" onClick={() => setEditing(s)} className="text-xs font-semibold text-blue-600 hover:text-blue-700">
                                Edit times
                              </button>
                            )}
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

      {editing && (
        <ClockTimesModal
          title="Edit day shift"
          personName={editing.profiles?.full_name}
          startLabel="Clock in (started work)"
          endLabel="Clock out (finished work)"
          openLabel="Still clocked in"
          start={editing.clock_in}
          end={editing.clock_out}
          originalStart={editing.original_clock_in}
          originalEnd={editing.original_clock_out}
          onSubmit={async ({ start, end, reason }) => {
            await adjustShiftTimes(editing.id, { clock_in: start, clock_out: end }, reason)
          }}
          onClose={() => setEditing(null)}
        />
      )}

      {editingTeam && (
        <ClockTimesModal
          title="Edit team member clock-in"
          personName={editingTeam.team_members?.full_name}
          startLabel="Clocked in"
          endLabel="Clocked out"
          openLabel="Still clocked in"
          start={editingTeam.clock_in}
          end={editingTeam.clock_out}
          originalStart={editingTeam.original_clock_in}
          originalEnd={editingTeam.original_clock_out}
          note={`${teamPlace(editingTeam)}${editingTeam.clocked_in_by_profile?.full_name ? ` · clocked in by ${editingTeam.clocked_in_by_profile.full_name}` : ''}. Set a clock-out to close one that was never tapped.`}
          onSubmit={async ({ start, end, reason }) => {
            await adjustTeamShiftTimes(editingTeam.id, { clock_in: start, clock_out: end }, reason)
          }}
          onClose={() => setEditingTeam(null)}
        />
      )}
    </PageContainer>
  )
}
