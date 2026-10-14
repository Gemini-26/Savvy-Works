import { useCurrentUser } from '../../../hooks/useCurrentUser'
import DocumentsWorkspace, { DocumentsShell } from '../components/DocumentsWorkspace'

// Digital Documents (File Manager): the company's own files — insurance,
// licences and registrations, tax papers, policies, contracts. Admin-only, like
// everything else that isn't about the person looking at it.
export default function CompanyDocumentsPage() {
  const { profile, loading, isAdmin } = useCurrentUser()

  if (loading) return <DocumentsShell><p className="text-sm text-gray-400">Loading…</p></DocumentsShell>
  if (!profile || !isAdmin) {
    return <DocumentsShell><p className="text-sm text-gray-600">Only admins can open the company's digital documents.</p></DocumentsShell>
  }

  return (
    <DocumentsWorkspace
      title="Digital Documents"
      subtitle={`${profile.companies?.name || 'Company'} documents: insurance, licences, tax papers, policies and contracts. Only admins can see these.`}
      ownerKind="company"
      ownerId={null}
      canManage
      rootLabel="Company Documents"
    />
  )
}
