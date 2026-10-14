import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { fetchDocumentActivity } from '../services/documentsService'
import { formatDateTime } from '../../../shared/utils/formatDate'

const DOT_COLORS = {
  file_uploaded:    'bg-teal-500',
  file_renamed:     'bg-gray-400',
  file_moved:       'bg-indigo-500',
  file_deleted:     'bg-red-400',
  file_downloaded:  'bg-blue-500',
  folder_created:   'bg-teal-500',
  folder_renamed:   'bg-gray-400',
  folder_moved:     'bg-indigo-500',
  folder_deleted:   'bg-red-400',
}

// The audit trail for one set of documents — same look as a job's Activity
// timeline. Entries are written by the database and can't be edited or removed.
export default function DocumentActivityLog({ ownerKind, ownerId, refreshKey }) {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [reloadTick, setReloadTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    fetchDocumentActivity({ kind: ownerKind, id: ownerId })
      .then(data => { if (!cancelled) { setEntries(data); setError(null) } })
      .catch(err => { if (!cancelled) setError(err.message || 'Failed to load activity') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [ownerKind, ownerId, refreshKey, reloadTick])

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-bold text-gray-700">Activity Timeline</h2>
        <button type="button" onClick={() => setReloadTick(t => t + 1)} className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700">
          <RefreshCw size={12} /> Refresh
        </button>
      </div>
      {error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : loading ? (
        <p className="text-sm text-gray-400">Loading activity…</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-gray-400 italic">No activity recorded yet.</p>
      ) : (
        <div className="space-y-3">
          {entries.map(entry => (
            <div key={entry.id} className="flex items-start gap-3">
              <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${DOT_COLORS[entry.action] || 'bg-gray-400'}`} />
              <div className="min-w-0">
                <p className="text-sm text-gray-800 break-words">
                  <span className="font-semibold">{entry.actor_name || 'System'}</span>{' '}
                  {lowerFirst(entry.detail) || entry.action}
                </p>
                <p className="text-xs text-gray-400">{formatDateTime(entry.created_at)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// "Uploaded "x"…" reads naturally after the actor's name as "uploaded "x"…".
function lowerFirst(text) {
  return text ? text.charAt(0).toLowerCase() + text.slice(1) : text
}
