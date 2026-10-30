import { supabase } from '../../../lib/supabase'
import { notifyUser } from '../../../shared/services/notificationService'
import { cleanHtml } from '../sanitizeHtml'
import { appliesTo, progressFor } from '../policyStats'

// What people are told they agree to; the database stores the same sentence
// with the signature (see sign_policy_document).
export const SIGN_STATEMENT = 'I have read and understood this document and I agree to follow it.'

// Everything except the (large) body, for lists and counts.
const LIST_COLS = 'id, title, description, audience, version, status, replaces_id, source_file_name, content_hash, created_at'

// Images inside a Word file become inline data, so a document with big photos
// can get huge. Refuse rather than make every page load slow.
const MAX_HTML_CHARS = 4_000_000

// ── Reading ──────────────────────────────────────────────────────────────────

// The documents a person has been asked to sign, each with their signature (or
// null). Row level security already limits this to documents aimed at them.
export async function fetchMyPolicies(profile) {
  const [docsRes, sigsRes] = await Promise.all([
    supabase.from('policy_documents').select(LIST_COLS).eq('status', 'active').order('created_at', { ascending: false }),
    supabase.from('policy_signatures').select('id, document_id, signed_at').eq('profile_id', profile.id),
  ])
  if (docsRes.error) throw docsRes.error
  if (sigsRes.error) throw sigsRes.error

  const sigByDoc = new Map((sigsRes.data || []).map(s => [s.document_id, s]))
  const items = (docsRes.data || [])
    .filter(d => appliesTo(d, profile.role))
    .map(doc => ({ doc, signature: sigByDoc.get(doc.id) || null }))
  const signed = items.filter(i => i.signature).length
  return { items, signed, total: items.length, outstanding: items.length - signed }
}

export async function fetchPolicy(id) {
  const { data, error } = await supabase.from('policy_documents').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  if (!data) throw new Error('Document not found.')
  return data
}

export async function fetchMySignature(documentId, profileId) {
  const { data, error } = await supabase
    .from('policy_signatures')
    .select('id, signed_at, signature_image, signer_name, content_hash, document_version, statement, field_answers')
    .eq('document_id', documentId)
    .eq('profile_id', profileId)
    .maybeSingle()
  if (error) throw error
  return data
}

// ── Signing ──────────────────────────────────────────────────────────────────

// `answers` are the typed-in fill-in lines: [{ n, label, value }].
export async function signPolicy(documentId, signatureDataUrl, answers = null) {
  const { data, error } = await supabase.rpc('sign_policy_document', {
    p_document_id: documentId,
    p_signature: signatureDataUrl,
    p_agreed: true,
    p_user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    p_answers: answers?.length ? answers : null,
  })
  if (error) throw error
  notifyPoliciesChanged()
  return data
}

// The banner and counts elsewhere in the app listen for this and re-count.
export const POLICIES_CHANGED = 'policies-changed'
export function notifyPoliciesChanged() {
  window.dispatchEvent(new Event(POLICIES_CHANGED))
}

// ── Admin: overview ──────────────────────────────────────────────────────────

// Everything the admin screens need to count: every document, every signature
// (without the image — those are fetched one at a time) and every active person.
export async function fetchPolicyOverviewData() {
  const [docsRes, sigsRes, peopleRes] = await Promise.all([
    supabase.from('policy_documents').select(LIST_COLS).order('created_at', { ascending: false }),
    supabase.from('policy_signatures').select('id, document_id, profile_id, signer_name, signed_at, document_version'),
    supabase.from('profiles').select('id, full_name, role, email').eq('is_active', true).order('full_name'),
  ])
  if (docsRes.error) throw docsRes.error
  if (sigsRes.error) throw sigsRes.error
  if (peopleRes.error) throw peopleRes.error
  return { docs: docsRes.data || [], signatures: sigsRes.data || [], people: peopleRes.data || [] }
}

export async function fetchSignatureImage(signatureId) {
  const { data, error } = await supabase
    .from('policy_signatures')
    .select('id, signer_name, signature_image, signed_at, document_title, document_version, content_hash, statement, ip_address, field_answers')
    .eq('id', signatureId)
    .maybeSingle()
  if (error) throw error
  return data
}

// ── Admin: publishing ────────────────────────────────────────────────────────

// Word (.docx) → clean HTML, in the browser. mammoth is large, so it is only
// loaded when an admin actually picks a file.
export async function docxToHtml(file) {
  if (!/\.docx$/i.test(file.name)) {
    throw new Error('Choose a Word document saved as .docx. (Older .doc files: open in Word and Save As .docx first.)')
  }
  const { default: mammoth } = await import('mammoth/mammoth.browser')
  const arrayBuffer = await file.arrayBuffer()
  let result
  try {
    result = await mammoth.convertToHtml({ arrayBuffer }, {
      styleMap: [
        "p[style-name='Title'] => h1:fresh",
        "p[style-name='Subtitle'] => h2:fresh",
      ],
    })
  } catch {
    throw new Error('That file could not be read as a Word document.')
  }
  const html = cleanHtml(result.value)
  if (!html.replace(/<[^>]*>/g, '').trim() && !/<img/i.test(html)) {
    throw new Error('That document has no readable text in it.')
  }
  if (html.length > MAX_HTML_CHARS) {
    throw new Error('That document is too large (usually big pictures). Shrink the pictures in Word and try again.')
  }
  // mammoth also reports anything it could not carry over (text boxes, odd
  // styles…). Unknown *styles* only lose their look, which the preview shows
  // anyway, so only the rest is worth interrupting an admin for.
  const warnings = [...new Set((result.messages || [])
    .filter(m => !/^Unrecognised (paragraph|run|table) style/i.test(m.message))
    .map(m => m.message))]
  return { html, warnings }
}

