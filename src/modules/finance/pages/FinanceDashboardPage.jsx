import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FileEdit, Clock, AlertCircle, CheckCircle2, ArrowRight, ClipboardList } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import PageContainer from '../../../shared/components/PageContainer.jsx'
import { formatCurrency } from '../../../shared/utils/formatCurrency'
import { formatDate } from '../../../shared/utils/formatDate'

async function fetchStats() {
  const [draft, outstanding, overdue, paid, poDraft, poAwaiting, poApproved] = await Promise.all([
    supabase.from('invoices').select('*', { count: 'exact', head: true }).eq('status', 'draft'),
    supabase.from('invoices').select('*', { count: 'exact', head: true })
      .not('status', 'in', '("cancelled","paid","draft")'),
    supabase.from('invoices').select('*', { count: 'exact', head: true }).eq('status', 'overdue'),
    supabase.from('invoices').select('*', { count: 'exact', head: true }).eq('status', 'paid'),
    supabase.from('purchase_orders').select('*', { count: 'exact', head: true }).eq('status', 'draft'),
    supabase.from('purchase_orders').select('*', { count: 'exact', head: true }).eq('status', 'awaiting_approval'),
    supabase.from('purchase_orders').select('*', { count: 'exact', head: true }).eq('status', 'approved'),
  ])
  return {
    draft:       draft.count       ?? 0,
    outstanding: outstanding.count ?? 0,
    overdue:     overdue.count     ?? 0,
    paid:        paid.count        ?? 0,
    poDraft:     poDraft.count     ?? 0,
    poAwaiting:  poAwaiting.count  ?? 0,
    poApproved:  poApproved.count  ?? 0,
  }
}

async function fetchRecentPOs() {
  const { data } = await supabase
    .from('purchase_orders')
    .select('id, po_ref, status, total, created_at, supplier_name')
    .order('created_at', { ascending: false })
    .limit(6)
  return data ?? []
}

async function fetchRecentInvoices() {
  const { data } = await supabase
    .from('invoices')
    .select('id, invoice_number, status, total, created_at, customers(customer_name)')
    .order('created_at', { ascending: false })
    .limit(6)
  return data ?? []
}

const STATUS_STYLES = {
  draft:             'bg-gray-100 text-gray-600',
  outstanding:       'bg-blue-50 text-blue-700',
  overdue:           'bg-red-50 text-red-600',
  paid:              'bg-green-50 text-green-700',
  cancelled:         'bg-gray-100 text-gray-500',
  awaiting_approval: 'bg-yellow-50 text-yellow-700',
  approved:          'bg-green-50 text-green-700',
  rejected:          'bg-red-50 text-red-600',
  actioned:          'bg-blue-50 text-blue-700',
}

