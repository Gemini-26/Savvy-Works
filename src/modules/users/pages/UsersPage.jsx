import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import PageContainer from '../../../shared/components/PageContainer.jsx'
import PageHeader from '../../../shared/components/PageHeader'
import EmptyState from '../../../shared/components/EmptyState'
import PaginationBar from '../../../shared/components/PaginationBar'
import SearchBar from '../../../shared/components/SearchBar'
import { fetchProfiles } from '../services/profileService'
import { useCurrentUser } from '../../../hooks/useCurrentUser'

const ROLE_COLORS = {
  admin:      'bg-purple-100 text-purple-700',
  technician: 'bg-blue-100 text-blue-700',
  viewer:     'bg-gray-100 text-gray-600',
}

const AVATAR_COLORS = [
  '#3B82F6','#10B981','#8B5CF6','#F59E0B',
  '#EF4444','#14B8A6','#6366F1','#EC4899',
]

function Avatar({ name, color }) {
  const bg = color || AVATAR_COLORS[name?.charCodeAt(0) % AVATAR_COLORS.length] || '#3B82F6'
  return (
    <div
      className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-white text-sm uppercase flex-shrink-0"
      style={{ backgroundColor: bg }}
    >
      {name?.[0] ?? '?'}
    </div>
  )
}

export default function UsersPage({ activeOnly = true }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { isAdmin } = useCurrentUser()
  const [profiles,    setProfiles]    = useState([])
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
    setProfiles([])
    setTotal(0)
    setPage(0)
    load(0, true)
  }, [location.key, activeOnly, debouncedSearch])

  async function load(pageNum, replace = false) {
    if (replace) setLoading(true)
    else setLoadingMore(true)
    setError(null)
    try {
      const result = await fetchProfiles(activeOnly, pageNum, debouncedSearch)
      setTotal(result.count ?? 0)
      setProfiles(prev => replace ? result.data : [...prev, ...result.data])
      setPage(pageNum)
    } catch (err) {
      setError(err.message || 'Failed to load users')
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  const title    = activeOnly ? 'Active Users' : 'Inactive Users'
  const subtitle = activeOnly
    ? 'Technicians and staff available for job assignment'
    : 'Deactivated staff members'

  return (
    <PageContainer>
      <div className="flex items-center justify-between">
        <PageHeader title={title} subtitle={subtitle} />
        {isAdmin && (
          <button
            onClick={() => navigate('/users/new')}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors"
          >
            + New User
          </button>
        )}
      </div>

      <div className="mt-4">
        <SearchBar value={search} onChange={setSearch} placeholder="Search by name or email…" />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mt-4">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-400 mt-4">Loading users…</p>
      ) : profiles.length === 0 ? (
        <EmptyState
          title="No users found"
          description="Add your first technician or staff member to get started."
        />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mt-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-100 bg-gray-50">
                <th className="text-left px-5 py-3">Name</th>
                <th className="text-left px-5 py-3">Role</th>
                <th className="text-left px-5 py-3">Email</th>
                <th className="text-left px-5 py-3">Phone</th>
                <th className="text-left px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {profiles.map(p => (
                <tr
                  key={p.id}
                  onClick={() => navigate(`/users/${p.id}`)}
                  className="hover:bg-blue-50 transition-colors cursor-pointer"
                >
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={p.full_name} color={p.color} />
                      <span className="font-medium text-gray-900">{p.full_name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${ROLE_COLORS[p.role] ?? 'bg-gray-100 text-gray-600'}`}>
                      {p.role}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-gray-600">{p.email || '—'}</td>
                  <td className="px-5 py-3 text-gray-600">{p.phone || '—'}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${p.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {p.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <PaginationBar
            count={total}
            shown={profiles.length}
            onLoadMore={() => load(page + 1)}
            loading={loadingMore}
          />
        </div>
      )}
    </PageContainer>
  )
}
