import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import PageContainer from '../../../shared/components/PageContainer.jsx'
import PageHeader from '../../../shared/components/PageHeader'
import EmptyState from '../../../shared/components/EmptyState'
import PaginationBar from '../../../shared/components/PaginationBar'
import SearchBar from '../../../shared/components/SearchBar'
import { fetchPaymentTransactions } from '../services/invoiceService'
import { formatCurrency } from '../../../shared/utils/formatCurrency'
import { formatDate } from '../../../shared/utils/formatDate'
import { Info } from 'lucide-react'

function formatTime(iso) {
  if (!iso) return null
  return new Date(iso).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })
}

const STATUS_COLORS = {
  pending:    'bg-yellow-100 text-yellow-700',
  completed:  'bg-green-100 text-green-700',
  failed:     'bg-red-100 text-red-600',
  superseded: 'bg-gray-100 text-gray-500',
}

const STATUS_LABELS = {
  pending:    'Awaiting Payment',
  completed:  'Paid',
  failed:     'Failed',
  superseded: 'Superseded',
}

const STATUS_HELP = {
  pending:    'A link was sent but the customer hasn’t completed payment yet.',
  completed:  'The customer paid via this link — this is the transaction that counts.',
  failed:     'The customer attempted payment but it didn’t go through.',
  superseded: 'An earlier link that was replaced by a newer one, which the customer paid instead — not a duplicate charge.',
}

function StatusBadge({ status }) {
  const cls = STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-600'
  return (
    <span
      title={STATUS_HELP[status] || ''}
      className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${cls}`}
    >
      {STATUS_LABELS[status] ?? status ?? '—'}
    </span>
  )
}

const TITLES = {
  pending:   'Payments Awaiting Completion',
  completed: 'Completed Payments',
  failed:    'Failed Payments',
}

export default function PaymentsPage({ statusFilter }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [payments,    setPayments]    = useState([])
  const [total,       setTotal]       = useState(0)
  const [page,        setPage]        = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState(null)
  const [search,      setSearch]      = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    setPayments([])
    setTotal(0)
    setPage(0)
    load(0, true)
  }, [location.key, statusFilter, debouncedSearch])

  async function load(pageNum, replace = false) {
    if (replace) setLoading(true)
    else setLoadingMore(true)
    setError(null)
    try {
      const result = await fetchPaymentTransactions(statusFilter, pageNum, debouncedSearch)
      setTotal(result.count ?? 0)
      setPayments(prev => replace ? result.data : [...prev, ...result.data])
      setPage(pageNum)
    } catch (err) {
      setError(err.message || 'Failed to load payments')
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  const title    = TITLES[statusFilter] ?? 'All Payments'
  const subtitle = statusFilter ? `Payment transactions with status "${statusFilter}"` : 'Every PayFast payment link generated, across all invoices'

  return (
    <PageContainer>
      <div className="flex items-center justify-between mb-6">
        <PageHeader title={title} subtitle={subtitle} />
      </div>

      <div className="mb-4">
        <SearchBar value={search} onChange={setSearch} placeholder="Search by invoice #, customer, or payment ID…" />
      </div>

      <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 text-blue-800 text-xs px-4 py-2.5 rounded-lg mb-4">
        <Info size={14} className="mt-0.5 shrink-0" />
        <span>
          Each row is one payment link that was generated — an invoice can have several if a link was resent or regenerated.
          Only the link the customer actually paid through is marked <span className="font-semibold">Paid</span>; any earlier,
          unused links on the same invoice are automatically marked <span className="font-semibold">Superseded</span> once that happens.
        </span>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mb-4">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-400">Loading payments…</p>
      ) : payments.length === 0 ? (
        <EmptyState
          title="No payments found"
          description="Payment links generated from invoices will appear here."
        />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-100">
                <th className="text-left px-5 py-3">Invoice #</th>
                <th className="text-left px-5 py-3">Customer</th>
                <th className="text-left px-5 py-3">Reference</th>
                <th className="text-left px-5 py-3">Created</th>
                <th className="text-right px-5 py-3">Amount</th>
                <th className="text-left px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {payments.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => p.invoice_id && navigate(`/finance/invoices/${p.invoice_id}`)}
                  className={`hover:bg-blue-50 transition-colors cursor-pointer ${p.status === 'superseded' ? 'opacity-60' : ''}`}
                >
                  <td className="px-5 py-3 font-mono text-xs text-gray-500">{p.invoices?.invoice_ref ?? '—'}</td>
                  <td className="px-5 py-3 text-gray-600">{p.invoices?.customers?.customer_name ?? '—'}</td>
                  <td className="px-5 py-3 text-xs text-gray-400" title={p.m_payment_id}>
                    Link generated {formatTime(p.created_at)}
                  </td>
                  <td className="px-5 py-3 text-gray-600">{formatDate(p.created_at)}</td>
                  <td className="px-5 py-3 text-right font-medium text-gray-900">{formatCurrency(p.amount)}</td>
                  <td className="px-5 py-3"><StatusBadge status={p.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>

          <PaginationBar
            count={total}
            shown={payments.length}
            onLoadMore={() => load(page + 1)}
            loading={loadingMore}
          />
        </div>
      )}
    </PageContainer>
  )
}
