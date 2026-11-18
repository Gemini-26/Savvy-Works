import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle2 } from 'lucide-react'
import { DocumentsShell } from '../../documents/components/DocumentsWorkspace'
import PolicySigner from '../components/PolicySigner'
import { fetchPolicy, fetchMySignature, fetchMyPolicies, signPolicy } from '../services/policyService'
import { appliesTo } from '../policyStats'
import { formatDateTime } from '../../../shared/utils/formatDate'

// Read a policy, fill in its blank lines (name, ID number…), tick "I understand
// and agree", draw a signature, done. The reading and signing itself is
// PolicySigner, shared with the pages where a team member signs.
export default function PolicyReadPage({ profile }) {
  const { id } = useParams()
  // Keyed by id so moving to the next document starts from a clean slate.
  return <PolicyReader key={id} id={id} profile={profile} />
}

function PolicyReader({ id, profile }) {
  const navigate = useNavigate()
  const compact = profile?.role === 'technician'

  const [doc, setDoc] = useState(null)
  const [signature, setSignature] = useState(null)
  const [next, setNext] = useState(null)        // the next document still waiting for this person
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!profile?.id) return
    let cancelled = false
    ;(async () => {
      try {
        const [d, sig, mine] = await Promise.all([
          fetchPolicy(id),
          fetchMySignature(id, profile.id),
          fetchMyPolicies(profile),
        ])
        if (cancelled) return
        setDoc(d)
        setSignature(sig)
        setNext(mine.items.find(i => !i.signature && i.doc.id !== id)?.doc ?? null)
      } catch (err) {
        if (!cancelled) setError(err.message || 'Could not open this document')
      }
    })()
    return () => { cancelled = true }
  }, [id, profile])

  const mustSign = !!doc && !signature && doc.status === 'active' && appliesTo(doc, profile)

  async function handleSign(drawn, typed) {
    await signPolicy(doc.id, drawn, typed)
    setSignature(await fetchMySignature(doc.id, profile.id))
  }

  const back = (
    <Link to="/profile/policies" className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600">
      <ArrowLeft size={14} /> All documents
    </Link>
  )

  if (error) return <DocumentsShell compact={compact}>{back}<p className="text-sm text-red-600">{error}</p></DocumentsShell>
  if (!doc) return <DocumentsShell compact={compact}>{back}<p className="text-sm text-gray-400">Loading…</p></DocumentsShell>

  return (
    <DocumentsShell compact={compact}>
      <div className="space-y-2 max-w-3xl">
        {back}
        <h1 className={`${compact ? 'text-lg' : 'text-2xl'} font-bold text-gray-900 break-words`}>{doc.title}</h1>
        <p className="text-xs text-gray-500">Version {doc.version} · published {formatDateTime(doc.created_at)}</p>
        {doc.description && <p className="text-sm text-gray-600">{doc.description}</p>}
      </div>

      {signature && (
        <div className="max-w-3xl bg-green-50 border border-green-200 rounded-xl p-4 space-y-3">
          <p className="flex items-center gap-2 text-sm font-bold text-green-800">
            <CheckCircle2 size={18} /> You signed this document
          </p>
          <p className="text-xs text-green-800">
            {signature.signer_name} · {formatDateTime(signature.signed_at)} · version {signature.document_version}
          </p>
          <img src={signature.signature_image} alt="Your signature" className="h-20 bg-white border border-green-200 rounded-lg p-1" />
          <p className="text-[11px] text-green-700 break-all">Document fingerprint: {signature.content_hash}</p>
          <div className="flex flex-wrap gap-2 pt-1">
            {next ? (
              <button type="button" onClick={() => navigate(`/profile/policies/${next.id}`)}
                className="bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-lg">
                Next document to sign →
              </button>
            ) : (
              <Link to="/profile/policies" className="bg-white border border-green-300 text-green-800 text-sm font-semibold px-4 py-2 rounded-lg">
                Back to my documents
              </Link>
            )}
          </div>
        </div>
      )}

      {!signature && doc.status !== 'active' && (
        <div className="max-w-3xl bg-amber-50 border border-amber-200 text-amber-900 text-sm rounded-xl p-4">
          This document is no longer open for signing{doc.status === 'superseded' ? ' — a newer version has replaced it' : ''}.
          {' '}<Link to="/profile/policies" className="font-semibold underline">See the documents waiting for you</Link>.
        </div>
      )}

      <PolicySigner
        key={doc.id}
        doc={doc}
        signature={signature}
        canSign={mustSign}
        signerName={profile.full_name}
        onSign={handleSign}
      />
    </DocumentsShell>
  )
}
