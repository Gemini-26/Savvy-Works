import { useCallback, useState } from 'react'
import { useCurrentUser } from '../../hooks/useCurrentUser'
import FaceCaptureModal from '../components/FaceCaptureModal'
import FaceEnrolFlow from '../components/FaceEnrolFlow'
import { fetchFaceEnrolment, recordFaceCheck } from '../services/faceService'
import { technicianFaceNotice } from '../utils/faceCheck'

const TITLES = {
  shift_in: 'Clock in for the day',
  shift_out: 'Clock out for the day',
  site_in: 'Clock in on site',
  site_out: 'Clock out on site',
}

const NOTICE_TONE = {
  amber: 'bg-amber-50 border-amber-200 text-amber-800',
}

// Face clock-in for the person holding the phone. The face check is a SOFT
// check — it never stops a clock event, it only records how it went (see the
// face_clock_in migration) — so the pattern at each clock button is:
//
//   const { askFace, recordFace, faceDialog } = useFaceCheck()
//   …
//   const face = await askFace('shift_in')
//   if (!face) return                       // they backed out
//   const shift = await clockInForWork(profile.id)
//   await recordFace('shift_in', face, { shiftId: shift.id })
//   …
//   return <>{…}{faceDialog}</>
//
// askFace resolves to the capture, `{ skipped: true, reason }` when the check
// can't or won't be done (clock in anyway), or null when they cancelled.
export function useFaceCheck() {
  const { profile } = useCurrentUser()
  const [pending, setPending] = useState(null)   // { kind, enrolled, resolve }
  const [notice, setNotice] = useState(null)

  const askFace = useCallback(async kind => {
    if (!profile?.id) return { skipped: true, reason: 'unavailable' }
    let enrolled
    try {
      enrolled = (await fetchFaceEnrolment()).profileIds.has(profile.id)
    } catch {
      // The face tables not being there (or the network failing) must never
      // stop someone clocking in.
      return { skipped: true, reason: 'unavailable' }
    }
    return new Promise(resolve => setPending({ kind, enrolled, resolve }))
  }, [profile?.id])

  const recordFace = useCallback(async (kind, face, links) => {
    if (!face) return null
    const verdict = await recordFaceCheck(kind, face, links)
    setNotice(technicianFaceNotice(verdict))
    return verdict
  }, [])

  function settle(result) {
    pending.resolve(result)
    setPending(null)
  }

  const faceDialog = (
    <>
      {pending && !pending.enrolled && (
        <FaceEnrolFlow
          name={profile?.full_name}
          profileId={profile?.id}
          self
          onEnrolled={captured => settle(captured)}
          onNotNow={() => settle({ skipped: true, reason: 'not_enrolled' })}
          onCancel={() => settle(null)}
        />
      )}
      {pending?.enrolled && (
        <FaceCaptureModal
          mode="verify"
          title={TITLES[pending.kind] || 'Check your face'}
          subtitle="Look at the camera and blink once."
          allowSkip
          onResult={captured => settle(captured)}
          onSkip={reason => settle({ skipped: true, reason })}
          onClose={() => settle(null)}
        />
      )}
      {notice && (
        <div className={`fixed bottom-24 left-4 right-4 z-[10001] mx-auto max-w-md rounded-lg border px-3 py-2.5 text-sm flex items-start gap-3 shadow-lg ${NOTICE_TONE[notice.tone] || NOTICE_TONE.amber}`}>
          <p className="flex-1">{notice.text}</p>
          <button type="button" onClick={() => setNotice(null)} className="text-xs font-semibold shrink-0">Dismiss</button>
        </div>
      )}
    </>
  )

  return { askFace, recordFace, faceDialog }
}
