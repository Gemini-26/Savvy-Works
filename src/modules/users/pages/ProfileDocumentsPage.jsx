import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useCurrentUser } from '../../../hooks/useCurrentUser'
import { fetchProfile } from '../services/profileService'
import DocumentsWorkspace, { DocumentsShell } from '../../documents/components/DocumentsWorkspace'

// "My Documents" for one person. Reached two ways:
//   /users/:id/documents   an admin looking at someone's documents
//   /profile/documents     the signed-in person looking at their own
// Admins can upload, rename, move and delete; the person themself can only
// look and download. The database enforces that, this page just reflects it.
export default function ProfileDocumentsPage({ profile: profileProp }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const current = useCurrentUser()
  const me = profileProp ?? current.profile
  const isAdmin = me?.role === 'admin'

  const [other, setOther] = useState(null)
  const [otherError, setOtherError] = useState(null)

  const isSelf = !id || id === me?.id

  useEffect(() => {
    if (isSelf || !isAdmin) return
    let cancelled = false
    fetchProfile(id)
      .then(p => { if (!cancelled) setOther(p) })
      .catch(err => { if (!cancelled) setOtherError(err.message || 'Failed to load profile') })
    return () => { cancelled = true }
  }, [id, isSelf, isAdmin])

  const compact = me?.role === 'technician'

  if (!me && current.loading) return <DocumentsShell compact={compact}><p className="text-sm text-gray-400">Loading…</p></DocumentsShell>
  if (!me) return <DocumentsShell compact={compact}><p className="text-sm text-red-500">Couldn't load your account.</p></DocumentsShell>

  if (!isSelf && !isAdmin) {
    return (
      <DocumentsShell compact={compact}>
        <p className="text-sm text-gray-600">Only admins can open another person's documents.</p>
        <button type="button" onClick={() => navigate(-1)} className="text-sm font-semibold text-blue-600">← Back</button>
      </DocumentsShell>
    )
  }
  if (!isSelf && otherError) return <DocumentsShell compact={compact}><p className="text-sm text-red-500">{otherError}</p></DocumentsShell>
  if (!isSelf && !other) return <DocumentsShell compact={compact}><p className="text-sm text-gray-400">Loading…</p></DocumentsShell>

  const owner = isSelf ? me : other
  return (
    <DocumentsWorkspace
      compact={compact}
      title={isSelf ? 'My Documents' : `${owner.full_name}'s Documents`}
      subtitle={
        isSelf
          ? (isAdmin ? 'Your ID, licence, photos and videos. Only admins can see these.' : 'Your ID, licence, photos and videos. Only you and the admins can see these.')
          : `Only admins and ${owner.full_name} can see these.`
      }
      onBack={() => navigate(isSelf ? '/profile' : `/users/${id}`)}
      ownerKind="profile"
      ownerId={owner.id}
      canManage={isAdmin}
    />
  )
}
