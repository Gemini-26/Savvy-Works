import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FileText, Send, CheckCircle2, ArrowRightCircle, ArrowRight } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import PageContainer from '../../../shared/components/PageContainer.jsx'
import { formatCurrency } from '../../../shared/utils/formatCurrency'
import { formatDate } from '../../../shared/utils/formatDate'

async function fetchStats() {
  const [draft, actioned, accepted, converted] = await Promise.all([
    supabase.from('quotes').select('*', { count: 'exact', head: true }).eq('status', 'draft'),
    supabase.from('quotes').select('*', { count: 'exact', head: true }).eq('status', 'actioned'),
    supabase.from('quotes').select('*', { count: 'exact', head: true }).eq('status', 'accepted'),
    supabase.from('quotes').select('*', { count: 'exact', head: true }).eq('status', 'converted'),
  ])
  return {
    draft:     draft.count     ?? 0,
    actioned:  actioned.count  ?? 0,
    accepted:  accepted.count  ?? 0,
    converted: converted.count ?? 0,
  }
}

async function fetchRecentQuotes() {
  const { data } = await supabase
    .from('quotes')
    .select('id, quote_ref, title, status, total, issue_date, customers(customer_name)')
    .order('created_at', { ascending: false })
    .limit(6)
  return data ?? []
}

const STATUS_STYLES = {
  draft:     'bg-gray-100 text-gray-600',
  sent:      'bg-blue-50 text-blue-700',
  actioned:  'bg-yellow-50 text-yellow-700',
  accepted:  'bg-green-50 text-green-700',
  rejected:  'bg-red-50 text-red-600',
  converted: 'bg-teal-50 text-teal-700',
}

export default function QuotesDashboardPage() {
  const [stats,   setStats]   = useState(null)
  const [recent,  setRecent]  = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([fetchStats(), fetchRecentQuotes()]).then(([s, q]) => {
      setStats(s)
      setRecent(q)
      setLoading(false)
    })
  }, [])

  const statCards = stats ? [
    { label: 'Draft Quotes',     value: stats.draft,     icon: FileText,         color: 'text-gray-600',  bg: 'bg-gray-100',  to: '/quotes/draft' },
    { label: 'Actioned Quotes',  value: stats.actioned,  icon: Send,             color: 'text-yellow-600',bg: 'bg-yellow-50', to: '/quotes/actioned' },
    { label: 'Accepted Quotes',  value: stats.accepted,  icon: CheckCircle2,     color: 'text-green-600', bg: 'bg-green-50',  to: '/quotes/accepted' },
    { label: 'Converted Quotes', value: stats.converted, icon: ArrowRightCircle, color: 'text-teal-600',  bg: 'bg-teal-50',   to: '/quotes/converted' },
  ] : []

  return (
    <PageContainer>
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Quotes Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">Overview of quote activity across every status</p>
        </div>
        <Link to="/quotes/new"
          className="flex items-center gap-1.5 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm">
          + New Quote
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
          <h2 className="font-semibold text-gray-900">Recent Quotes</h2>
          <Link to="/quotes/draft" className="text-sm text-blue-600 hover:text-blue-700 font-medium">
            View all →
          </Link>
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Loading…</div>
        ) : recent.length === 0 ? (
          <div className="p-8 text-center">
            <div className="text-4xl mb-3">📄</div>
            <div className="text-gray-500 text-sm">No quotes yet. <Link to="/quotes/new" className="text-blue-600">Create your first quote →</Link></div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-100">
                  <th className="text-left px-5 py-3">Quote Ref.</th>
                  <th className="text-left px-5 py-3">Title</th>
                  <th className="text-left px-5 py-3">Customer</th>
                  <th className="text-left px-5 py-3">Status</th>
                  <th className="text-left px-5 py-3">Issued</th>
                  <th className="text-right px-5 py-3">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {recent.map(q => (
                  <tr key={q.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3 font-mono text-xs text-gray-500">{q.quote_ref ?? '—'}</td>
                    <td className="px-5 py-3">
                      <Link to={`/quotes/${q.id}`} className="font-medium text-gray-900 hover:text-blue-600">
                        {q.title ?? 'Untitled'}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-gray-600">{q.customers?.customer_name ?? '—'}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_STYLES[q.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {q.status?.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-500">{formatDate(q.issue_date)}</td>
                    <td className="px-5 py-3 text-right font-medium text-gray-900">{formatCurrency(q.total)}</td>
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
