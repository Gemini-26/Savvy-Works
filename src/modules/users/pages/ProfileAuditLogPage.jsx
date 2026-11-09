import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import PageContainer from '../../../shared/components/PageContainer.jsx'
import PageHeader from '../../../shared/components/PageHeader'
import EmptyState from '../../../shared/components/EmptyState'
import SearchBar from '../../../shared/components/SearchBar'
import { fetchProfileAuditLog } from '../services/profileAuditService'
import { useCurrentUser } from '../../../hooks/useCurrentUser'

const ACTIONS = [
  { value: '',            label: 'All actions' },
  { value: 'created',     label: 'Created' },
  { value: 'updated',     label: 'Edited' },
  { value: 'deactivated', label: 'Deactivated' },
  { value: 'reactivated', label: 'Reactivated' },
  { value: 'deleted',     label: 'Deleted' },
]

const ACTION_STYLE = {
  created:     { label: 'Created',     cls: 'bg-green-100 text-green-700' },
  updated:     { label: 'Edited',      cls: 'bg-blue-100 text-blue-700' },
  deactivated: { label: 'Deactivated', cls: 'bg-amber-100 text-amber-700' },
  reactivated: { label: 'Reactivated', cls: 'bg-emerald-100 text-emerald-700' },
  deleted:     { label: 'Deleted',     cls: 'bg-red-100 text-red-700' },
}

const FIELD_LABELS = {
  full_name: 'Name', role: 'Role', phone: 'Phone', color: 'Colour', email: 'Email',
  is_active: 'Status', avatar_url: 'Photo', auth_user_id: 'Login link', company_id: 'Company',
}

// Fields whose raw value (a long id or a file path) isn't worth showing.
const OPAQUE = new Set(['auth_user_id', 'company_id', 'avatar_url'])

function show(field, v) {
  if (field === 'is_active') return v ? 'Active' : 'Inactive'
  if (v === null || v === undefined || v === '') return '—'
  return String(v)
}

// One short line per thing that happened.
function describe(row) {
  const c = row.changes || {}
  if (row.action === 'created' || row.action === 'deleted') {
    const bits = [c.role && `Role: ${c.role}`, c.email, c.phone].filter(Boolean)
    return bits.length ? [bits.join(' · ')] : []
  }
  return Object.entries(c).map(([field, { from, to }]) => {
    const label = FIELD_LABELS[field] || field
    return OPAQUE.has(field) ? `${label} changed` : `${label}: ${show(field, from)} → ${show(field, to)}`
  })
}

function Who({ row }) {
  if (row.actor_name || row.actor_email) {
    return (
      <div>
        <div className="font-medium text-gray-900">{row.actor_name || row.actor_email}</div>
        {row.actor_name && row.actor_email && <div className="text-xs text-gray-400">{row.actor_email}</div>}
      </div>
    )
  }
  return (
    <span className="text-gray-400 italic">
      {row.via === 'database' ? 'Database (no sign-in)' : row.via === 'server' ? 'System' : 'Unknown'}
    </span>
  )
}

export default function ProfileAuditLogPage() {
  const { isAdmin, loading: userLoading } = useCurrentUser()
  const [rows,        setRows]        = useState([])
  const [total,       setTotal]       = useState(0)
  const [page,        setPage]        = useState(0)
  const [loading,     setLoading]     = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error,       setError]       = useState(null)
  const [action,      setAction]      = useState('')
  const [search,      setSearch]      = useState('')
  const [debounced,   setDebounced]   = useState('')

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300)
    return () => clearTimeout(t)
  }, [search])

  async function load(pageNum, replace) {
    if (replace) setLoading(true); else setLoadingMore(true)
    setError(null)
    try {
      const result = await fetchProfileAuditLog({ page: pageNum, action, search: debounced })
      setTotal(result.count)
      setRows(prev => replace ? result.data : [...prev, ...result.data])
      setPage(pageNum)
    } catch (err) {
      setError(err.message || 'Failed to load the audit log')
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  useEffect(() => {
    if (!isAdmin) return
    setRows([]); setTotal(0); setPage(0)
    load(0, true)
  }, [isAdmin, action, debounced])

  if (!userLoading && !isAdmin) {
    return (
      <PageContainer>
        <PageHeader title="Profile Audit Log" subtitle="Who created, edited, deactivated or deleted a profile" />
        <p className="text-sm text-gray-500 mt-4">Only admins can see the audit log.</p>
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <PageHeader
        title="Profile Audit Log"
        subtitle="Who created, edited, deactivated or deleted a profile — recorded from the day this log was switched on"
      />

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[220px]">
          <SearchBar value={search} onChange={setSearch} placeholder="Search by person changed or who changed them…" />
        </div>
        <select
          value={action}
          onChange={e => setAction(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {ACTIONS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
        </select>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mt-4">{error}</div>
      )}

      {loading ? (
        <p className="text-sm text-gray-400 mt-4">Loading…</p>
      ) : rows.length === 0 ? (
        <EmptyState
          title="Nothing logged yet"
          description={action || debounced
            ? 'No entries match that filter.'
            : 'Profile changes made from now on will appear here.'}
        />
      ) : (
        <>
          <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto mt-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-5 py-3 whitespace-nowrap">When</th>
                  <th className="text-left px-5 py-3">Done by</th>
                  <th className="text-left px-5 py-3">Action</th>
                  <th className="text-left px-5 py-3">Profile</th>
                  <th className="text-left px-5 py-3">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map(row => {
                  const style = ACTION_STYLE[row.action] || { label: row.action, cls: 'bg-gray-100 text-gray-600' }
                  const lines = describe(row)
                  return (
                    <tr key={row.id} className="align-top">
                      <td className="px-5 py-3 whitespace-nowrap text-gray-600">{new Date(row.created_at).toLocaleString()}</td>
                      <td className="px-5 py-3"><Who row={row} /></td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${style.cls}`}>{style.label}</span>
                      </td>
                      <td className="px-5 py-3">
                        {/* A deleted profile no longer has a page to open. */}
                        {row.action === 'deleted'
                          ? <div className="font-medium text-gray-900">{row.profile_name || 'Unnamed'}</div>
                          : <Link to={`/users/${row.profile_id}`} className="font-medium text-blue-600 hover:underline">{row.profile_name || 'Unnamed'}</Link>}
                        {row.profile_email && <div className="text-xs text-gray-400">{row.profile_email}</div>}
                      </td>
                      <td className="px-5 py-3 text-gray-600">
                        {lines.length === 0 ? '—' : lines.map((l, i) => <div key={i}>{l}</div>)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between mt-3 text-xs text-gray-400">
            <span>Showing {rows.length} of {total}</span>
            {rows.length < total && (
              <button
                type="button"
                onClick={() => load(page + 1, false)}
                disabled={loadingMore}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            )}
          </div>
        </>
      )}
    </PageContainer>
  )
}
