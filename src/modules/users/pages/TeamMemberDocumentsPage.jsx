import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useCurrentUser } from '../../../hooks/useCurrentUser'
import { fetchTeamMember } from '../services/teamMembersService'
import DocumentsWorkspace, { DocumentsShell } from '../../documents/components/DocumentsWorkspace'

// A team member's documents (ID, licence, contract …). They have no login, so
// this is admin-only: nobody but an admin can see or change anything here.
export default function TeamMemberDocumentsPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile, loading: profileLoading, isAdmin } = useCurrentUser()

  const [member, setMember] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!isAdmin) return
    let cancelled = false
    fetchTeamMember(id)
      .then(m => { if (!cancelled) m ? setMember(m) : setError('Team member not found.') })
      .catch(err => { if (!cancelled) setError(err.message || 'Failed to load team member') })
    return () => { cancelled = true }
  }, [id, isAdmin])

  if (profileLoading) return <DocumentsShell><p className="text-sm text-gray-400">Loading…</p></DocumentsShell>
  if (!profile || !isAdmin) {
    return <DocumentsShell><p className="text-sm text-gray-600">Only admins can open team members' documents.</p></DocumentsShell>
  }
  if (error) return <DocumentsShell><p className="text-sm text-red-500">{error}</p></DocumentsShell>
  if (!member) return <DocumentsShell><p className="text-sm text-gray-400">Loading…</p></DocumentsShell>

  return (
    <DocumentsWorkspace
      title={`${member.full_name}'s Documents`}
      subtitle={`ID, licence, contract, photos and videos for ${member.full_name}. Only admins can see these.`}
      onBack={() => navigate(`/users/team/${id}`)}
      ownerKind="team_member"
      ownerId={member.id}
      canManage
      rootLabel="Documents"
    />
  )
}
