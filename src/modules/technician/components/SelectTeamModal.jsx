import { useEffect, useState } from 'react'
import { fetchTeamMembers } from '../../users/services/teamMembersService'

// Shown right before a technician clocks in on site — lets them say
// who (if anyone) came with them, without forcing a selection.
export default function SelectTeamModal({ onConfirm, onClose, busy }) {
  const [members, setMembers] = useState([])
  const [selected, setSelected] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchTeamMembers(true)
      .then(setMembers)
      .catch(err => setError(err.message || 'Failed to load team members'))
      .finally(() => setLoading(false))
  }, [])

  function toggle(id) {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">Who's with you?</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <p className="text-sm text-gray-500">
            Select any team members clocking in with you on this job. You can leave this blank if you're on your own.
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
                      <span className="block text-sm font-medium text-gray-900 truncate">{m.full_name}</span>
                      {m.role_title && <span className="block text-xs text-gray-500 truncate">{m.role_title}</span>}
                    </span>
                  </button>
                )
              })}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => onConfirm(selected)}
              className="flex-1 bg-blue-600 text-white py-2 rounded text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {busy ? 'Clocking in…' : selected.length > 0 ? `Clock In with ${selected.length} team member${selected.length === 1 ? '' : 's'}` : 'Clock In Alone'}
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
