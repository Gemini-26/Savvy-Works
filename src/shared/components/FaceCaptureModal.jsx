import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { loadFaceEngine, detectFace, describeFace, createBlinkDetector, snapshotJpeg } from '../utils/faceEngine'

const ENROL_SAMPLES = 3
const SAMPLE_GAP_MS = 500
const MIN_SCORE = 0.6          // detector's own confidence that it's a face
const MIN_SIZE = 0.2           // face must fill at least this much of the frame's width
const BLINK_HELP_AFTER_MS = 10_000
const SKIP_AFTER_MS = 8_000

const nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve))

// The camera step of a face clock-in, face enrolment, or "who is this?" for a
// team member. Opens the front camera, waits for a face (and, to prove it's a
// live person and not a held-up photo, one blink), then hands back what it saw:
//
//   onResult({ descriptors: [[…128 numbers]], photo: Blob, liveness: boolean | null })
//
// mode: 'verify'   one sample, needs a blink
//       'enrol'    three samples, needs a blink
//       'identify' one sample, no blink (a helper holding the technician's phone)
//
// `allowSkip` adds a way out when the camera or face check can't work, which
// reports onSkip(reason) — the clock-in still goes ahead, flagged for an admin.
export default function FaceCaptureModal({ mode = 'verify', title, subtitle, allowSkip = false, onResult, onSkip, onClose }) {
  const videoRef = useRef(null)
  const bypassBlinkRef = useRef(false)
  const callbacks = useRef({ onResult })
  const [stage, setStage] = useState('starting')   // starting | loading | looking
  const [hint, setHint] = useState('')
  const [faceOk, setFaceOk] = useState(false)
  const [progress, setProgress] = useState(0)
  const [problem, setProblem] = useState(null)      // { reason, text }
  const [canBypassBlink, setCanBypassBlink] = useState(false)
  const [canSkip, setCanSkip] = useState(false)

  useEffect(() => {
    callbacks.current = { onResult }
  })

  useEffect(() => {
    const video = videoRef.current
    const needsBlink = mode !== 'identify'
    const wanted = mode === 'enrol' ? ENROL_SAMPLES : 1
    let stopped = false
    let stream = null

    function stopCamera() {
      stream?.getTracks().forEach(t => t.stop())
      stream = null
    }

    function fail(reason, text) {
      if (stopped) return
      stopped = true
      stopCamera()
      setProblem({ reason, text })
    }

    async function run() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        })
      } catch (err) {
        const blocked = err?.name === 'NotAllowedError' || err?.name === 'SecurityError'
        return fail(
          blocked ? 'camera_denied' : 'no_camera',
          blocked
            ? 'The camera is blocked. Allow Camera for this app in your phone’s settings, then try again.'
            : "This phone's camera couldn't be started.",
        )
      }
      if (stopped) return stopCamera()

      video.srcObject = stream
      await video.play().catch(() => {})

      setStage('loading')
      try {
        await loadFaceEngine()
      } catch {
        return fail('engine_failed', "The face check couldn't start on this phone — check your internet connection and try again.")
      }
      if (stopped) return

      setStage('looking')
      const sawBlink = createBlinkDetector()
      const startedAt = performance.now()
      const samples = []
      let blinked = !needsBlink
      let steadyFrames = 0
      let lastSampleAt = 0
      let photo = null

      while (!stopped) {
        await nextFrame()
        if (stopped) break

        const elapsed = performance.now() - startedAt
        if (elapsed > SKIP_AFTER_MS) setCanSkip(true)
        if (needsBlink && !blinked && elapsed > BLINK_HELP_AFTER_MS) setCanBypassBlink(true)
        if (video.readyState < 2) continue

        const face = await detectFace(video).catch(() => null)
        if (stopped) break

        if (!face || face.score < MIN_SCORE) {
          steadyFrames = 0
          setFaceOk(false)
          setHint(face ? 'Hold the phone still' : 'Look straight at the camera')
          continue
        }
        if (face.size < MIN_SIZE) {
          steadyFrames = 0
          setFaceOk(false)
          setHint('Move a little closer')
          continue
        }
        setFaceOk(true)
        steadyFrames++

        if (needsBlink && !blinked) {
          setHint('Now blink once, slowly')
          if (sawBlink(face.eyes)) blinked = true
          else if (!bypassBlinkRef.current) continue
        }

        // A blink was seen (or isn't needed): take the sample(s).
        setHint(mode === 'enrol' ? 'Hold still…' : 'Got it…')
        if (steadyFrames < (mode === 'identify' ? 4 : 2)) continue
        if (performance.now() - lastSampleAt < SAMPLE_GAP_MS) continue

        const descriptor = await describeFace(video).catch(() => null)
        if (stopped) break
        if (!descriptor) continue
        if (!photo) photo = await snapshotJpeg(video)
        samples.push(descriptor)
        lastSampleAt = performance.now()
        setProgress(samples.length)

        if (samples.length >= wanted) {
          stopped = true
          stopCamera()
          callbacks.current.onResult({
            descriptors: samples,
            photo,
            liveness: needsBlink ? blinked : null,
          })
        }
      }
    }

    run()
    return () => {
      stopped = true
      stopCamera()
    }
  }, [mode])

  const ring = problem ? 'ring-gray-200' : faceOk ? 'ring-green-500' : 'ring-gray-300'

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-2">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-gray-900">{title}</h2>
            {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Cancel" className="text-gray-400 hover:text-gray-600 shrink-0">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 pb-5">
          <div className={`relative mx-auto my-3 w-60 h-60 rounded-full overflow-hidden bg-gray-900 ring-4 transition-colors ${ring}`}>
            <video
              ref={videoRef}
              playsInline
              muted
              className="w-full h-full object-cover -scale-x-100"
            />
          </div>

          {problem ? (
            <div className="space-y-3">
              <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{problem.text}</p>
              <div className="flex gap-2">
                {allowSkip && (
                  <button
                    type="button"
                    onClick={() => onSkip?.(problem.reason)}
                    className="flex-1 bg-gray-900 text-white text-sm font-semibold py-2 rounded-lg"
                  >
                    Continue without face check
                  </button>
                )}
                <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 text-gray-600">
                  Cancel
                </button>
              </div>
              {allowSkip && <p className="text-[11px] text-gray-400">You’ll be clocked in, and your admin will see the check was skipped.</p>}
            </div>
          ) : (
            <div className="space-y-3 text-center">
              <p aria-live="polite" className="text-sm font-medium text-gray-800 min-h-5">
                {stage === 'starting' && 'Starting the camera…'}
                {stage === 'loading' && 'Getting the face check ready… (the first time can take a minute on mobile data)'}
                {stage === 'looking' && (hint || 'Look straight at the camera')}
              </p>

              {mode === 'enrol' && (
                <div className="flex justify-center gap-1.5" aria-label={`${progress} of ${ENROL_SAMPLES} captured`}>
                  {Array.from({ length: ENROL_SAMPLES }, (_, i) => (
                    <span key={i} className={`w-2.5 h-2.5 rounded-full ${i < progress ? 'bg-green-500' : 'bg-gray-300'}`} />
                  ))}
                </div>
              )}

              {canBypassBlink && (
                <button
                  type="button"
                  onClick={() => { bypassBlinkRef.current = true; setCanBypassBlink(false) }}
                  className="text-xs font-semibold text-blue-600"
                >
                  Can’t get the blink to register? Continue anyway
                </button>
              )}

              {allowSkip && canSkip && (
                <div>
                  <button type="button" onClick={() => onSkip?.('user_skipped')} className="text-xs font-medium text-gray-500 underline">
                    Skip the face check
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