// "Health_and-Safety policy.docx" -> "Health and Safety policy"
export const titleFromFileName = name => name.replace(/\.docx$/i, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()

// Publishes a new document, or a new version of an existing one (everyone has
// to sign it again), then tells the people it applies to. `quiet` skips the
// notification and the refresh event, for batches that send one combined
// notification per person at the end (see publishPolicies). `fillFields` is
// which of the document's blank lines people type into (see persistableFields
// in policyBlanks); left out, the app's own guess is used.
export async function publishPolicy({ title, description, audience, html, fileName, replaces = null, fillFields = null, quiet = false }) {
  const { data: id, error } = await supabase.rpc('publish_policy_document', {
    p_title: title,
    p_description: description || null,
    p_audience: audience,
    p_content_html: cleanHtml(html),
    p_source_file_name: fileName || null,
    p_replaces: replaces,
  })
  if (error) throw error
  if (fillFields) {
    // The document is already published by now, so a failure here must not look
    // like a failed publish (a retry would publish it twice) — it just keeps the
    // app's default guess at which lines to fill in.
    await supabase.from('policy_documents').update({ fill_fields: fillFields }).eq('id', id)
  }
  if (quiet) return id

  await notifyAudience({ id, title, audience }, replaces
    ? `A new version of "${title}" needs your signature.`
    : `"${title}" needs your signature.`).catch(() => {})
  notifyPoliciesChanged()
  return id
}

// Publishes several new documents one after another. One failing document does
// not stop the rest: `onResult(key, { id } | { error })` reports each as it
// finishes. Afterwards every person gets ONE notification covering whatever
// applies to them (a single document links straight to it), not one per file.
// Resolves to the list of documents that did publish.
export async function publishPolicies(items, onResult) {
  const published = []
  for (const item of items) {
    try {
      const id = await publishPolicy({ ...item, quiet: true })
      published.push({ id, title: item.title, audience: item.audience })
      onResult?.(item.key, { id })
    } catch (err) {
      onResult?.(item.key, { error: err.message || 'Could not publish this document.' })
    }
  }
  if (published.length) {
    await notifyBatch(published).catch(() => {})
    notifyPoliciesChanged()
  }
  return published
}

// `fillFields` left undefined leaves the document's fill-in lines alone; the
// database refuses to change them once anyone has signed.
export async function updatePolicyDetails(id, { title, description, audience, fillFields }) {
  const changes = { title: title.trim(), description: description?.trim() || null, audience }
  if (fillFields !== undefined) changes.fill_fields = fillFields
  const { error } = await supabase
    .from('policy_documents')
    .update(changes)
    .eq('id', id)
  if (error) throw error
  notifyPoliciesChanged()
}

export async function setPolicyStatus(id, status) {
  const { error } = await supabase.from('policy_documents').update({ status }).eq('id', id)
  if (error) throw error
  notifyPoliciesChanged()
}

// A document nobody has signed yet can be removed outright; once anyone has
// signed, the database refuses (archive it instead).
export async function deletePolicy(id) {
  const { error } = await supabase.from('policy_documents').delete().eq('id', id)
  if (error) {
    if (error.code === '23503') throw new Error('Someone has already signed this document, so it can only be archived, not deleted.')
    throw error
  }
  notifyPoliciesChanged()
}

// ── Admin: reminders ─────────────────────────────────────────────────────────

async function activePeople() {
  const { data, error } = await supabase.from('profiles').select('id, role').eq('is_active', true)
  if (error) throw error
  return data || []
}

async function notifyAudience(doc, body) {
  const people = (await activePeople()).filter(p => appliesTo(doc, p.role))
  if (!people.length) return
  const rows = people.map(p => ({ user_id: p.id, title: 'Document to sign', body, link: `/profile/policies/${doc.id}` }))
  const { error } = await supabase.from('notifications').insert(rows)
  if (error) throw error
}

async function notifyBatch(docs) {
  const rows = []
  for (const person of await activePeople()) {
    const mine = docs.filter(d => appliesTo(d, person.role))
    if (!mine.length) continue
    rows.push(mine.length === 1
      ? { user_id: person.id, title: 'Document to sign', body: `"${mine[0].title}" needs your signature.`, link: `/profile/policies/${mine[0].id}` }
      : { user_id: person.id, title: 'Documents to sign', body: `${mine.length} documents need your signature.`, link: '/profile/policies' })
  }
  if (!rows.length) return
  const { error } = await supabase.from('notifications').insert(rows)
  if (error) throw error
}

// Nudge the given people about the documents they still have to sign. One
// notification each, however many they owe.
export async function remindPeople(people, docs, signatures) {
  let sent = 0
  for (const person of people) {
    const { outstanding } = progressFor(person, docs, signatures)
    if (!outstanding.length) continue
    const link = outstanding.length === 1 ? `/profile/policies/${outstanding[0].id}` : '/profile/policies'
    const body = outstanding.length === 1
      ? `Please read and sign "${outstanding[0].title}".`
      : `You have ${outstanding.length} documents waiting for your signature.`
    await notifyUser(person.id, { title: 'Reminder: document to sign', body, link })
    sent += 1
  }
  return sent
}
