import { useEffect, useState } from 'react'
import PageContainer from '../../../shared/components/PageContainer.jsx'
import PageHeader from '../../../shared/components/PageHeader'
import EmptyState from '../../../shared/components/EmptyState'
import { fetchArchive } from '../../../shared/services/archiveService'
import { formatDateTime } from '../../../shared/utils/formatDate'

const ENTITY_LABELS = {
  job: 'Job',
}

export default function ArchivesPage() {
  const [records, setRecords] = useState([])
  const [loading,  setLoading] = useState(true)
  const [error,    setError]   = useState(null)
  const [expanded, setExpanded] = useState(null)

  useEffect(() => {
    fetchArchive()
      .then(setRecords)
      .catch(err => setError(err.message || 'Failed to load archive'))
      .finally(() => setLoading(false))
  }, [])

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
                <span className="text-xs text-blue-600 font-medium shrink-0 ml-3">
                  {expanded === r.id ? 'Hide' : 'View'} details
                </span>
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
