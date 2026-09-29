import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import PageContainer from '../../../shared/components/PageContainer.jsx'
import PageHeader from '../../../shared/components/PageHeader'
import EmptyState from '../../../shared/components/EmptyState'
import PaginationBar from '../../../shared/components/PaginationBar'
import FilterBar from '../../../shared/components/FilterBar'
import AssigneesCell from '../../../shared/components/AssigneesCell'
import useListFilters from '../../../shared/hooks/useListFilters'
import { toOptions } from '../../../shared/utils/listFilters'
import { fetchPurchaseOrders } from '../services/purchaseOrderService'
import { formatCurrency } from '../../../shared/utils/formatCurrency'
import { formatDate } from '../../../shared/utils/formatDate'
import { PAYMENT_METHODS } from '../../../shared/constants/paymentTypes'

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

const METHOD_COLORS = {
  Cash: 'bg-green-100 text-green-700',
  Card: 'bg-slate-100 text-slate-700',
  EFT: 'bg-cyan-100 text-cyan-700',
  'Account (30-Day)': 'bg-amber-100 text-amber-700',
  'Account (60-Day)': 'bg-amber-100 text-amber-700',
  'Insurance Claim': 'bg-purple-100 text-purple-700',
}

function PaymentMethodBadge({ method }) {
  if (!method) return <span className="text-xs text-gray-300">—</span>
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${METHOD_COLORS[method] ?? 'bg-gray-100 text-gray-600'}`}>
      {method}
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
  const { search, setSearch, filters, setFilters, debouncedSearch, debouncedFilters, filterKey } = useListFilters()

  useEffect(() => {
    setPos([])
    setTotal(0)
    setPage(0)
    load(0, true)
  }, [location.key, statusFilter, debouncedSearch, filterKey])

  async function load(pageNum, replace = false) {
    if (replace) setLoading(true)
    else setLoadingMore(true)
    setError(null)
    try {
      const result = await fetchPurchaseOrders(statusFilter, pageNum, debouncedSearch, debouncedFilters)
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

  const filterFields = useMemo(() => [
    { key: 'poRef',            label: 'PO Ref',        type: 'text', placeholder: 'PO ref' },
    { key: 'supplier',         label: 'Supplier',      type: 'text', placeholder: 'Supplier name' },
    { key: 'title',            label: 'Title',         type: 'text', placeholder: 'PO title' },
    { key: 'reference',        label: 'Reference',     type: 'text', placeholder: 'Supplier / order reference' },
    { key: 'customer',         label: 'Customer',      type: 'text', placeholder: 'Customer name' },
    { key: 'jobRef',           label: 'Job Ref',       type: 'text', placeholder: 'Job ref' },
    { key: 'quoteRef',         label: 'Quote Ref',     type: 'text', placeholder: 'Quote ref' },
    { key: 'invoiceRef',       label: 'Invoice #',     type: 'text', placeholder: 'Invoice number' },
    { key: 'keywords',         label: 'Keywords',      type: 'text', placeholder: 'Any words', hint: 'Searches the title, notes, terms, delivery notes and supplier notes' },
    ...(statusFilter ? [] : [{ key: 'status', label: 'Status', type: 'multi', options: toOptions(Object.keys(STATUS_COLORS)) }]),
    { key: 'paymentMethod',    label: 'Payment Method', type: 'multi', options: [...toOptions(PAYMENT_METHODS), { value: 'none', label: 'Not recorded' }] },
    { key: 'issued',           label: 'Issued On',     type: 'dateRange' },
    { key: 'due',              label: 'Due Date',      type: 'dateRange' },
    { key: 'expectedDelivery', label: 'Delivery',      type: 'dateRange', hint: 'Expected delivery date' },
    { key: 'total',            label: 'Total (R)',     type: 'numberRange' },
  ], [statusFilter])

  const filtering = !!debouncedSearch || filterKey !== '{}'

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

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        placeholder="Search PO ref, title, supplier, reference…"
        fields={filterFields}
        values={filters}
        onChange={setFilters}
      />

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
          description={filtering ? 'No purchase orders match your search or filters.' : 'Create your first purchase order to send to a supplier.'}
        />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-100">
                <th className="text-left px-5 py-3">PO Ref.</th>
                <th className="text-left px-5 py-3">Title</th>
                <th className="text-left px-5 py-3">Supplier</th>
                <th className="text-left px-5 py-3">Assigned To</th>
                <th className="text-left px-5 py-3">Issued</th>
                <th className="text-left px-5 py-3">Due</th>
                <th className="text-right px-5 py-3">Total</th>
                <th className="text-left px-5 py-3">Status</th>
                <th className="text-left px-5 py-3">Payment Method</th>
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
                  <AssigneesCell names={po.assignees} emptyLabel={po.job_id ? 'Unassigned' : null} />
                  <td className="px-5 py-3 text-gray-600">{formatDate(po.issue_date)}</td>
                  <td className="px-5 py-3 text-gray-600">{po.due_date ? formatDate(po.due_date) : '—'}</td>
                  <td className="px-5 py-3 text-right font-medium text-gray-900">{formatCurrency(po.total)}</td>
                  <td className="px-5 py-3"><StatusBadge status={po.status} /></td>
                  <td className="px-5 py-3"><PaymentMethodBadge method={po.payment_method} /></td>
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