export default function FinanceDashboardPage() {
  const [stats,     setStats]     = useState(null)
  const [recent,    setRecent]    = useState([])
  const [recentPOs, setRecentPOs] = useState([])
  const [loading,   setLoading]   = useState(true)

  useEffect(() => {
    Promise.all([fetchStats(), fetchRecentInvoices(), fetchRecentPOs()]).then(([s, i, p]) => {
      setStats(s)
      setRecent(i)
      setRecentPOs(p)
      setLoading(false)
    })
  }, [])

  const statCards = stats ? [
    { label: 'Draft Invoices',       value: stats.draft,       icon: FileEdit,     color: 'text-gray-600',  bg: 'bg-gray-100',  to: '/finance/invoices/draft' },
    { label: 'Outstanding Invoices', value: stats.outstanding, icon: Clock,        color: 'text-blue-600',  bg: 'bg-blue-50',   to: '/finance/invoices/outstanding' },
    { label: 'Overdue Invoices',     value: stats.overdue,     icon: AlertCircle,  color: 'text-red-600',   bg: 'bg-red-50',    to: '/finance/invoices/overdue', urgent: stats.overdue > 0 },
    { label: 'Paid Invoices',        value: stats.paid,        icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50',  to: '/finance/invoices/paid' },
  ] : []

  return (
    <PageContainer>
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Finance Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">Invoices &amp; purchase order activity</p>
        </div>
        <Link to="/finance/invoices/new"
          className="flex items-center gap-1.5 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm">
          + New Invoice
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse">
                <div className="w-10 h-10 bg-gray-100 rounded-lg mb-3" />
                <div className="h-7 bg-gray-100 rounded w-12 mb-1.5" />
                <div className="h-4 bg-gray-100 rounded w-24" />
              </div>
            ))
          : statCards.map(card => {
              const Icon = card.icon
              return (
                <Link key={card.label} to={card.to}
                  className={`bg-white rounded-xl border p-5 hover:shadow-md transition-shadow group ${card.urgent ? 'border-red-200' : 'border-gray-200'}`}>
                  <div className={`w-10 h-10 ${card.bg} rounded-lg flex items-center justify-center mb-3`}>
                    <Icon size={20} className={card.color} />
                  </div>
                  <div className="text-2xl font-bold text-gray-900 tabular-nums">{card.value}</div>
                  <div className="text-sm text-gray-500 mt-0.5 flex items-center justify-between">
                    {card.label}
                    <ArrowRight size={14} className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400" />
                  </div>
                </Link>
              )
            })
        }
      </div>

      <div className="flex items-center justify-between mt-2 mb-2">
        <h2 className="text-lg font-bold text-gray-900">Purchase Orders</h2>
        <Link to="/finance/po/new"
          className="flex items-center gap-1.5 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm">
          + New Purchase Order
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {loading
          ? Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse">
                <div className="w-10 h-10 bg-gray-100 rounded-lg mb-3" />
                <div className="h-7 bg-gray-100 rounded w-12 mb-1.5" />
                <div className="h-4 bg-gray-100 rounded w-24" />
              </div>
            ))
          : [
              { label: 'Draft POs',      value: stats.poDraft,    icon: FileEdit,       color: 'text-gray-600',   bg: 'bg-gray-100',   to: '/finance/po/draft' },
              { label: 'Awaiting Approval', value: stats.poAwaiting, icon: Clock,       color: 'text-yellow-600', bg: 'bg-yellow-50',  to: '/finance/po/awaiting' },
              { label: 'Approved POs',   value: stats.poApproved, icon: ClipboardList, color: 'text-violet-600', bg: 'bg-violet-50',  to: '/finance/po/approved' },
            ].map(card => {
              const Icon = card.icon
              return (
                <Link key={card.label} to={card.to}
                  className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow group">
                  <div className={`w-10 h-10 ${card.bg} rounded-lg flex items-center justify-center mb-3`}>
                    <Icon size={20} className={card.color} />
                  </div>
                  <div className="text-2xl font-bold text-gray-900 tabular-nums">{card.value}</div>
                  <div className="text-sm text-gray-500 mt-0.5 flex items-center justify-between">
                    {card.label}
                    <ArrowRight size={14} className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400" />
                  </div>
                </Link>
              )
            })
        }
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Recent Purchase Orders</h2>
          <Link to="/finance/po/draft" className="text-sm text-blue-600 hover:text-blue-700 font-medium">
            View all →
          </Link>
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Loading…</div>
        ) : recentPOs.length === 0 ? (
          <div className="p-8 text-center">
            <div className="text-4xl mb-3">📦</div>
            <div className="text-gray-500 text-sm">No purchase orders yet.</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-100">
                  <th className="text-left px-5 py-3">PO #</th>
                  <th className="text-left px-5 py-3">Supplier</th>
                  <th className="text-left px-5 py-3">Status</th>
                  <th className="text-left px-5 py-3">Date</th>
                  <th className="text-right px-5 py-3">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {recentPOs.map(po => (
                  <tr key={po.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3 font-mono text-xs text-gray-500">{po.po_ref ?? '—'}</td>
                    <td className="px-5 py-3 text-gray-600">{po.supplier_name ?? '—'}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_STYLES[po.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {po.status?.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-500">{formatDate(po.created_at)}</td>
                    <td className="px-5 py-3 text-right font-medium text-gray-900">{formatCurrency(po.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Recent Invoices</h2>
          <Link to="/finance/invoices/outstanding" className="text-sm text-blue-600 hover:text-blue-700 font-medium">
            View all →
          </Link>
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Loading…</div>
        ) : recent.length === 0 ? (
          <div className="p-8 text-center">
            <div className="text-4xl mb-3">🧾</div>
            <div className="text-gray-500 text-sm">No invoices yet. They'll appear here once the Invoicing phase is built.</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-100">
                  <th className="text-left px-5 py-3">Invoice #</th>
                  <th className="text-left px-5 py-3">Customer</th>
                  <th className="text-left px-5 py-3">Status</th>
                  <th className="text-left px-5 py-3">Date</th>
                  <th className="text-right px-5 py-3">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {recent.map(inv => (
                  <tr key={inv.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3 font-mono text-xs text-gray-500">{inv.invoice_number ?? '—'}</td>
                    <td className="px-5 py-3 text-gray-600">{inv.customers?.customer_name ?? '—'}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_STYLES[inv.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {inv.status?.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-500">{formatDate(inv.created_at)}</td>
                    <td className="px-5 py-3 text-right font-medium text-gray-900">{formatCurrency(inv.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </PageContainer>
  )
}
