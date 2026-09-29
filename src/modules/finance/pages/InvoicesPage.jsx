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
import { SA_PROVINCES } from '../../../shared/constants/regions'
import { fetchInvoices } from '../services/invoiceService'
import { formatCurrency } from '../../../shared/utils/formatCurrency'
import { formatDate } from '../../../shared/utils/formatDate'
import { PAYMENT_METHODS } from '../../../shared/constants/paymentTypes'

const STATUS_COLORS = {
  draft:       'bg-gray-100 text-gray-600',
  sent:        'bg-blue-100 text-blue-700',
  outstanding: 'bg-blue-100 text-blue-700',
  overdue:     'bg-red-100 text-red-600',
  paid:        'bg-green-100 text-green-700',
  cancelled:   'bg-gray-100 text-gray-500',
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
  PayFast: 'bg-indigo-100 text-indigo-700',
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
  draft:       'Draft Invoices',
  outstanding: 'Outstanding Invoices',
  overdue:     'Overdue Invoices',
  paid:        'Paid Invoices',
}

export default function InvoicesPage({ statusFilter }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [invoices,    setInvoices]    = useState([])
  const [total,       setTotal]       = useState(0)
  const [page,        setPage]        = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState(null)
  const { search, setSearch, filters, setFilters, debouncedSearch, debouncedFilters, filterKey } = useListFilters()

  useEffect(() => {
    setInvoices([])
    setTotal(0)
    setPage(0)
    load(0, true)
  }, [location.key, statusFilter, debouncedSearch, filterKey])

  async function load(pageNum, replace = false) {
    if (replace) setLoading(true)
    else setLoadingMore(true)
    setError(null)
    try {
      const result = await fetchInvoices(statusFilter, pageNum, debouncedSearch, debouncedFilters)
      setTotal(result.count ?? 0)
      setInvoices(prev => replace ? result.data : [...prev, ...result.data])
      setPage(pageNum)
    } catch (err) {
      setError(err.message || 'Failed to load invoices')
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  const filterFields = useMemo(() => [
    { key: 'invoiceRef',  label: 'Invoice #',    type: 'text', placeholder: 'Invoice number' },
    { key: 'customer',    label: 'Customer',     type: 'text', placeholder: 'Customer name, email or phone' },
    { key: 'title',       label: 'Title',        type: 'text', placeholder: 'Invoice title' },
    { key: 'siteAddress', label: 'Site Address', type: 'text', placeholder: 'Site address, city, postcode' },
    { key: 'jobRef',      label: 'Job Ref',      type: 'text', placeholder: 'Job ref' },
    { key: 'paymentRef',  label: 'PayFast Ref',  type: 'text', placeholder: 'PayFast payment ID' },
    { key: 'keywords',    label: 'Keywords',     type: 'text', placeholder: 'Any words', hint: 'Searches the title, notes, terms and refund reason' },
    ...(statusFilter && statusFilter !== 'outstanding' ? [] : [
      { key: 'status', label: 'Status', type: 'multi', options: toOptions(Object.keys(STATUS_COLORS).filter(s => s !== 'outstanding')) },
    ]),
    { key: 'paymentMethod', label: 'Payment Method', type: 'multi', options: [
      { value: 'PayFast', label: 'PayFast' },
      ...toOptions(PAYMENT_METHODS),
      { value: 'none', label: 'Not recorded' },
    ] },
    { key: 'province',    label: 'Province',     type: 'multi', options: toOptions(SA_PROVINCES) },
    { key: 'issued',      label: 'Issued On',    type: 'dateRange' },
    { key: 'due',         label: 'Due Date',     type: 'dateRange' },
    { key: 'paid',        label: 'Paid On',      type: 'dateRange' },
    { key: 'total',       label: 'Total (R)',    type: 'numberRange' },
  ], [statusFilter])

  const filtering = !!debouncedSearch || filterKey !== '{}'

  const title    = TITLES[statusFilter] ?? 'All Invoices'
  const subtitle = statusFilter ? `Invoices with status "${statusFilter}"` : 'All customer invoices'

  return (
    <PageContainer>
      <div className="flex items-center justify-between mb-6">
        <PageHeader title={title} subtitle={subtitle} />
        <button
          onClick={() => navigate('/finance/invoices/new')}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors"
        >
          + New Invoice
        </button>
      </div>

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        placeholder="Search invoice #, title, customer, address…"
        fields={filterFields}
        values={filters}
        onChange={setFilters}
        defaultOpen={!statusFilter}
      />

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mb-4">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-400">Loading invoices…</p>
      ) : invoices.length === 0 ? (
        <EmptyState
          title="No invoices found"
          description={filtering ? 'No invoices match your search or filters.' : 'Create your first invoice, or complete a job to generate one automatically.'}
        />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-100">
                <th className="text-left px-5 py-3">Invoice #</th>
                <th className="text-left px-5 py-3">Title</th>
                <th className="text-left px-5 py-3">Customer</th>
                <th className="text-left px-5 py-3">Assigned To</th>
                <th className="text-left px-5 py-3">Issued</th>
                <th className="text-left px-5 py-3">Due</th>
                <th className="text-right px-5 py-3">Total</th>
                <th className="text-left px-5 py-3">Status</th>
                <th className="text-left px-5 py-3">Payment Method</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {invoices.map((inv) => (
                <tr
                  key={inv.id}
                  onClick={() => navigate(`/finance/invoices/${inv.id}`)}
                  className="hover:bg-blue-50 transition-colors cursor-pointer"
                >
                  <td className="px-5 py-3 font-mono text-xs text-gray-500">{inv.invoice_ref ?? '—'}</td>
                  <td className="px-5 py-3 font-medium text-gray-900">{inv.title ?? '—'}</td>
                  <td className="px-5 py-3 text-gray-600">{inv.customers?.customer_name ?? '—'}</td>
                  <AssigneesCell names={inv.assignees} emptyLabel={inv.job_id ? 'Unassigned' : null} />
                  <td className="px-5 py-3 text-gray-600">{formatDate(inv.issue_date)}</td>
                  <td className="px-5 py-3 text-gray-600">{formatDate(inv.due_date)}</td>
                  <td className="px-5 py-3 text-right font-medium text-gray-900">{formatCurrency(inv.total)}</td>
                  <td className="px-5 py-3"><StatusBadge status={inv.status} /></td>
                  <td className="px-5 py-3"><PaymentMethodBadge method={inv.payment_method} /></td>
                </tr>
              ))}
            </tbody>
          </table>

          <PaginationBar
            count={total}
            shown={invoices.length}
            onLoadMore={() => load(page + 1)}
            loading={loadingMore}
          />
        </div>
      )}
    </PageContainer>
  )
}
