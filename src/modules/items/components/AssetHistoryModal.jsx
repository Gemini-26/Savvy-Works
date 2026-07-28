import { useEffect, useState } from 'react'
import { fetchAssetFullHistory } from '../services/assetService'

function formatTimestamp(iso) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

export default function AssetHistoryModal({ asset, onClose }) {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchAssetFullHistory(asset.id)
      .then(setEvents)
      .catch(err => setError(err.message || 'Failed to load history'))
      .finally(() => setLoading(false))
  }, [asset.id])

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-sm font-bold text-gray-900">{asset.name}</h2>
            <p className="text-xs text-gray-500">Full transaction history</p>
          </div>
          <button onClick={onClose} className="text-sm text-gray-400 hover:text-gray-600">✕</button>
        </div>

        <div className="overflow-y-auto p-5">
          {error && <p className="text-sm text-red-600">{error}</p>}
          {loading ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : events.length === 0 ? (
            <p className="text-sm text-gray-400">No history recorded for this asset yet.</p>
          ) : (
            <ul className="space-y-4">
              {events.map(e => (
                <li key={e.id} className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900">{e.label}</p>
                    {e.condition && <p className="text-xs text-gray-500 mt-0.5">Condition: {e.condition}</p>}
                    {e.detail && <p className="text-xs text-gray-500 mt-0.5">{e.detail}</p>}
                    {e.pin && <p className="text-xs font-mono text-blue-600 mt-0.5">PIN: {e.pin}</p>}
                    <p className="text-xs text-gray-400 mt-0.5">{formatTimestamp(e.at)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
