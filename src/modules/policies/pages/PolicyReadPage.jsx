import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, ChevronsDown, PenLine } from 'lucide-react'
import { DocumentsShell } from '../../documents/components/DocumentsWorkspace'
import PolicyContent from '../components/PolicyContent'
import SignaturePad from '../../../shared/components/SignaturePad'
import { fetchPolicy, fetchMySignature, fetchMyPolicies, signPolicy, SIGN_STATEMENT } from '../services/policyService'
import { appliesTo } from '../policyStats'
import { effectiveFields, startingAnswers, isTyped, isRequired } from '../policyBlanks'
import { formatDateTime } from '../../../shared/utils/formatDate'

// Read a policy, fill in its blank lines (name, ID number…), tick "I understand
// and agree", draw a signature, done.
// The tick stays locked until the reader has scrolled to the end of the
// document, so "I have read" means something.
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
  const [reachedEnd, setReachedEnd] = useState(false)
  const [agreed, setAgreed] = useState(false)
  const [drawn, setDrawn] = useState(null)
  const [saving, setSaving] = useState(false)
  const [signError, setSignError] = useState(null)
  const [answers, setAnswers] = useState({})     // what has been typed into the document's blank lines: { n: text }
  const endRef = useRef(null)
  const articleRef = useRef(null)

  // The blank lines people type into, and what they start as (date lines: today).
  const fields = useMemo(() => (doc ? effectiveFields(doc.content_html, doc.fill_fields) : []), [doc])
  const startValues = useMemo(() => startingAnswers(fields), [fields])
  // A signed copy shows what that person typed, as fixed text.
  const signedValues = useMemo(() => {
    const saved = signature?.field_answers
    return Array.isArray(saved) ? Object.fromEntries(saved.map(a => [a.n, a.value])) : null
  }, [signature])
  const onAnswer = useCallback((n, value) => setAnswers(prev => ({ ...prev, [n]: value })), [])

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

  const mustSign = doc && !signature && doc.status === 'active' && appliesTo(doc, profile.role)

  // Typed lines that still need an answer before this can be signed.
  const typedFields = mustSign ? fields.filter(isTyped) : []
  const answerOf = f => (answers[f.n] ?? startValues[f.n] ?? '').trim()
  const missing = typedFields.filter(f => isRequired(f) && !answerOf(f))

  function goToEmptyLine() {
    const box = missing[0] && articleRef.current?.querySelector(`input[data-blank="${missing[0].n}"]`)
    box?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    box?.focus({ preventScroll: true })
  }

  // Unlock the tick once the end of the document has been on screen.
  useEffect(() => {
    if (!mustSign || reachedEnd || !endRef.current) return
    const obs = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) setReachedEnd(true)
    })
    obs.observe(endRef.current)
    return () => obs.disconnect()
  }, [mustSign, reachedEnd, doc?.id])

  async function handleSign() {
    setSaving(true)
    setSignError(null)
    try {
      const typed = typedFields
        .map(f => ({ n: f.n, label: f.label, value: answerOf(f) }))
        .filter(a => a.value)
      await signPolicy(doc.id, drawn, typed)
      setSignature(await fetchMySignature(doc.id, profile.id))
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      setSignError(err.message || 'Could not save your signature. Please try again.')
    } finally {
      setSaving(false)
    }
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

      <article ref={articleRef} className="max-w-3xl bg-white rounded-xl border border-gray-200 p-5 sm:p-8">
        {mustSign ? (
          <PolicyContent html={doc.content_html} fields={fields} values={startValues} onValueChange={onAnswer} />
        ) : signedValues ? (
          <PolicyContent html={doc.content_html} fields={fields} values={signedValues} readOnly />
        ) : (
          <PolicyContent html={doc.content_html} />
        )}
        <div ref={endRef} aria-hidden="true" className="h-px" />
      </article>

      {mustSign && (
        <section className="max-w-3xl bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h2 className="text-sm font-bold text-gray-900">Sign this document</h2>

          {typedFields.length > 0 && (
            <div className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm ${
              missing.length ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-green-200 bg-green-50 text-green-800'
            }`}>
              <span className="flex items-center gap-2">
                {missing.length ? <PenLine size={15} /> : <CheckCircle2 size={15} />}
                {missing.length
                  ? `Fill in the blank lines in the document first — ${missing.length} still empty.`
                  : 'All the blank lines are filled in.'}
              </span>
              {missing.length > 0 && (
                <button type="button" onClick={goToEmptyLine} className="text-xs font-semibold underline">Take me to the next one</button>
              )}
            </div>
          )}

          <label className={`flex items-start gap-3 rounded-lg border p-3 ${reachedEnd ? 'border-gray-300 cursor-pointer' : 'border-gray-200 bg-gray-50 cursor-not-allowed'}`}>
            <input
              type="checkbox" checked={agreed} disabled={!reachedEnd}
              onChange={e => { setAgreed(e.target.checked); if (!e.target.checked) setDrawn(null) }}
              className="mt-0.5 h-5 w-5 shrink-0"
            />
            <span>
              <span className="block text-sm font-semibold text-gray-900">I understand and agree</span>
              <span className="block text-xs text-gray-500">{SIGN_STATEMENT}</span>
            </span>
          </label>

          {!reachedEnd && (
            <p className="flex items-center gap-1.5 text-xs text-amber-700">
              <ChevronsDown size={14} /> Scroll to the end of the document above to unlock this.
            </p>
          )}

          {agreed && (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">Signing as <span className="font-semibold text-gray-900">{profile.full_name}</span>. Draw your signature below.</p>
              <SignaturePad onChange={setDrawn} />
              {signError && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">{signError}</div>}
              <button
                type="button" disabled={!drawn || saving || missing.length > 0} onClick={handleSign}
                className="w-full sm:w-auto bg-green-600 text-white text-sm font-semibold px-6 py-3 rounded-lg disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Sign document'}
              </button>
              {missing.length > 0 && <p className="text-xs text-amber-700">Signing unlocks once every blank line is filled in.</p>}
              <p className="text-[11px] text-gray-400">
                Your name, the date and time, {typedFields.length > 0 ? 'what you typed on the blank lines, ' : ''}and a fingerprint of this exact wording are saved with your signature.
              </p>
            </div>
          )}
        </section>
      )}
    </DocumentsShell>
  )
}
