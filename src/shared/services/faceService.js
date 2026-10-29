import { supabase } from '../../lib/supabase'
import { getCurrentProfile } from '../../services/authService'

const BUCKET = 'face-checks'

// Which of these the browser may even ask for is decided by the database
// (see the face_clock_in migration): templates can never be read from here,
// only enrolled, compared and erased through functions.

async function uploadSelfie(photo, folder) {
  if (!photo) return null
  const profile = await getCurrentProfile()
  if (!profile?.company_id) return null
  const month = new Date().toISOString().slice(0, 7)
  const path = `${profile.company_id}/${folder || month}/${crypto.randomUUID()}.jpg`
  const { error } = await supabase.storage.from(BUCKET).upload(path, photo, { contentType: 'image/jpeg' })
  // A selfie that fails to upload must never stop someone clocking in — the
  // check is still recorded, just without its picture.
  return error ? null : path
}

// Who has a face on file: { profileIds: Set, teamMemberIds: Set, rows } — ids
// and counts only, never the templates themselves.
export async function fetchFaceEnrolment() {
  const { data, error } = await supabase.rpc('face_enrolment_overview')
  if (error) throw error
  const rows = data || []
  return {
    rows,
    profileIds: new Set(rows.filter(r => r.o_profile_id).map(r => r.o_profile_id)),
    teamMemberIds: new Set(rows.filter(r => r.o_team_member_id).map(r => r.o_team_member_id)),
  }
}

// `descriptors` are the 128-number samples from the camera (3 is plenty).
export async function enrolFace({ profileId = null, teamMemberId = null, descriptors, photo }) {
  const photoPath = await uploadSelfie(photo, 'enrolment')
  const { data, error } = await supabase.rpc('face_enrol', {
    p_profile_id: profileId,
    p_team_member_id: teamMemberId,
    p_descriptors: descriptors,
    p_photo_path: photoPath,
    p_consent: true,
  })
  if (error) throw error
  return data
}

// Record the check for a clock event that has already happened. This is a soft
// check: it resolves to the verdict ({ id, status, distance }) or null, and
// never throws, so a failure here can't undo or block the clock-in.
//   face = { descriptors: [[…128]], photo, liveness } | { skipped: true, reason }
export async function recordFaceCheck(kind, face, { shiftId = null, assignmentId = null, teamMemberId = null } = {}) {
  try {
    const skipped = !face || face.skipped
    const photoPath = skipped ? null : await uploadSelfie(face.photo)
    const { data, error } = await supabase.rpc('face_record_check', {
      p_kind: kind,
      p_shift_id: shiftId,
      p_assignment_id: assignmentId,
      p_team_member_id: teamMemberId,
      p_descriptor: skipped ? null : face.descriptors[0],
      p_photo_path: photoPath,
      p_liveness: skipped ? null : face.liveness,
      p_skip_reason: skipped ? (face?.reason || 'user_skipped') : null,
    })
    if (error) throw error
    const row = Array.isArray(data) ? data[0] : data
    return row ? { id: row.o_check_id, status: row.o_status, distance: row.o_distance } : null
  } catch (err) {
    console.warn('Face check could not be recorded', err)
    return null
  }
}

// Who is this? Resolves to { id, name, distance } for a clearly recognised
// active team member, or null for a stranger / two look-alikes.
export async function identifyTeamMember(descriptor) {
  const { data, error } = await supabase.rpc('face_identify_team_member', { p_descriptor: descriptor })
  if (error) throw error
  const row = data?.[0]
  return row ? { id: row.o_team_member_id, name: row.o_full_name, distance: row.o_distance } : null
}

// ── Admin ──────────────────────────────────────────────────────

export async function removeFace({ profileId = null, teamMemberId = null }) {
  const { error } = await supabase.rpc('face_remove', { p_profile_id: profileId, p_team_member_id: teamMemberId })
  if (error) throw error
}

export async function reviewFaceCheck(checkId, note) {
  const { error } = await supabase.rpc('face_review_check', { p_check_id: checkId, p_note: note?.trim() || null })
  if (error) throw error
}

// Newest first. `flaggedOnly` = the review queue (flagged, not yet reviewed).
export async function fetchFaceChecks({ flaggedOnly = false, limit = 100 } = {}) {
  let query = supabase
    .from('face_checks')
    .select('*, profiles(id, full_name, color), team_members(id, full_name)')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (flaggedOnly) query = query.eq('flagged', true).is('reviewed_at', null)
  const { data, error } = await query
  if (error) throw error
  return data || []
}

// Short-lived links to the selfies (admins only — the bucket is private).
export async function fetchFaceCheckPhotoUrls(paths) {
  const unique = [...new Set(paths.filter(Boolean))]
  if (unique.length === 0) return {}
  const { data } = await supabase.storage.from(BUCKET).createSignedUrls(unique, 3600)
  return Object.fromEntries((data || []).filter(d => d.signedUrl).map(d => [d.path, d.signedUrl]))
}
