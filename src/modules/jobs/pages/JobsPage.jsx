import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import PageContainer from '../../../shared/components/PageContainer.jsx'
import PageHeader from '../../../shared/components/PageHeader'
import EmptyState from '../../../shared/components/EmptyState'
import PaginationBar from '../../../shared/components/PaginationBar'
import SearchBar from '../../../shared/components/SearchBar'
import { fetchJobs } from '../services/jobService'

const STATUS_COLORS = {
  new:         'bg-blue-100 text-blue-700',
  assigned:    'bg-purple-100 text-purple-700',
  scheduled:   'bg-indigo-100 text-indigo-700',
  in_progress: 'bg-yellow-100 text-yellow-700',
  on_hold:     'bg-gray-100 text-gray-600',
  completed:   'bg-green-100 text-green-700',
  invoiced:    'bg-teal-100 text-teal-700',
  cancelled:   'bg-red-100 text-red-600',
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

export default function JobsPage({ statusFilter }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [jobs,        setJobs]        = useState([])
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
    setJobs([])
    setTotal(0)
    setPage(0)
    load(0, true)
  }, [location.key, statusFilter, debouncedSearch])

  async function load(pageNum, replace = false) {
    if (replace) setLoading(true)
    else setLoadingMore(true)
    setError(null)
    try {
      const result = await fetchJobs(statusFilter, pageNum, debouncedSearch)
      setTotal(result.count ?? 0)
      setJobs(prev => replace ? result.data : [...prev, ...result.data])
      setPage(pageNum)
    } catch (err) {
      setError(err.message || 'Failed to load jobs')
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  const title    = statusFilter === 'active'          ? 'Active Jobs'
                 : statusFilter === 'completed'       ? 'Completed Jobs'
                 : statusFilter === 'on_hold'         ? 'Jobs On Hold'
                 : statusFilter === 'overdue'         ? 'Overdue Jobs'
                 : statusFilter === 'action_required' ? 'Action Required'
                 : 'All Jobs'
  const subtitle = statusFilter === 'active'          ? 'Jobs currently in progress or awaiting action'
                 : statusFilter === 'completed'       ? 'Jobs that have been completed'
                 : statusFilter === 'overdue'         ? 'Jobs past their completion date and not yet finished'
                 : statusFilter === 'action_required' ? 'Jobs on hold, or unscheduled and awaiting action'
                 : 'All field jobs'

  return (
    <PageContainer>
      <div className="flex items-center justify-between mb-6">
        <PageHeader title={title} subtitle={subtitle} />
        <button
          onClick={() => navigate('/jobs/new')}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors"
        >
          + New Job
        </button>
      </div>

      <div className="mb-4">
        <SearchBar value={search} onChange={setSearch} placeholder="Search by job ref, title, or address…" />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mb-4">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-400">Loading jobs…</p>
      ) : jobs.length === 0 ? (
        <EmptyState
          title="No jobs found"
          description="Create your first job to start tracking field work."
        />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-100">
                <th className="text-left px-5 py-3">Job Ref.</th>
                <th className="text-left px-5 py-3">Title</th>
                <th className="text-left px-5 py-3">Customer</th>
                <th className="text-left px-5 py-3">Priority</th>
                <th className="text-left px-5 py-3">Scheduled</th>
                <th className="text-left px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {jobs.map((job) => (
                <tr
                  key={job.id}
                  onClick={() => navigate(`/jobs/${job.id}`)}
                  className="hover:bg-blue-50 transition-colors cursor-pointer"
                >
                  <td className="px-5 py-3 font-mono text-xs text-gray-500">{job.job_ref ?? '—'}</td>
                  <td className="px-5 py-3 font-medium text-gray-900">{job.title ?? '—'}</td>
                  <td className="px-5 py-3 text-gray-600">{job.customers?.customer_name ?? '—'}</td>
                  <td className="px-5 py-3 capitalize text-gray-600">{job.priority ?? '—'}</td>
                  <td className="px-5 py-3 text-gray-600">
                    {job.scheduled_for
                      ? new Date(job.scheduled_for).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' })
                      : '—'}
                  </td>
                  <td className="px-5 py-3"><StatusBadge status={job.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>

          <PaginationBar
            count={total}
            shown={jobs.length}
            onLoadMore={() => load(page + 1)}
            loading={loadingMore}
          />
        </div>
      )}
    </PageContainer>
  )
}
