import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import PageContainer from '../../../shared/components/PageContainer.jsx'
import PageHeader from '../../../shared/components/PageHeader'
import EmptyState from '../../../shared/components/EmptyState'
import PaginationBar from '../../../shared/components/PaginationBar'
import { fetchPurchaseOrders } from '../services/purchaseOrderService'
import { formatCurrency } from '../../../shared/utils/formatCurrency'
import { formatDate } from '../../../shared/utils/formatDate'

const STATUS_COLORS = {
  draft:             'bg-gray-100 text-gray-600',
  awaiting_approval: 'bg-yellow-100 text-yellow-700',
  approved:          'bg-green-100 text-green-700',
  rejected:          'bg-red-100 text-red-600',
  actioned:          'bg-blue-100 text-blue-700',
  paid:              'bg-teal-100 text-teal-700',
}

function StatusBadge({ status }) {
  const cls   = STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-600'
  const label = status?.replace(/_/g, ' ') ?? '—'
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${cls}`}>
      {label}
    </span>
  )
}

const TITLES = {
  draft:             'Draft Purchase Orders',
  awaiting_approval: 'Awaiting Approval',
  approved:          'Approved Purchase Orders',
  rejected:          'Rejected Purchase Orders',
  actioned:          'Actioned Purchase Orders',
  paid:              'Paid Purchase Orders',
}

export default function PurchaseOrdersPage({ statusFilter }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [pos,         setPos]         = useState([])
  const [total,       setTotal]       = useState(0)
  const [page,        setPage]        = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState(null)

  useEffect(() => {
    setPos([])
    setTotal(0)
    setPage(0)
    load(0, true)
  }, [location.key, statusFilter])

  async function load(pageNum, replace = false) {
    if (replace) setLoading(true)
    else setLoadingMore(true)
    setError(null)
    try {
      const result = await fetchPurchaseOrders(statusFilter, pageNum)
      setTotal(result.count ?? 0)
      setPos(prev => replace ? result.data : [...prev, ...result.data])
      setPage(pageNum)
    } catch (err) {
      setError(err.message || 'Failed to load purchase orders')
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  const title    = TITLES[statusFilter] ?? 'All Purchase Orders'
  const subtitle = statusFilter ? `Purchase orders with status "${statusFilter.replace(/_/g, ' ')}"` : 'All purchase orders'

  return (
    <PageContainer>
      <div className="flex items-center justify-between mb-6">
        <PageHeader title={title} subtitle={subtitle} />
        <button
          onClick={() => navigate('/finance/po/new')}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors"
        >
          + New Purchase Order
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mb-4">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-400">Loading purchase orders…</p>
      ) : pos.length === 0 ? (
        <EmptyState
          title="No purchase orders found"
          description="Create your first purchase order to send to a supplier."
        />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-100">
                <th className="text-left px-5 py-3">PO Ref.</th>
                <th className="text-left px-5 py-3">Title</th>
                <th className="text-left px-5 py-3">Supplier</th>
                <th className="text-left px-5 py-3">Issued</th>
                <th className="text-left px-5 py-3">Due</th>
                <th className="text-right px-5 py-3">Total</th>
                <th className="text-left px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {pos.map((po) => (
                <tr
                  key={po.id}
                  onClick={() => navigate(`/finance/po/${po.id}`)}
                  className="hover:bg-blue-50 transition-colors cursor-pointer"
                >
                  <td className="px-5 py-3 font-mono text-xs text-gray-500">{po.po_ref ?? '—'}</td>
                  <td className="px-5 py-3 font-medium text-gray-900">{po.title ?? '—'}</td>
                  <td className="px-5 py-3 text-gray-600">{po.supplier_name ?? '—'}</td>
                  <td className="px-5 py-3 text-gray-600">{formatDate(po.issue_date)}</td>
                  <td className="px-5 py-3 text-gray-600">{po.due_date ? formatDate(po.due_date) : '—'}</td>
                  <td className="px-5 py-3 text-right font-medium text-gray-900">{formatCurrency(po.total)}</td>
                  <td className="px-5 py-3"><StatusBadge status={po.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>

          <PaginationBar
            count={total}
            shown={pos.length}
            onLoadMore={() => load(page + 1)}
            loading={loadingMore}
          />
        </div>
      )}
    </PageContainer>
  )
}
