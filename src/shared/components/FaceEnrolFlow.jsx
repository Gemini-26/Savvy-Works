import { useState } from 'react'
import FaceCaptureModal from './FaceCaptureModal'
import { enrolFace } from '../services/faceService'

// Setting up a face: the consent screen, then the camera, then saving it.
// A face is biometric information (POPIA), so nothing is stored until the
// person has agreed — `self` is whether they're the one holding the phone.
//
//   onEnrolled({ descriptors, photo, liveness })  the face is saved
//   onNotNow                                       optional "skip for now" (e.g. mid clock-in)
//   onCancel                                       backed out
export default function FaceEnrolFlow({ name, profileId = null, teamMemberId = null, self = true, onEnrolled, onNotNow, onCancel }) {
  const [step, setStep] = useState('consent')   // consent | capture | saving
  const [agreed, setAgreed] = useState(false)
  const [error, setError] = useState(null)

  async function handleCaptured(captured) {
    setStep('saving')
    setError(null)
    try {
      await enrolFace({ profileId, teamMemberId, descriptors: captured.descriptors, photo: captured.photo })
      onEnrolled(captured)
    } catch (err) {
      setError(err.message || 'The face could not be saved.')
      setStep('consent')
    }
  }

  if (step === 'capture') {
    return (
      <FaceCaptureModal
        mode="enrol"
        title={self ? 'Set up your face' : `Set up ${name}'s face`}
        subtitle="Look at the camera, blink once, then hold still for a moment."
        onResult={handleCaptured}
        onClose={onCancel}
      />
    )
  }

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto">
        <div className="px-5 pt-4 pb-2">
          <h2 className="text-base font-bold text-gray-900">{self ? 'Set up face clock-in' : `Set up face clock-in for ${name}`}</h2>
          <p className="text-xs text-gray-500 mt-0.5">Clock in with a quick selfie. Takes about 20 seconds, once.</p>
        </div>

        <div className="px-5 pb-5 space-y-3">
          <ul className="text-sm text-gray-600 space-y-2 list-disc pl-5">
            <li><strong className="text-gray-800">What we keep:</strong> a list of numbers that describes {self ? 'your' : 'their'} face (not a picture it can be rebuilt from), and a selfie each time {self ? 'you clock' : 'they clock'} in.</li>
            <li><strong className="text-gray-800">Why:</strong> to confirm it’s really {self ? 'you' : 'them'} clocking in, for attendance and payroll. Nothing else.</li>
            <li>An admin can delete {self ? 'your' : 'their'} face data at any time.</li>
          </ul>

          <label className="flex items-start gap-2.5 text-sm text-gray-800 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={agreed}
              onChange={e => setAgreed(e.target.checked)}
              className="mt-0.5 w-4 h-4 shrink-0"
            />
            <span>{self ? 'I agree to this.' : `${name} has read this and agreed to it.`}</span>
          </label>

          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded">{error}</div>}

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              disabled={!agreed || step === 'saving'}
              onClick={() => setStep('capture')}
              className="flex-1 min-w-32 bg-blue-600 text-white text-sm font-semibold py-2 rounded-lg disabled:opacity-40"
            >
              {step === 'saving' ? 'Saving…' : 'Continue'}
            </button>
            {onNotNow && (
              <button type="button" onClick={onNotNow} className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 text-gray-600">
                Not now
              </button>
            )}
            <button type="button" onClick={onCancel} className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 text-gray-600">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
