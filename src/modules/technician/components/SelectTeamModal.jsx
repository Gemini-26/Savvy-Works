import { useEffect, useState } from 'react'
import { fetchTeamMembers, createCasualTeamMember } from '../../users/services/teamMembersService'

// Shown right before a technician clocks in on site — lets them say
// who (if anyone) came with them, without forcing a selection. Also reused
// after clock-in (`existing` set) so the team can be corrected on the job.
export default function SelectTeamModal({ onConfirm, onClose, busy, existing = null }) {
  const editing = existing !== null
  const [members, setMembers] = useState([])
  const [selected, setSelected] = useState(() => (existing || []).map(m => m.id))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [addingCasual, setAddingCasual] = useState(false)
  const [casualName, setCasualName] = useState('')
  const [savingCasual, setSavingCasual] = useState(false)

  useEffect(() => {
    fetchTeamMembers(true)
      // Casual labourers are inactive, so they'd be missing from the pool —
      // keep anyone already on this clock-in visible and selectable.
      .then(list => setMembers([...list, ...(existing || []).filter(e => !list.some(m => m.id === e.id))]))
      .catch(err => setError(err.message || 'Failed to load team members'))
      .finally(() => setLoading(false))
  }, [])

  function toggle(id) {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  async function handleAddCasual(e) {
    e.preventDefault()
    if (!casualName.trim()) return
    setSavingCasual(true)
    setError(null)
    try {
      const member = await createCasualTeamMember(casualName.trim())
      setMembers(prev => [...prev, member])
      setSelected(prev => [...prev, member.id])
      setCasualName('')
      setAddingCasual(false)
    } catch (err) {
      setError(err.message || 'Failed to add casual labourer')
    } finally {
      setSavingCasual(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">{editing ? 'Team on this job' : "Who's with you?"}</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <p className="text-sm text-gray-500">
            {editing
              ? "Add anyone who joined you on this job. They share the on-site time already clocked."
              : "Select any team members clocking in with you on this job. You can leave this blank if you're on your own."}
          </p>

          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded">{error}</div>}

          {loading ? (
            <p className="text-sm text-gray-400">Loading team members…</p>
          ) : members.length === 0 ? (
            <p className="text-sm text-gray-400">No team members registered yet. Ask your admin to add them under Active Team Members.</p>
          ) : (
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {members.map(m => {
                const isSelected = selected.includes(m.id)
                return (
                  <button
                    type="button"
                    key={m.id}
                    onClick={() => toggle(m.id)}
                    className={`w-full flex items-center gap-3 text-left px-3 py-2.5 rounded-lg border transition-colors ${isSelected ? 'border-blue-400 bg-blue-50' : 'border-gray-200'}`}
                  >
                    <span className={`w-5 h-5 rounded flex items-center justify-center border flex-shrink-0 ${isSelected ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-300'}`}>
                      {isSelected && '✓'}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-gray-900 truncate">
                        {m.full_name}
                        {m.is_casual && <span className="ml-1.5 text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0.5 align-middle">Casual</span>}
                      </span>
                      {m.role_title && <span className="block text-xs text-gray-500 truncate">{m.role_title}</span>}
                    </span>
                  </button>
                )
              })}
            </div>
          )}

          {addingCasual ? (
            <form onSubmit={handleAddCasual} className="flex gap-2 pt-1">
              <input
                autoFocus
                value={casualName}
                onChange={e => setCasualName(e.target.value)}
                placeholder="Casual labourer's name"
                className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                type="submit"
                disabled={savingCasual || !casualName.trim()}
                className="bg-blue-600 text-white px-3 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
              >
                {savingCasual ? 'Adding…' : 'Add'}
              </button>
              <button
                type="button"
                onClick={() => { setAddingCasual(false); setCasualName('') }}
                className="px-3 py-2 rounded-lg text-sm font-medium border border-gray-300 text-gray-600"
              >
                Cancel
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setAddingCasual(true)}
              className="flex items-center gap-1.5 text-sm font-semibold text-blue-600 pt-1"
            >
              <span className="text-lg leading-none">+</span> Add daily casual
            </button>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => onConfirm(selected)}
              className="flex-1 bg-blue-600 text-white py-2 rounded text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {editing
                ? (busy ? 'Saving…' : 'Save Team')
                : busy ? 'Clocking in…' : selected.length > 0 ? `Clock In with ${selected.length} team member${selected.length === 1 ? '' : 's'}` : 'Clock In Alone'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded text-sm font-medium border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
