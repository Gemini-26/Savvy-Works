import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, Smartphone } from 'lucide-react'
import { DocumentsShell } from '../../documents/components/DocumentsWorkspace'
import PolicySigner from '../components/PolicySigner'
import { fetchPolicy, fetchTeamSigningQueue, signForTeamMember } from '../services/policyService'
import { fetchTeamMember } from '../../users/services/teamMembersService'
import { formatDateTime } from '../../../shared/utils/formatDate'

// An admin or technician records a team member's signature on their own phone.
// Team members have no login, so: hand the phone over, the team member reads the
// document and signs with a finger, and the signature is saved under their name
// with a note of who handed the phone over.
export default function PolicySignForTeamMemberPage({ profile }) {
  const { id, memberId } = useParams()
  // Keyed so moving on to the next document starts from a clean slate.
  return <Recorder key={`${id}/${memberId}`} id={id} memberId={memberId} profile={profile} />
}

function Recorder({ id, memberId, profile }) {
  const navigate = useNavigate()
  const { state } = useLocation()
  const compact = profile?.role === 'technician'

  const [doc, setDoc] = useState(null)
  const [member, setMember] = useState(null)
  const [signedAt, setSignedAt] = useState(null)      // when this team member signed this document, if they have
  const [assigned, setAssigned] = useState(true)      // is this document actually waiting on this team member?
  const [nextDoc, setNextDoc] = useState(null)        // another document this team member still has to sign
  const [stage, setStage] = useState(state?.handedOver ? 'sign' : 'handover')   // handover → sign → done
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [d, m, queue] = await Promise.all([fetchPolicy(id), fetchTeamMember(memberId), fetchTeamSigningQueue()])
        if (cancelled) return
        if (!m) throw new Error('Team member not found.')
        const row = queue.rows.find(r => r.document_id === id && r.team_member_id === memberId)
        setDoc(d)
        setMember(m)
        setAssigned(!!row)
        setSignedAt(row?.signed_at ?? null)
        setNextDoc(queue.pending.find(p => p.member.id === memberId)?.docs.find(x => x.id !== id) ?? null)
      } catch (err) {
        if (!cancelled) setError(err.message || 'Could not open this document')
      }
    })()
    return () => { cancelled = true }
  }, [id, memberId])

  async function handleSign(drawn, typed) {
    await signForTeamMember(id, memberId, drawn, typed)
    // Whatever is still waiting for them, so "next document" is right.
    const queue = await fetchTeamSigningQueue().catch(() => null)
    setNextDoc(queue?.pending.find(p => p.member.id === memberId)?.docs.find(x => x.id !== id) ?? null)
    setSignedAt(new Date().toISOString())
    setStage('done')
  }

  const back = (
    <Link to="/profile/policies" className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600">
      <ArrowLeft size={14} /> All documents
    </Link>
  )

  if (error) return <DocumentsShell compact={compact}>{back}<p className="text-sm text-red-600">{error}</p></DocumentsShell>
  if (!doc || !member) return <DocumentsShell compact={compact}>{back}<p className="text-sm text-gray-400">Loading…</p></DocumentsShell>

  const open = doc.status === 'active' && assigned && !signedAt
  const goNext = () => navigate(`/profile/policies/${nextDoc.id}/for/${memberId}`, { state: { handedOver: true } })

  return (
    <DocumentsShell compact={compact}>
      <div className="space-y-2 max-w-3xl">
        {back}
        <h1 className={`${compact ? 'text-lg' : 'text-2xl'} font-bold text-gray-900 break-words`}>{doc.title}</h1>
        <p className="text-xs text-gray-500">Version {doc.version} · published {formatDateTime(doc.created_at)}</p>
        {doc.description && <p className="text-sm text-gray-600">{doc.description}</p>}
      </div>

      {stage === 'done' && (
        <div className="max-w-3xl bg-green-50 border border-green-200 rounded-xl p-4 space-y-3">
          <p className="flex items-center gap-2 text-sm font-bold text-green-800">
            <CheckCircle2 size={18} /> {member.full_name} has signed this document
          </p>
          <p className="text-xs text-green-800">Saved {formatDateTime(signedAt)} · recorded by {profile.full_name}. You can take your phone back.</p>
          <div className="flex flex-wrap gap-2 pt-1">
            {nextDoc && (
              <button type="button" onClick={goNext} className="bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-lg">
                Next document for {member.full_name} →
              </button>
            )}
            <Link to="/profile/policies" className="bg-white border border-green-300 text-green-800 text-sm font-semibold px-4 py-2 rounded-lg">
              Back to the documents
            </Link>
          </div>
        </div>
      )}

      {stage !== 'done' && signedAt && (
        <div className="max-w-3xl bg-green-50 border border-green-200 text-green-800 text-sm rounded-xl p-4">
          {member.full_name} already signed this document on {formatDateTime(signedAt)}.
        </div>
      )}

      {stage !== 'done' && !signedAt && !assigned && (
        <div className="max-w-3xl bg-amber-50 border border-amber-200 text-amber-900 text-sm rounded-xl p-4">
          This document isn't waiting for {member.full_name}{doc.status !== 'active' ? ' — it is no longer open for signing' : ''}.
        </div>
      )}

      {stage === 'handover' && open && (
        <div className="max-w-3xl bg-white border border-blue-200 rounded-xl p-5 space-y-3">
          <p className="flex items-center gap-2 text-sm font-bold text-gray-900"><Smartphone size={18} className="text-blue-600" /> Sign on behalf of a team member</p>
          <p className="text-sm text-gray-700">
            This is <span className="font-semibold">{member.full_name}</span>'s signature. Hand them this phone: they read the document, tick “I understand and agree” and sign with their finger.
            It is saved under their name and shows you ({profile.full_name}) as the person who recorded it.
          </p>
          <button type="button" onClick={() => setStage('sign')} className="bg-blue-600 text-white text-sm font-semibold px-5 py-2.5 rounded-lg">
            Hand over the phone — start
          </button>
        </div>
      )}

      {/* Once it is signed the banner above says so; the document with its
          blank lines would only look as if the answers were lost. */}
      {stage !== 'done' && (stage === 'sign' || signedAt || !assigned) && (
        <PolicySigner
          doc={doc}
          canSign={stage === 'sign' && open}
          signerName={member.full_name}
          onSign={handleSign}
          recordNote={`Recorded in person by ${profile.full_name}.`}
        />
      )}
    </DocumentsShell>
  )
}
