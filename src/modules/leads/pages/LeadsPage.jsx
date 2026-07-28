import { useEffect, useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import PageContainer from '../../../shared/components/PageContainer.jsx'
import PageHeader from '../../../shared/components/PageHeader'
import EmptyState from '../../../shared/components/EmptyState'
import PaginationBar from '../../../shared/components/PaginationBar'
import { fetchLeads } from '../services/leadService'

const STATUS_COLORS = {
  new:       'bg-blue-100 text-blue-700',
  actioned:  'bg-yellow-100 text-yellow-700',
  rejected:  'bg-red-100 text-red-600',
  converted: 'bg-green-100 text-green-700',
}

export default function LeadsPage({ statusFilter }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [leads,       setLeads]       = useState([])
  const [total,       setTotal]       = useState(0)
  const [page,        setPage]        = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState(null)

  useEffect(() => {
    setLeads([])
    setTotal(0)
    setPage(0)
    load(0, true)
  }, [location.key, statusFilter])

  async function load(pageNum, replace = false) {
    if (replace) setLoading(true)
    else setLoadingMore(true)
    setError(null)
    try {
      const result = await fetchLeads(statusFilter, pageNum)
      setTotal(result.count ?? 0)
      setLeads(prev => replace ? result.data : [...prev, ...result.data])
      setPage(pageNum)
    } catch (err) {
      setError(err.message || 'Failed to load leads')
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  const title = statusFilter === 'actioned'  ? 'Actioned Leads'
              : statusFilter === 'rejected'  ? 'Rejected Leads'
              : statusFilter === 'converted' ? 'Converted Leads'
              : 'All Leads'

  return (
    <PageContainer>
      <div className="flex items-center justify-between mb-6">
        <PageHeader title={title} subtitle="Track and manage incoming leads" />
        <Link
          to="/leads/new"
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors"
        >
          + New Lead
        </Link>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-400">Loading leads…</p>
      ) : leads.length === 0 ? (
        <EmptyState
          title="No leads yet"
          description="Add your first lead to start tracking opportunities."
        />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-100">
                <th className="text-left px-5 py-3">Lead Ref.</th>
                <th className="text-left px-5 py-3">Full Name</th>
                <th className="text-left px-5 py-3">Company</th>
                <th className="text-left px-5 py-3">Telephone</th>
                <th className="text-left px-5 py-3">Status</th>
                <th className="text-left px-5 py-3">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {leads.map((lead) => (
                <tr
                  key={lead.id}
                  onClick={() => navigate(`/leads/${lead.id}`)}
                  className="hover:bg-blue-50 transition-colors cursor-pointer"
                >
                  <td className="px-5 py-3 font-mono text-xs text-gray-500">{lead.lead_ref ?? '—'}</td>
                  <td className="px-5 py-3 font-medium text-gray-900">{lead.full_name ?? '—'}</td>
                  <td className="px-5 py-3 text-gray-600">{lead.company_name ?? lead.customers?.customer_name ?? '—'}</td>
                  <td className="px-5 py-3 text-gray-600">{lead.telephone ?? '—'}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${STATUS_COLORS[lead.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {lead.status ?? '—'}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-gray-600">{lead.source ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <PaginationBar
            count={total}
            shown={leads.length}
            onLoadMore={() => load(page + 1)}
            loading={loadingMore}
          />
        </div>
      )}
    </PageContainer>
  )
}
