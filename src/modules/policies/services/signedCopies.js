import { zipSync } from 'fflate'
import { supabase } from '../../../lib/supabase'
import { loadBrandingImages } from '../../finance/utils/pdfHeader'
import { preparePolicy, buildSignedPolicyPdf, safeFileName } from '../utils/signedPolicyPdf'
import { fetchPolicy } from './policyService'

// Signed copies as PDFs, for admins: one person's, or a whole batch in a ZIP.
// The PDFs are made in the browser from the signature on record (name, time, the
// drawn signature, what was typed on the blank lines) and the document's frozen
// wording — nothing is stored, so there is nothing to get out of step.

const SIGNATURE_COLS = 'id, document_id, profile_id, signer_name, signer_role, signature_image, statement, document_title, document_version, content_hash, signed_at, ip_address, field_answers'

// Keep a few prepared documents around so "View PDF" twice, or a batch that
// touches the same document again, doesn't re-read its pictures.
const prepared = new Map()   // document id -> Promise<{ doc, prep }>
const KEEP = 3

function loadDocument(documentId) {
  if (prepared.has(documentId)) {
    const hit = prepared.get(documentId)
    prepared.delete(documentId)
    prepared.set(documentId, hit)   // most recently used goes last
    return hit
  }
  const promise = fetchPolicy(documentId).then(async doc => ({ doc, prep: await preparePolicy(doc) }))
  promise.catch(() => prepared.delete(documentId))
  prepared.set(documentId, promise)
  while (prepared.size > KEEP) prepared.delete(prepared.keys().next().value)
  return promise
}

async function brand() {
  try { return await loadBrandingImages() } catch { return null }
}

async function fetchSignatures(ids) {
  const found = new Map()
  for (let i = 0; i < ids.length; i += 15) {
    const { data, error } = await supabase.from('policy_signatures').select(SIGNATURE_COLS).in('id', ids.slice(i, i + 15))
    if (error) throw error
    for (const row of data || []) found.set(row.id, row)
  }
  return found
}

export const signedPdfName = signature => safeFileName(
  `${signature.document_title} (v${signature.document_version}) - ${signature.signer_name}`,
  'signed-policy',
) + '.pdf'

// ── One person's copy ────────────────────────────────────────────────────────

// → { pdf, fileName } for one signature.
export async function createSignedPdf(signatureId) {
  const sigs = await fetchSignatures([signatureId])
  const signature = sigs.get(signatureId)
  if (!signature) throw new Error('That signature could not be found.')
  const [{ doc, prep }, branding] = await Promise.all([loadDocument(signature.document_id), brand()])
  const pdf = buildSignedPolicyPdf({ doc, prepared: prep, signature, branding })
  return { pdf, fileName: signedPdfName(signature) }
}

// ── Many copies in one ZIP ───────────────────────────────────────────────────

export function saveBlob(blob, fileName) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

const nextTick = () => new Promise(resolve => setTimeout(resolve, 0))

// entries: [{ signatureId, documentId }]. grouping: how the ZIP is laid out —
//   'by-person'   one folder per person, their documents inside
//   'by-document' everything flat, named "Document - Person"
// Resolves to { blob, made, failed: [{ name, message }] }. `onProgress({ done, total, name })`
// is called as each PDF is made; `signal` (an AbortSignal) stops it between PDFs.
export async function buildSignedZip(entries, { grouping = 'by-person', onProgress, signal } = {}) {
  const total = entries.length
  const files = {}
  const used = new Set()
  const failed = []
  let done = 0

  // Windows and Mac treat "A.pdf" and "a.pdf" as the same file, so compare without case.
  const uniquePath = path => {
    if (!used.has(path.toLowerCase())) { used.add(path.toLowerCase()); return path }
    const dot = path.lastIndexOf('.')
    for (let n = 2; ; n++) {
      const candidate = `${path.slice(0, dot)} (${n})${path.slice(dot)}`
      if (!used.has(candidate.toLowerCase())) { used.add(candidate.toLowerCase()); return candidate }
    }
  }

  // One folder per PERSON: two different people who share a name get "Name" and "Name (2)".
  const folders = new Map()
  const claimed = new Set()
  const folderFor = signature => {
    const key = signature.profile_id || `name:${signature.signer_name}`
    if (!folders.has(key)) {
      const base = safeFileName(signature.signer_name, 'person')
      let name = base
      for (let n = 2; claimed.has(name.toLowerCase()); n++) name = `${base} (${n})`
      claimed.add(name.toLowerCase())
      folders.set(key, name)
    }
    return folders.get(key)
  }

  // Work through one document at a time so its pictures are only read once.
  const byDocument = new Map()
  for (const e of entries) {
    if (!byDocument.has(e.documentId)) byDocument.set(e.documentId, [])
    byDocument.get(e.documentId).push(e.signatureId)
  }
  const branding = await brand()

  for (const [documentId, signatureIds] of byDocument) {
    if (signal?.aborted) break
    let loaded
    let signatures
    try {
      ;[loaded, signatures] = await Promise.all([loadDocument(documentId), fetchSignatures(signatureIds)])
    } catch (err) {
      for (const id of signatureIds) {
        failed.push({ name: id, message: err.message || 'Could not load this document.' })
        done += 1
      }
      onProgress?.({ done, total })
      continue
    }

    for (const id of signatureIds) {
      if (signal?.aborted) break
      const signature = signatures.get(id)
      const label = signature ? `${signature.signer_name} – ${signature.document_title}` : id
      onProgress?.({ done, total, name: label })
      await nextTick()   // let the progress bar repaint between PDFs
      try {
        if (!signature) throw new Error('Signature not found.')
        const pdf = buildSignedPolicyPdf({ doc: loaded.doc, prepared: loaded.prep, signature, branding })
        const bytes = new Uint8Array(pdf.output('arraybuffer'))
        const docName = safeFileName(`${signature.document_title} (v${signature.document_version})`, 'policy')
        const path = grouping === 'by-person'
          ? `${folderFor(signature)}/${docName}.pdf`
          : `${safeFileName(`${signature.document_title} (v${signature.document_version}) - ${signature.signer_name}`, 'signed-policy')}.pdf`
        files[uniquePath(path)] = [bytes, { level: 0 }]   // PDFs are already compressed
      } catch (err) {
        failed.push({ name: label, message: err.message || 'Could not make this PDF.' })
      }
      done += 1
    }
  }
  onProgress?.({ done, total })

  const made = Object.keys(files).length
  if (!made) return { blob: null, made: 0, failed, cancelled: !!signal?.aborted }
  const zipped = zipSync(files)
  return { blob: new Blob([zipped], { type: 'application/zip' }), made, failed, cancelled: !!signal?.aborted }
}
