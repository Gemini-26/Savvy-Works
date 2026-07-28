import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PageContainer from '../../../shared/components/PageContainer.jsx'
import PageHeader from '../../../shared/components/PageHeader'
import EmptyState from '../../../shared/components/EmptyState'
import { fetchProfiles } from '../services/profileService'

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

export default function UserLogsPage() {
  const navigate = useNavigate()
  const [profiles, setProfiles] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(null)

  useEffect(() => {
    fetchProfiles(false)
      .then(result => setProfiles(result.data))
      .catch(err => setError(err.message || 'Failed to load users'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <PageContainer>
      <PageHeader title="User Logs" subtitle="Activity history for every user — logins, password changes, clock in/out, and job responses" />

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mt-4">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-400 mt-4">Loading users…</p>
      ) : profiles.length === 0 ? (
        <EmptyState title="No users found" description="There are no users to show logs for yet." />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mt-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-100 bg-gray-50">
                <th className="text-left px-5 py-3">Name</th>
                <th className="text-left px-5 py-3">Role</th>
                <th className="text-left px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {profiles.map(p => (
                <tr
                  key={p.id}
                  onClick={() => navigate(`/users/logs/${p.id}`)}
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
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${p.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {p.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PageContainer>
  )
}
