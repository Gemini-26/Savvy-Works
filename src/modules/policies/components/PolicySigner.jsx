import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, ChevronsDown, PenLine } from 'lucide-react'
import PolicyContent from './PolicyContent'
import SignaturePad from '../../../shared/components/SignaturePad'
import { SIGN_STATEMENT } from '../services/policyService'
import { effectiveFields, startingAnswers, isTyped, isRequired } from '../policyBlanks'

// The document and the signing box under it: read it, fill in its blank lines
// (name, ID number…), tick "I understand and agree", draw a signature.
//
// Shared by every way of signing — a logged-in person signing for themselves, an
// admin or technician handing a phone to a team member, and a team member opening
// a signing link — so they all behave exactly the same.
//
// The tick stays locked until the reader has scrolled to the end of the
// document, so "I have read" means something.
//
// `canSign`  false → the document is only shown (already signed, withdrawn…).
// `signature` the saved signature, if there is one, so its typed answers are shown.
// `onSign(drawnImage, typedAnswers)` saves it. It must throw to report a failure;
//            whatever it throws is shown under the button.
// `recordNote` an extra sentence for the small print (who is recording it).
// The person reading is always the person signing — including a team member
// holding someone else's phone — so the wording speaks to "you".
// Key this component by the document id so moving to another document starts clean.
export default function PolicySigner({ doc, signature = null, canSign, signerName, onSign, recordNote = null }) {
  const [reachedEnd, setReachedEnd] = useState(false)
  const [agreed, setAgreed] = useState(false)
  const [drawn, setDrawn] = useState(null)
  const [saving, setSaving] = useState(false)
  const [signError, setSignError] = useState(null)
  const [answers, setAnswers] = useState({})     // what has been typed into the document's blank lines: { n: text }
  const endRef = useRef(null)
  const articleRef = useRef(null)

  // The blank lines people type into, and what they start as (date lines: today).
  const fields = useMemo(() => effectiveFields(doc.content_html, doc.fill_fields), [doc])
  const startValues = useMemo(() => startingAnswers(fields), [fields])
  // A signed copy shows what was typed, as fixed text.
  const signedValues = useMemo(() => {
    const saved = signature?.field_answers
    return Array.isArray(saved) ? Object.fromEntries(saved.map(a => [a.n, a.value])) : null
  }, [signature])
  const onAnswer = useCallback((n, value) => setAnswers(prev => ({ ...prev, [n]: value })), [])

  // Typed lines that still need an answer before this can be signed.
  const typedFields = canSign ? fields.filter(isTyped) : []
  const answerOf = f => (answers[f.n] ?? startValues[f.n] ?? '').trim()
  const missing = typedFields.filter(f => isRequired(f) && !answerOf(f))

  function goToEmptyLine() {
    const box = missing[0] && articleRef.current?.querySelector(`input[data-blank="${missing[0].n}"]`)
    box?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    box?.focus({ preventScroll: true })
  }

  // Unlock the tick once the end of the document has been on screen.
  useEffect(() => {
    if (!canSign || reachedEnd || !endRef.current) return
    const obs = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) setReachedEnd(true)
    })
    obs.observe(endRef.current)
    return () => obs.disconnect()
  }, [canSign, reachedEnd, doc.id])

  async function handleSign() {
    setSaving(true)
    setSignError(null)
    try {
      const typed = typedFields
        .map(f => ({ n: f.n, label: f.label, value: answerOf(f) }))
        .filter(a => a.value)
      await onSign(drawn, typed)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      setSignError(err.message || 'Could not save the signature. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <article ref={articleRef} className="max-w-3xl bg-white rounded-xl border border-gray-200 p-5 sm:p-8">
        {canSign ? (
          <PolicyContent html={doc.content_html} fields={fields} values={startValues} onValueChange={onAnswer} />
        ) : signedValues ? (
          <PolicyContent html={doc.content_html} fields={fields} values={signedValues} readOnly />
        ) : (
          <PolicyContent html={doc.content_html} />
        )}
        <div ref={endRef} aria-hidden="true" className="h-px" />
      </article>

      {canSign && (
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
              <p className="text-sm text-gray-600">Signing as <span className="font-semibold text-gray-900">{signerName}</span>. Draw your signature below.</p>
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
                {recordNote ? ` ${recordNote}` : ''}
              </p>
            </div>
          )}
        </section>
      )}
    </>
  )
}
