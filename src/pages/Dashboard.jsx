import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import {
  Briefcase, FileText, DollarSign, Users,
  Target, Truck, CheckCircle, AlertCircle,
  ArrowRight
} from 'lucide-react'

// ── Fetch all dashboard counts in one go ─────────────────────────────────────
async function fetchStats() {
  const [jobs, quotes, invoices, customers, leads, overdueInvoices, completedJobs, suppliers] = await Promise.all([
    supabase.from('jobs').select('*', { count: 'exact', head: true })
      .is('archived_at', null)
      .not('status', 'in', '("cancelled","invoiced")'),
    supabase.from('quotes').select('*', { count: 'exact', head: true })
      .in('status', ['draft','sent']),
    supabase.from('invoices').select('*', { count: 'exact', head: true })
      .not('status', 'in', '("cancelled","paid")'),
    supabase.from('customers').select('*', { count: 'exact', head: true })
      .eq('status', 'active'),
    supabase.from('leads').select('*', { count: 'exact', head: true })
      .not('status', 'in', '("converted","rejected")'),
    supabase.from('invoices').select('*', { count: 'exact', head: true })
      .eq('status', 'overdue'),
    supabase.from('jobs').select('*', { count: 'exact', head: true })
      .is('archived_at', null)
      .eq('status', 'completed'),
    supabase.from('suppliers').select('*', { count: 'exact', head: true })
      .eq('active', true),
  ])
  return {
    jobs:            jobs.count            ?? 0,
    quotes:          quotes.count          ?? 0,
    invoices:        invoices.count        ?? 0,
    customers:       customers.count       ?? 0,
    leads:           leads.count           ?? 0,
    overdueInvoices: overdueInvoices.count ?? 0,
    completedJobs:   completedJobs.count   ?? 0,
    suppliers:       suppliers.count       ?? 0,
  }
}

// ── Fetch recent jobs ─────────────────────────────────────────────────────────
async function fetchRecentJobs() {
  const { data } = await supabase
    .from('jobs')
    .select('id, job_ref, title, status, priority, scheduled_for, customers(customer_name)')
    .is('archived_at', null)
    .order('created_at', { ascending: false })
    .limit(6)
  return data ?? []
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const STATUS_STYLES = {
  scheduled:   'bg-blue-50 text-blue-700',
  in_progress: 'bg-yellow-50 text-yellow-700',
  on_hold:     'bg-gray-100 text-gray-600',
  completed:   'bg-green-50 text-green-700',
  cancelled:   'bg-red-50 text-red-600',
  invoiced:    'bg-purple-50 text-purple-700',
}
const PRIORITY_DOT = {
  low:    'bg-gray-300',
  normal: 'bg-blue-400',
  high:   'bg-orange-400',
  urgent: 'bg-red-500',
}

function formatDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [stats,      setStats]      = useState(null)
  const [recentJobs, setRecentJobs] = useState([])
  const [loading,    setLoading]    = useState(true)

  useEffect(() => {
    Promise.all([fetchStats(), fetchRecentJobs()]).then(([s, j]) => {
      setStats(s)
      setRecentJobs(j)
      setLoading(false)
    })
  }, [])

  const statCards = stats ? [
    { label: 'Active Jobs',       value: stats.jobs,            icon: Briefcase,   color: 'text-blue-600',   bg: 'bg-blue-50',   to: '/jobs/active' },
    { label: 'Open Quotes',       value: stats.quotes,          icon: FileText,    color: 'text-teal-600',   bg: 'bg-teal-50',   to: '/quotes/draft' },
    { label: 'Unpaid Invoices',   value: stats.invoices,        icon: DollarSign,  color: 'text-violet-600', bg: 'bg-violet-50', to: '/finance/invoices/outstanding' },
    { label: 'Customers',         value: stats.customers,       icon: Users,       color: 'text-orange-600', bg: 'bg-orange-50', to: '/contacts/customers/active' },
    { label: 'Open Leads',        value: stats.leads,           icon: Target,      color: 'text-green-600',  bg: 'bg-green-50',  to: '/leads/all' },
    { label: 'Completed Jobs',    value: stats.completedJobs,   icon: CheckCircle, color: 'text-emerald-600',bg: 'bg-emerald-50',to: '/jobs/active' },
    { label: 'Overdue Invoices',  value: stats.overdueInvoices, icon: AlertCircle, color: 'text-red-600',    bg: 'bg-red-50',    to: '/finance/invoices/overdue',
      urgent: stats.overdueInvoices > 0 },
    { label: 'Active Suppliers',  value: stats.suppliers,       icon: Truck,       color: 'text-slate-600',  bg: 'bg-slate-50',  to: '/contacts/suppliers/active' },
  ] : []

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {new Date().toLocaleDateString('en-ZA', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}
          </p>
        </div>
        <Link
          to="/jobs/new"
          className="flex items-center gap-1.5 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold
                     hover:bg-blue-700 transition-colors shadow-sm"
        >
          + New Job
        </Link>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mb-8">
        {loading
          ? Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse">
                <div className="w-10 h-10 bg-gray-100 rounded-lg mb-3" />
                <div className="h-7 bg-gray-100 rounded w-12 mb-1.5" />
                <div className="h-4 bg-gray-100 rounded w-24" />
              </div>
            ))
          : statCards.map(card => {
              const Icon = card.icon
              return (
                <Link
                  key={card.label}
                  to={card.to}
                  className={`bg-white rounded-xl border p-5 hover:shadow-md transition-shadow group
                    ${card.urgent ? 'border-red-200' : 'border-gray-200'}`}
                >
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

      {/* Recent jobs table */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Recent Jobs</h2>
          <Link to="/jobs" className="text-sm text-blue-600 hover:text-blue-700 font-medium">
            View all →
          </Link>
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Loading…</div>
        ) : recentJobs.length === 0 ? (
          <div className="p-8 text-center">
            <div className="text-4xl mb-3">📋</div>
            <div className="text-gray-500 text-sm">No jobs yet. <Link to="/jobs/new" className="text-blue-600">Create your first job →</Link></div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-100">
                  <th className="text-left px-5 py-3">Job #</th>
                  <th className="text-left px-5 py-3">Title</th>
                  <th className="text-left px-5 py-3">Customer</th>
                  <th className="text-left px-5 py-3">Status</th>
                  <th className="text-left px-5 py-3">Scheduled</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {recentJobs.map(job => (
                  <tr key={job.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3 font-mono text-xs text-gray-500">{job.job_ref}</td>
                    <td className="px-5 py-3">
                      <Link to={`/jobs/${job.id}`} className="font-medium text-gray-900 hover:text-blue-600 flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${PRIORITY_DOT[job.priority] ?? 'bg-gray-300'}`} />
                        {job.title}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-gray-600">{job.customers?.customer_name ?? '—'}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize
                        ${STATUS_STYLES[job.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {job.status?.replace('_',' ')}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-500">{formatDate(job.scheduled_for)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
