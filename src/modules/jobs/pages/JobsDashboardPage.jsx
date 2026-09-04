import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Briefcase, UserX, PauseCircle, CheckCircle, ArrowRight } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import PageContainer from '../../../shared/components/PageContainer.jsx'
import DashboardCharts from '../../../shared/components/DashboardCharts.jsx'
import { formatDate } from '../../../shared/utils/formatDate'

async function fetchCreatedTrend() {
  const days = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (6 - i))
    return d
  })
  const since = days[0].toISOString().slice(0, 10)
  const { data } = await supabase
    .from('jobs')
    .select('created_at')
    .is('archived_at', null)
    .gte('created_at', since)
  const counts = {}
  for (const d of days) counts[d.toISOString().slice(0, 10)] = 0
  for (const row of data ?? []) {
    const key = row.created_at?.slice(0, 10)
    if (key in counts) counts[key] += 1
  }
  return days.map(d => {
    const key = d.toISOString().slice(0, 10)
    return { name: d.toLocaleDateString('en-ZA', { weekday: 'short' }), value: counts[key] }
  })
}

async function fetchPriorityBreakdown() {
  const { data } = await supabase
    .from('jobs')
    .select('priority')
    .is('archived_at', null)
    .not('status', 'in', '("cancelled","invoiced","completed")')
  const counts = {}
  for (const row of data ?? []) {
    const p = row.priority || 'none'
    counts[p] = (counts[p] || 0) + 1
  }
  return Object.entries(counts).map(([name, value]) => ({ name, value }))
}

async function fetchStats() {
  const [active, unassigned, onHold, completed] = await Promise.all([
    supabase.from('jobs').select('*', { count: 'exact', head: true })
      .is('archived_at', null)
      .not('status', 'in', '("cancelled","invoiced","completed")'),
    supabase.from('jobs').select('*', { count: 'exact', head: true }).is('archived_at', null).eq('status', 'unassigned'),
    supabase.from('jobs').select('*', { count: 'exact', head: true }).is('archived_at', null).eq('status', 'on_hold'),
    supabase.from('jobs').select('*', { count: 'exact', head: true }).is('archived_at', null).eq('status', 'completed'),
  ])
  return {
    active:     active.count     ?? 0,
    unassigned: unassigned.count ?? 0,
    onHold:     onHold.count     ?? 0,
    completed:  completed.count  ?? 0,
  }
}

async function fetchRecentJobs() {
  const { data } = await supabase
    .from('jobs')
    .select('id, job_ref, title, status, priority, scheduled_for, customers(customer_name)')
    .is('archived_at', null)
    .order('created_at', { ascending: false })
    .limit(6)
  return data ?? []
}

const STATUS_STYLES = {
  new:         'bg-blue-50 text-blue-700',
  unassigned:  'bg-gray-100 text-gray-600',
  assigned:    'bg-purple-50 text-purple-700',
  scheduled:   'bg-indigo-50 text-indigo-700',
  in_progress: 'bg-yellow-50 text-yellow-700',
  on_hold:     'bg-gray-100 text-gray-600',
  completed:   'bg-green-50 text-green-700',
  invoiced:    'bg-teal-50 text-teal-700',
  cancelled:   'bg-red-50 text-red-600',
}
const PRIORITY_DOT = {
  low: 'bg-gray-300', medium: 'bg-blue-400', high: 'bg-orange-400', urgent: 'bg-red-500',
}

export default function JobsDashboardPage() {
  const [stats,   setStats]   = useState(null)
  const [recent,  setRecent]  = useState([])
  const [trend,   setTrend]   = useState([])
  const [priority,setPriority]= useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([fetchStats(), fetchRecentJobs(), fetchCreatedTrend(), fetchPriorityBreakdown()]).then(([s, j, t, p]) => {
      setStats(s)
      setRecent(j)
      setTrend(t)
      setPriority(p)
      setLoading(false)
    })
  }, [])

  const statCards = stats ? [
    { label: 'Active Jobs',     value: stats.active,     icon: Briefcase,    color: 'text-blue-600',   bg: 'bg-blue-50',   to: '/jobs/active' },
    { label: 'Unassigned Jobs', value: stats.unassigned, icon: UserX,        color: 'text-gray-600',   bg: 'bg-gray-100',  to: '/jobs/unassigned' },
    { label: 'On Hold',         value: stats.onHold,     icon: PauseCircle,  color: 'text-orange-600', bg: 'bg-orange-50', to: '/jobs/on-hold' },
    { label: 'Completed Jobs',  value: stats.completed,  icon: CheckCircle,  color: 'text-green-600',  bg: 'bg-green-50',  to: '/jobs/completed' },
  ] : []

  return (
    <PageContainer>
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Jobs Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">Overview of field work across every status</p>
        </div>
        <Link to="/jobs/new"
          className="flex items-center gap-1.5 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm">
          + New Job
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

      <DashboardCharts
        loading={loading}
        bar={{ title: 'Jobs by status', color: '#3B82F6', data: statCards.map(c => ({ name: c.label.replace(' Jobs', ''), value: c.value })) }}
        line={{ title: 'Jobs created (last 7 days)', color: '#10B981', data: trend }}
        pie={{ title: 'Active jobs by priority', data: priority }}
      />

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Recent Jobs</h2>
          <Link to="/jobs/active" className="text-sm text-blue-600 hover:text-blue-700 font-medium">
            View all →
          </Link>
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Loading…</div>
        ) : recent.length === 0 ? (
          <div className="p-8 text-center">
            <div className="text-4xl mb-3">🛠️</div>
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
                {recent.map(job => (
                  <tr key={job.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3 font-mono text-xs text-gray-500">{job.job_ref ?? '—'}</td>
                    <td className="px-5 py-3">
                      <Link to={`/jobs/${job.id}`} className="font-medium text-gray-900 hover:text-blue-600 flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${PRIORITY_DOT[job.priority] ?? 'bg-gray-300'}`} />
                        {job.title ?? 'Untitled'}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-gray-600">{job.customers?.customer_name ?? '—'}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_STYLES[job.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {job.status?.replace('_', ' ')}
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
    </PageContainer>
  )
}
