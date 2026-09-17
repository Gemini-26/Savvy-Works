import { useEffect, useState } from 'react'
import PageContainer from '../../../shared/components/PageContainer.jsx'
import PageHeader from '../../../shared/components/PageHeader'
import EmptyState from '../../../shared/components/EmptyState'
import { fetchArchive, restoreRecord } from '../../../shared/services/archiveService'
import { formatDateTime } from '../../../shared/utils/formatDate'

const ENTITY_LABELS = {
  job: 'Job',
}

export default function ArchivesPage() {
  const [records, setRecords] = useState([])
  const [loading,  setLoading] = useState(true)
  const [error,    setError]   = useState(null)
  const [expanded, setExpanded] = useState(null)
  const [restoringId, setRestoringId] = useState(null)
  const [confirmingId, setConfirmingId] = useState(null)

  useEffect(() => {
    load()
  }, [])

  function load() {
    setLoading(true)
    fetchArchive()
      .then(setRecords)
      .catch(err => setError(err.message || 'Failed to load archive'))
      .finally(() => setLoading(false))
  }

  async function handleRestore(record, e) {
    e.stopPropagation()
    setRestoringId(record.id)
    setError(null)
    try {
      await restoreRecord(record)
      setRecords(prev => prev.filter(r => r.id !== record.id))
    } catch (err) {
      setError(err.message || 'Failed to restore record')
    } finally {
      setRestoringId(null)
      setConfirmingId(null)
    }
  }

  return (
    <PageContainer>
      <PageHeader title="Archives" subtitle="Records deleted from the app, with who deleted them and when" />

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-400">Loading archive…</p>
      ) : records.length === 0 ? (
        <EmptyState title="Nothing archived yet" description="Deleted records will show up here instead of being permanently lost." />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-50">
          {records.map(r => (
            <div key={r.id} className="px-4 py-3">
              <div
                className="flex items-center justify-between cursor-pointer"
                onClick={() => setExpanded(expanded === r.id ? null : r.id)}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                      {ENTITY_LABELS[r.entity_type] || r.entity_type}
                    </span>
                    <span className="text-sm font-medium text-gray-900 truncate">
                      {r.entity_label || r.entity_id}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Deleted {formatDateTime(r.archived_at)} by {r.profiles?.full_name || 'Unknown'}
                    {r.reason ? ` — ${r.reason}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0 ml-3">
                  {confirmingId === r.id ? (
                    <span className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                      <span className="text-xs text-gray-500">Restore this job?</span>
                      <button
                        onClick={e => handleRestore(r, e)}
                        disabled={restoringId === r.id}
                        className="text-xs font-semibold text-green-700 hover:text-green-800 disabled:opacity-50"
                      >
                        {restoringId === r.id ? 'Restoring…' : 'Yes, restore'}
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); setConfirmingId(null) }}
                        className="text-xs font-medium text-gray-500 hover:text-gray-700"
                      >
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={e => { e.stopPropagation(); setConfirmingId(r.id) }}
                      className="text-xs font-medium text-green-700 hover:text-green-800"
                    >
                      Restore
                    </button>
                  )}
                  <span className="text-xs text-blue-600 font-medium">
                    {expanded === r.id ? 'Hide' : 'View'} details
                  </span>
                </div>
              </div>

              {expanded === r.id && (
                <pre className="mt-3 bg-gray-50 border border-gray-100 rounded-lg p-3 text-xs text-gray-600 overflow-x-auto">
                  {JSON.stringify(r.data, null, 2)}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </PageContainer>
  )
}
