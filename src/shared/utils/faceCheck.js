// The verdicts the database gives a face check (see face_record_check in the
// face_clock_in migration), in plain words. `tone` drives the colour; only
// 'amber' is an actual flag.
export const FACE_STATUS = {
  match:        { tone: 'green', label: 'Face matched' },
  mismatch:     { tone: 'amber', label: "Face didn't match" },
  skipped:      { tone: 'amber', label: 'Face check skipped' },
  not_enrolled: { tone: 'gray',  label: 'No face on file yet' },
}

export const FACE_KIND_LABEL = {
  shift_in:  'Day clock-in',
  shift_out: 'Day clock-out',
  site_in:   'On-site clock-in',
  site_out:  'On-site clock-out',
  team_in:   'Team member on site',
}

// Why a check was skipped, for the admin.
const SKIP_REASONS = {
  camera_denied: 'camera blocked',
  no_camera: 'no camera found',
  engine_failed: "the phone couldn't run the face check",
  no_face: "no face could be found",
  user_skipped: 'skipped by the person',
  not_enrolled: 'no face on file yet',
}

export function describeSkipReason(reason) {
  return SKIP_REASONS[reason] || reason || null
}

// A check an admin should look at: wrong face, skipped, or the blink test was
// bypassed — and nobody has marked it reviewed yet.
export function isFaceFlagged(check) {
  return Boolean(check.flagged) && !check.reviewed_at
}

// Technician-facing wording for right after they clock in / out.
export function technicianFaceNotice(verdict) {
  if (!verdict) return null
  switch (verdict.status) {
    case 'mismatch':
      return {
        tone: 'amber',
        text: "Your face didn't match the one on file. You're clocked in, and it has been recorded for your admin to review.",
      }
    case 'skipped':
      return {
        tone: 'amber',
        text: 'The face check was skipped. You’re clocked in, and it has been recorded for your admin to review.',
      }
    default:
      return null
  }
}
