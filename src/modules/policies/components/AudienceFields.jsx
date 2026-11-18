import { useMemo, useState } from 'react'
import { Search, UserX } from 'lucide-react'
import { AUDIENCE_LABELS } from '../policyStats'

const inputCls = 'w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:bg-gray-50 disabled:text-gray-500'

const ROLE_GROUPS = [
  ['technician', 'Technicians'],
  ['admin', 'Admins'],
  ['viewer', 'Viewers'],
]

const toggle = (list, id) => (list.includes(id) ? list.filter(x => x !== id) : [...list, id])

// "Who has to sign it": Everyone / Admins only / Technicians only / Specific people.
export function AudienceSelect({ value, onChange, disabled, id, className = '' }) {
  return (
    <select
      id={id}
      value={value.audience}
      disabled={disabled}
      onChange={e => onChange({ ...value, audience: e.target.value })}
      className={`${inputCls} ${className}`}
    >
      {Object.entries(AUDIENCE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
    </select>
  )
}

// Shown when "Specific people" is chosen: tick the technicians (and anyone else
// with a login) and the team members who have to sign.
export function PeoplePicker({ value, onChange, choices, error, disabled }) {
  const [search, setSearch] = useState('')
  const needle = search.trim().toLowerCase()

  const groups = useMemo(() => {
    if (!choices) return []
    const match = name => !needle || (name || '').toLowerCase().includes(needle)
    const known = new Set(ROLE_GROUPS.map(([role]) => role))
    const staff = ROLE_GROUPS.map(([role, label]) => ({
      key: role, label, kind: 'profile', people: choices.people.filter(p => p.role === role && match(p.full_name)),
    }))
    const other = choices.people.filter(p => !known.has(p.role) && match(p.full_name))
    if (other.length) staff.push({ key: 'other', label: 'Other staff', kind: 'profile', people: other })
    staff.push({
      key: 'team', label: 'Team members', kind: 'team',
      note: 'No login — they sign in person on a phone, or through a link you send from the document page.',
      people: choices.teamMembers.filter(m => match(m.full_name)),
    })
    return staff
  }, [choices, needle])

  const chosen = value.profileIds.length + value.teamMemberIds.length
  const isOn = (kind, id) => (kind === 'team' ? value.teamMemberIds : value.profileIds).includes(id)
  const flip = (kind, id) => onChange(kind === 'team'
    ? { ...value, teamMemberIds: toggle(value.teamMemberIds, id) }
    : { ...value, profileIds: toggle(value.profileIds, id) })

  // Tick or untick every person currently showing in a group.
  function setGroup(group, on) {
    const ids = group.people.map(p => p.id)
    const field = group.kind === 'team' ? 'teamMemberIds' : 'profileIds'
    const without = value[field].filter(id => !ids.includes(id))
    onChange({ ...value, [field]: on ? [...without, ...ids] : without })
  }

  return (
    <div className="border border-gray-200 rounded-lg bg-gray-50/60">
      <div className="px-3 py-2 flex flex-wrap items-center justify-between gap-2 border-b border-gray-200">
        <p className={`text-xs font-semibold ${chosen ? 'text-gray-700' : 'text-red-600'}`}>
          {chosen ? `${chosen} ${chosen === 1 ? 'person' : 'people'} chosen` : 'Tick at least one person who has to sign it'}
        </p>
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search} onChange={e => setSearch(e.target.value)} placeholder="Search names…" aria-label="Search people"
            className="pl-7 pr-2 py-1.5 text-xs rounded-lg border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-44"
          />
        </div>
      </div>

      <div className="max-h-64 overflow-y-auto p-3 space-y-3">
        {error && <p className="text-xs text-red-600">{error}</p>}
        {!choices && !error && <p className="text-xs text-gray-400">Loading people…</p>}

        {groups.map(group => {
          const everyoneOn = group.people.length > 0 && group.people.every(p => isOn(group.kind, p.id))
          return (
            <div key={group.key}>
              <div className="flex items-center justify-between gap-2 mb-1">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{group.label} ({group.people.length})</p>
                {group.people.length > 1 && (
                  <button type="button" disabled={disabled} onClick={() => setGroup(group, !everyoneOn)}
                    className="text-[11px] font-semibold text-blue-600 disabled:opacity-50">
                    {everyoneOn ? 'Untick all' : 'Tick all'}
                  </button>
                )}
              </div>
              {group.note && <p className="text-[11px] text-gray-500 mb-1">{group.note}</p>}
              {group.people.length === 0 ? (
                <p className="text-xs text-gray-400 flex items-center gap-1"><UserX size={12} /> {needle ? 'No match.' : group.kind === 'team' ? 'No active team members.' : 'No one.'}</p>
              ) : (
                <ul className="grid sm:grid-cols-2 gap-x-3 gap-y-0.5">
                  {group.people.map(p => (
                    <li key={p.id}>
                      <label className="flex items-center gap-2 py-1 text-sm text-gray-800 cursor-pointer min-w-0">
                        <input type="checkbox" disabled={disabled} checked={isOn(group.kind, p.id)} onChange={() => flip(group.kind, p.id)} className="h-4 w-4 shrink-0" />
                        <span className="truncate">{p.full_name}</span>
                        {p.role_title && <span className="text-[11px] text-gray-400 truncate">{p.role_title}</span>}
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
