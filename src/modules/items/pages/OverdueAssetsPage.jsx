import { useEffect, useState } from 'react'
import PageContainer from '../../../shared/components/PageContainer.jsx'
import PageHeader from '../../../shared/components/PageHeader'
import EmptyState from '../../../shared/components/EmptyState'
import { fetchOverdueAssets, sendOverdueReminder } from '../services/assetService'
import { formatCurrency } from '../../../shared/utils/formatCurrency'

export default function OverdueAssetsPage() {
  const [assets, setAssets] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [sentId, setSentId] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      setAssets(await fetchOverdueAssets())
    } catch (err) {
      setError(err.message || 'Failed to load overdue assets')
    } finally {
      setLoading(false)
    }
  }

  async function handleRemind(assetId) {
    setBusyId(assetId)
    try {
      await sendOverdueReminder(assetId)
      setSentId(assetId)
      setTimeout(() => setSentId(null), 2500)
    } catch (err) {
      setError(err.message || 'Failed to send reminder')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <PageContainer>
      <PageHeader title="Assets — Action Required" subtitle="Checked-out tools past their due-back date" />

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>
      )}

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : assets.length === 0 ? (
        <EmptyState title="Nothing overdue" description="Every checked-out tool is within its due-back date." />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3">Asset</th>
                <th className="text-left px-4 py-3">Holder</th>
                <th className="text-right px-4 py-3">Value</th>
                <th className="text-left px-4 py-3">Due back</th>
                <th className="text-right px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {assets.map(asset => (
                <tr key={asset.id}>
                  <td className="px-4 py-3 font-medium text-gray-900">{asset.name}</td>
                  <td className="px-4 py-3 text-gray-600">{asset.holder?.full_name || '—'}</td>
                  <td className="px-4 py-3 text-right text-gray-900 tabular-nums">{formatCurrency(asset.value)}</td>
                  <td className="px-4 py-3 text-red-600 font-medium">{asset.due_back}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      disabled={busyId === asset.id}
                      onClick={() => handleRemind(asset.id)}
                      className="text-xs font-medium text-blue-600 disabled:opacity-50"
                    >
                      {sentId === asset.id ? 'Reminder sent ✓' : busyId === asset.id ? 'Sending…' : 'Send reminder'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PageContainer>
  )
}
