// Who has to sign what, and how far along everyone is. Pure functions (no
// database, no React) so the counting rules live in one place and are easy to
// check on their own.
//
// A person is asked to sign every ACTIVE document aimed at them: audience "all",
// audience equal to their role, or "specific" with their name ticked. Team
// members (helpers with no login) can only be asked through "specific".
// Superseded and archived documents never count as outstanding, and a signature
// made by someone who is not (or no longer) in a document's audience is ignored
// for that document's totals.

export const AUDIENCE_LABELS = {
  all: 'Everyone',
  admin: 'Admins only',
  technician: 'Technicians only',
  specific: 'Specific people…',
}

const idsOf = list => (Array.isArray(list) ? list : [])
const countOf = doc => idsOf(doc.audience_profile_ids).length + idsOf(doc.audience_team_member_ids).length

// "Everyone", "Technicians only", "Specific people (3)".
export function audienceLabel(doc) {
  if (doc.audience === 'specific') return `Specific people (${countOf(doc)})`
  return AUDIENCE_LABELS[doc.audience] || doc.audience
}

// A team member, shaped like a person so the counting below treats both alike.
export const asPerson = member => ({
  id: member.id,
  full_name: member.full_name,
  phone: member.phone ?? null,
  role: 'team member',
  isTeamMember: true,
})

// `person` is a login ({ id, role }) or a team member (see asPerson).
export function appliesTo(doc, person) {
  if (person.isTeamMember) {
    return doc.audience === 'specific' && idsOf(doc.audience_team_member_ids).includes(person.id)
  }
  if (doc.audience === 'all') return true
  if (doc.audience === 'specific') return !!person.id && idsOf(doc.audience_profile_ids).includes(person.id)
  return doc.audience === person.role
}

// Whose signature a row is: a login's, or a team member's.
export const signerId = signature => signature.profile_id || signature.team_member_id || null

// For one person: which of the active documents are signed / outstanding.
export function progressFor(person, docs, signatures) {
  const required = docs.filter(d => d.status === 'active' && appliesTo(d, person))
  const signedIds = new Set(signatures.filter(s => signerId(s) === person.id).map(s => s.document_id))
  const signed = required.filter(d => signedIds.has(d.id))
  const outstanding = required.filter(d => !signedIds.has(d.id))
  return { required, signed, outstanding, total: required.length, done: signed.length }
}

// The admin's view: per document (signed / not signed of everyone it applies to)
// and per person (n of m signed). `teamMembers` are the active team members.
export function buildOverview({ docs, signatures, people, teamMembers = [] }) {
  const everyone = [...people, ...teamMembers.map(asPerson)]

  const byDoc = docs.map(doc => {
    const audience = everyone.filter(p => appliesTo(doc, p))
    const sigBySigner = new Map(signatures.filter(s => s.document_id === doc.id).map(s => [signerId(s), s]))
    const rows = audience.map(person => ({ person, signature: sigBySigner.get(person.id) || null }))
    const signed = rows.filter(r => r.signature).length
    return { doc, rows, total: rows.length, signed, notSigned: rows.length - signed }
  })

  const byPerson = everyone
    .map(person => ({ person, ...progressFor(person, docs, signatures) }))
    .filter(p => p.total > 0)

  const active = byDoc.filter(d => d.doc.status === 'active')
  const totalNeeded = active.reduce((n, d) => n + d.total, 0)
  const totalSigned = active.reduce((n, d) => n + d.signed, 0)
  return { byDoc, byPerson, totalNeeded, totalSigned, peopleComplete: byPerson.filter(p => p.outstanding.length === 0).length }
}

export const percent = (done, total) => (total > 0 ? Math.round((done / total) * 100) : 0)

// Does an audience choice make sense? "Specific people" needs at least one name.
export const audienceIsValid = a => a.audience !== 'specific' || (a.profileIds.length + a.teamMemberIds.length) > 0

// What the database wants for a document's audience choice.
export function audienceArgs(a) {
  const specific = a.audience === 'specific'
  return {
    audience: a.audience,
    audienceProfileIds: specific ? a.profileIds : [],
    audienceTeamMemberIds: specific ? a.teamMemberIds : [],
  }
}

// A document's audience as the form edits it.
export const audienceOf = doc => ({
  audience: doc?.audience || 'all',
  profileIds: [...idsOf(doc?.audience_profile_ids)],
  teamMemberIds: [...idsOf(doc?.audience_team_member_ids)],
})
