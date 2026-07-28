import { useState } from 'react'
import { completeJob } from '../services/jobService'
import SignaturePad from '../../../shared/components/SignaturePad'

const inputCls = 'w-full px-3 py-2 text-sm rounded border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white'

function Field({ label, required, children }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

// signOffName comes from the logged-in profile, not free text — the
// sign-off is a record of who actually completed the job, so it can't
// be typed as someone else.
export default function CompleteJobModal({ jobId, signOffName, onClose, onCompleted }) {
  const [step, setStep] = useState('details')
  const [form, setForm] = useState({ completion_notes: '', materials_used: '' })
  const [signature, setSignature] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  function handleNext(e) {
    e.preventDefault()
    setError(null)
    setStep('signature')
  }

  async function handleFinish() {
    if (!signature) {
      setError('Please sign before completing the job.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await completeJob(jobId, { ...form, sign_off_name: signOffName, sign_off_signature: signature })
      onCompleted()
      onClose()
    } catch (err) {
      setError(err.message || 'Failed to complete job')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">
            {step === 'details' ? 'Complete Job' : 'Sign Off'}
          </h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        {error && (
          <div className="mx-6 mt-4 bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded">{error}</div>
        )}

        {step === 'details' ? (
          <form onSubmit={handleNext} className="px-6 py-5 space-y-4">
            <Field label="Completion Notes">
              <textarea
                rows={3}
                value={form.completion_notes}
                onChange={e => set('completion_notes', e.target.value)}
                placeholder="What was done on site…"
                className={`${inputCls} resize-none`}
              />
            </Field>

            <Field label="Materials Used">
              <textarea
                rows={2}
                value={form.materials_used}
                onChange={e => set('materials_used', e.target.value)}
                placeholder="Parts / materials consumed…"
                className={`${inputCls} resize-none`}
              />
            </Field>

            <Field label="Signed Off By">
              <p className="py-1.5 text-sm text-gray-800 font-medium">{signOffName}</p>
            </Field>

            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                className="flex-1 bg-blue-600 text-white py-2 rounded text-sm font-semibold hover:bg-blue-700 transition-colors"
              >
                Next →
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded text-sm font-medium border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div className="px-6 py-5 space-y-4">
            <p className="text-sm text-gray-600">
              <span className="font-semibold">{signOffName}</span>, please sign below to confirm the job is complete.
            </p>

            <SignaturePad onChange={setSignature} />

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                disabled={saving}
                onClick={handleFinish}
                className="flex-1 bg-green-600 text-white py-2 rounded text-sm font-semibold hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Completing…' : 'Mark Complete'}
              </button>
              <button
                type="button"
                onClick={() => setStep('details')}
                className="px-4 py-2 rounded text-sm font-medium border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
              >
                ← Back
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
