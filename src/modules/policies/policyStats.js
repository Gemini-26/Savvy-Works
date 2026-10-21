// Who has to sign what, and how far along everyone is. Pure functions (no
// database, no React) so the counting rules live in one place and are easy to
// check on their own.
//
// A person is asked to sign every ACTIVE document aimed at them: audience "all",
// or audience equal to their role. Superseded and archived documents never count
// as outstanding, and a signature made by someone who is not (or no longer) in a
// document's audience is ignored for that document's totals.

export const AUDIENCE_LABELS = { all: 'Everyone', admin: 'Admins only', technician: 'Technicians only' }

export const appliesTo = (doc, role) => doc.audience === 'all' || doc.audience === role

// For one person: which of the active documents are signed / outstanding.
export function progressFor(person, docs, signatures) {
  const required = docs.filter(d => d.status === 'active' && appliesTo(d, person.role))
  const signedIds = new Set(signatures.filter(s => s.profile_id === person.id).map(s => s.document_id))
  const signed = required.filter(d => signedIds.has(d.id))
  const outstanding = required.filter(d => !signedIds.has(d.id))
  return { required, signed, outstanding, total: required.length, done: signed.length }
}

// The admin's view: per document (signed / not signed of everyone it applies to)
// and per person (n of m signed).
export function buildOverview({ docs, signatures, people }) {
  const byDoc = docs.map(doc => {
    const audience = people.filter(p => appliesTo(doc, p.role))
    const sigByProfile = new Map(signatures.filter(s => s.document_id === doc.id).map(s => [s.profile_id, s]))
    const rows = audience.map(person => ({ person, signature: sigByProfile.get(person.id) || null }))
    const signed = rows.filter(r => r.signature).length
    return { doc, rows, total: rows.length, signed, notSigned: rows.length - signed }
  })

  const byPerson = people
    .map(person => ({ person, ...progressFor(person, docs, signatures) }))
    .filter(p => p.total > 0)

  const active = byDoc.filter(d => d.doc.status === 'active')
  const totalNeeded = active.reduce((n, d) => n + d.total, 0)
  const totalSigned = active.reduce((n, d) => n + d.signed, 0)
  return { byDoc, byPerson, totalNeeded, totalSigned, peopleComplete: byPerson.filter(p => p.outstanding.length === 0).length }
}

export const percent = (done, total) => (total > 0 ? Math.round((done / total) * 100) : 0)
