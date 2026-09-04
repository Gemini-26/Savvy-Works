import { useState, useEffect } from 'react'
import { completeJob, fetchJobForPayment } from '../services/jobService'
import { findInvoiceForJob, createInvoiceFromJob, updateInvoice, createPayfastPayment, buildPayfastPaymentLink, logInvoiceEvent } from '../../finance/services/invoiceService'
import { buildWhatsappLink } from '../../../shared/utils/whatsapp'
import SignaturePad from '../../../shared/components/SignaturePad'
import { PAYMENT_TYPES } from '../../../shared/constants/paymentTypes'

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
// be typed as someone else. sign_off_customer_name is separate — it's
// the customer's own typed name/surname, captured alongside their signature.
export default function CompleteJobModal({ jobId, signOffName, onClose, onCompleted }) {
  const [step, setStep] = useState('details')
  const [form, setForm] = useState({ completion_notes: '', materials_used: '' })
  const [signature, setSignature] = useState(null)
  const [customerName, setCustomerName] = useState('')
  const [paymentType, setPaymentType] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const [job, setJob] = useState(null)
  const [linkLoading, setLinkLoading] = useState(false)
  const [paymentLink, setPaymentLink] = useState(null)
  const [linkError, setLinkError] = useState(null)
  const [linkInvoiceId, setLinkInvoiceId] = useState(null)
  const [showAddCharge, setShowAddCharge] = useState(false)
  const [chargeDescription, setChargeDescription] = useState('')
  const [chargeAmount, setChargeAmount] = useState('')

  useEffect(() => {
    fetchJobForPayment(jobId).then(setJob).catch(() => setJob(null))
  }, [jobId])

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function generateLinkForInvoice(invoiceId) {
    const payment = await createPayfastPayment(invoiceId)
    setPaymentLink(buildPayfastPaymentLink(payment))
  }

  async function handleGetPaymentLink() {
    setLinkLoading(true)
    setLinkError(null)
    setShowAddCharge(false)
    try {
      let invoice = await findInvoiceForJob(jobId)
      if (!invoice) {
        invoice = await createInvoiceFromJob(job)
      }
      if (invoice.status === 'draft') {
        await updateInvoice(invoice.id, { status: 'outstanding' })
      }
      setLinkInvoiceId(invoice.id)
      await generateLinkForInvoice(invoice.id)
    } catch (err) {
      // "no priced items" is the one failure a technician can actually fix
      // on the spot — offer a quick way to add a charge instead of a dead end.
      if (err.message?.includes('no priced items')) {
        setShowAddCharge(true)
      }
      setLinkError(err.message || 'Failed to create payment link')
    } finally {
      setLinkLoading(false)
    }
  }

  async function handleAddChargeAndGenerate() {
    if (!chargeDescription.trim() || !chargeAmount || Number(chargeAmount) <= 0) {
      setLinkError('Enter a description and an amount greater than zero.')
      return
    }
    setLinkLoading(true)
    setLinkError(null)
    try {
      let invoiceId = linkInvoiceId
      if (!invoiceId) {
        const invoice = await findInvoiceForJob(jobId) || await createInvoiceFromJob(job)
        invoiceId = invoice.id
        setLinkInvoiceId(invoiceId)
      }
      await updateInvoice(invoiceId, { status: 'outstanding' }, [{
        description: chargeDescription.trim(), quantity: 1, unit: 'each',
        unit_price: Number(chargeAmount), tax_rate: 15,
      }])
      await generateLinkForInvoice(invoiceId)
      setShowAddCharge(false)
    } catch (err) {
      setLinkError(err.message || 'Failed to add charge')
    } finally {
      setLinkLoading(false)
    }
  }

  const customerPhone = job?.customers?.mobile || job?.customers?.telephone || ''

  function handleNext(e) {
    e.preventDefault()
    setError(null)
    setStep('signature')
  }

  function handleSignatureNext() {
    if (!customerName.trim()) {
      setError('Please enter the customer’s name and surname.')
      return
    }
    if (!signature) {
      setError('Please sign before continuing.')
      return
    }
    setError(null)
    setStep('payment')
  }

  async function handleFinish() {
    if (!paymentType) {
      setError('Please select a payment type.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await completeJob(jobId, {
        ...form,
        sign_off_name: signOffName,
        sign_off_signature: signature,
        sign_off_customer_name: customerName.trim(),
        payment_type: paymentType,
      })
      onCompleted()
      onClose()
    } catch (err) {
      setError(err.message || 'Failed to complete job')
    } finally {
      setSaving(false)
    }
  }

  const stepTitles = { details: 'Complete Job', signature: 'Sign Off', payment: 'Payment Type' }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">{stepTitles[step]}</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        {error && (
          <div className="mx-6 mt-4 bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded">{error}</div>
        )}

        {step === 'details' && (
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
        )}

        {step === 'signature' && (
          <div className="px-6 py-5 space-y-4">
            <p className="text-sm text-gray-600">
              Please confirm the job is complete and sign below.
            </p>

            <Field label="Customer Name & Surname" required>
              <input
                value={customerName}
                onChange={e => setCustomerName(e.target.value)}
                placeholder="e.g. Jane Smith"
                className={inputCls}
              />
            </Field>

            <SignaturePad onChange={setSignature} />

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={handleSignatureNext}
                className="flex-1 bg-blue-600 text-white py-2 rounded text-sm font-semibold hover:bg-blue-700 transition-colors"
              >
                Next →
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

        {step === 'payment' && (
          <div className="px-6 py-5 space-y-4">
            <p className="text-sm text-gray-600">
              <span className="font-semibold">{customerName}</span>, please select your preferred payment type.
            </p>

            <Field label="Payment Type" required>
              <select value={paymentType} onChange={e => setPaymentType(e.target.value)} className={inputCls}>
                <option value="">— Select Payment Type —</option>
                {PAYMENT_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </Field>

            {paymentType === 'Payment Link' && (
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 space-y-2">
                {linkError && <p className="text-xs text-red-600">{linkError}</p>}
                {!paymentLink && !showAddCharge && (
                  <button type="button" onClick={handleGetPaymentLink} disabled={linkLoading}
                    className="w-full bg-blue-600 text-white py-2 rounded text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors">
                    {linkLoading ? 'Generating link…' : '🔗 Generate Payment Link'}
                  </button>
                )}
                {!paymentLink && showAddCharge && (
                  <div className="space-y-2">
                    <p className="text-xs text-gray-600">Add what the customer owes for this job, then generate the link:</p>
                    <input value={chargeDescription} onChange={e => setChargeDescription(e.target.value)}
                      placeholder="e.g. Callout + labour" className={inputCls} />
                    <input type="number" min="0" step="0.01" value={chargeAmount} onChange={e => setChargeAmount(e.target.value)}
                      placeholder="Amount (R, excl. tax)" className={inputCls} />
                    <button type="button" onClick={handleAddChargeAndGenerate} disabled={linkLoading}
                      className="w-full bg-blue-600 text-white py-2 rounded text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors">
                      {linkLoading ? 'Adding…' : '🔗 Add Charge & Generate Link'}
                    </button>
                  </div>
                )}
                {paymentLink && (
                  <>
                    <a href={paymentLink} target="_blank" rel="noreferrer"
                      className="block w-full text-center bg-green-600 text-white py-2 rounded text-sm font-semibold hover:bg-green-700 transition-colors">
                      💳 Open Payment Page
                    </a>
                    <a href={buildWhatsappLink(customerPhone, `Hi ${customerName || ''}, here is your payment link for ${job?.title || 'your job'}: ${paymentLink}`)}
                      target="_blank" rel="noreferrer"
                      onClick={() => linkInvoiceId && logInvoiceEvent(linkInvoiceId, 'link_sent_whatsapp', `Sent to ${customerPhone || 'customer'} on-site`).catch(() => {})}
                      className="block w-full text-center bg-[#25D366] text-white py-2 rounded text-sm font-semibold hover:opacity-90 transition-colors">
                      📲 Send via WhatsApp{!customerPhone && ' (no number on file — choose a contact)'}
                    </a>
                  </>
                )}
              </div>
            )}

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
                onClick={() => setStep('signature')}
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
