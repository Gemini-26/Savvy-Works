import { useState, useEffect, Fragment } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import PageContainer from '../../../shared/components/PageContainer.jsx'
import {
  fetchInvoice, updateInvoice, deleteInvoice, createPayfastPayment, buildPayfastPaymentLink,
  fetchInvoiceEvents, logInvoiceEvent, markInvoiceRefunded, markInvoiceDisputed, sendInvoiceReceiptEmail,
} from '../services/invoiceService'
import { buildWhatsappLink } from '../../../shared/utils/whatsapp'
import { useCustomers } from '../../../shared/hooks/useCustomers'
import { useItems } from '../../quotes/hooks/useItems'
import LineItemsEditor from '../../quotes/components/LineItemsEditor'
import { fetchJobTechnicianSummary } from '../../planner/services/appointmentService'
import { downloadInvoicePdf, previewInvoicePdf, invoicePdfBase64 } from '../utils/invoicePdf'
import { formatCurrency } from '../../../shared/utils/formatCurrency'
import { formatDate } from '../../../shared/utils/formatDate'
import { Eye } from 'lucide-react'

function formatDateTime(iso) {
  if (!iso) return null
  return new Date(iso).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' })
}

const STATUSES = ['draft', 'sent', 'outstanding', 'overdue', 'paid', 'cancelled']

const STATUS_LABELS = {
  draft: 'Draft', sent: 'Sent', outstanding: 'Outstanding',
  overdue: 'Overdue', paid: 'Paid', cancelled: 'Cancelled',
}

const STATUS_COLORS = {
  draft:       'bg-gray-100 text-gray-600',
  sent:        'bg-blue-100 text-blue-700',
  outstanding: 'bg-blue-100 text-blue-700',
  overdue:     'bg-red-100 text-red-600',
  paid:        'bg-green-100 text-green-700',
  cancelled:   'bg-gray-100 text-gray-500',
}

const PAYMENT_STATUS_LABELS = {
  failed: 'Payment Failed', refunded: 'Refunded', disputed: 'Disputed',
}

const PAYMENT_STATUS_COLORS = {
  failed: 'bg-red-100 text-red-600', refunded: 'bg-amber-100 text-amber-700', disputed: 'bg-amber-100 text-amber-700',
}

const EVENT_LABELS = {
  link_generated: 'Payment link generated',
  link_sent_whatsapp: 'Sent via WhatsApp',
  link_sent_email: 'Sent via Email',
  payment_completed: 'Payment received',
  payment_failed: 'Payment failed',
  refunded: 'Marked refunded',
  disputed: 'Marked disputed',
}

const inputCls = 'w-full px-3 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white'

function Field({ label, children }) {
  return (
    <div className="flex items-start gap-3">
      <label className="w-32 shrink-0 pt-1.5 text-sm text-gray-600 text-right">{label}</label>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  )
}

export default function InvoiceDetailPage() {
  const { id }   = useParams()
  const navigate = useNavigate()
  const { customers } = useCustomers()
  const { items: catalogue } = useItems()

  const [editing,       setEditing]       = useState(false)
  const [loading,       setLoading]       = useState(true)
  const [saving,        setSaving]        = useState(false)
  const [deleting,      setDeleting]      = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error,         setError]         = useState(null)
  const [form,          setForm]          = useState(null)
  const [lineItems,     setLineItems]     = useState([])
  const [technicians,   setTechnicians]   = useState([])
  const [paying,        setPaying]        = useState(false)
  const [sending,       setSending]       = useState(false)
  const [sendingEmail,  setSendingEmail]  = useState(false)
  const [events,        setEvents]        = useState([])
  const [showRefund,    setShowRefund]    = useState(false)
  const [refundReason,  setRefundReason]  = useState('')
  const [actionBusy,    setActionBusy]    = useState(false)

  useEffect(() => {
    load()
  }, [id])

  function load() {
    setLoading(true)
    fetchInvoice(id)
      .then(data => {
        setForm(data)
        setLineItems((data.invoice_items || []).map(li => ({
          item_id: li.item_id || '', description: li.description,
          quantity: li.quantity, unit: li.unit, unit_price: li.unit_price, tax_rate: li.tax_rate,
        })))
        setLoading(false)
        if (data.job_id) {
          fetchJobTechnicianSummary(data.job_id).then(setTechnicians).catch(() => setTechnicians([]))
        } else {
          setTechnicians([])
        }
        fetchInvoiceEvents(id).then(setEvents).catch(() => setEvents([]))
      })
      .catch(err => { setError(err.message); setLoading(false) })
  }

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      // Marking status "Paid" by hand (e.g. cash/EFT taken outside PayFast) must
      // also flip payment_status — it's a separate column the PayFast webhook
      // sets together, and the "Send via WhatsApp"/"Preview Payment" actions key
      // off payment_status, not status. Without this, a manually-paid invoice
      // still shows those buttons as if it were unpaid.
      const paymentFields = (form.status === 'paid' && form.payment_status !== 'paid')
        ? { payment_status: 'paid', paid_at: form.paid_at || new Date().toISOString() }
        : {}

      await updateInvoice(id, {
        customer_id:   form.customer_id   || null,
        title:         form.title         || null,
        status:        form.status,
        issue_date:    form.issue_date    || null,
        due_date:      form.due_date      || null,
        site_address:  form.site_address  || null,
        site_city:     form.site_city     || null,
        site_county:   form.site_county   || null,
        site_postcode: form.site_postcode || null,
        notes:         form.notes         || null,
        terms:         form.terms         || null,
        ...paymentFields,
      }, lineItems)

      if (paymentFields.payment_status) {
        await logInvoiceEvent(id, 'payment_completed', 'Marked paid manually (cash/EFT/other)')
      }
      setEditing(false)
      load()
    } catch (err) {
      setError(err.message || 'Failed to save changes')
    } finally {
      setSaving(false)
    }
  }

  // Opens the PayFast checkout in a new tab so an admin can see exactly what the
  // customer will see — this does not charge anyone here, it's a preview only.
  // The customer's actual payment happens when they open the link sent via
  // handleSendWhatsapp, in their own browser.
  async function handlePreviewPayment() {
    setPaying(true)
    setError(null)
    try {
      const { process_url, fields } = await createPayfastPayment(id)
      const payForm = document.createElement('form')
      payForm.method = 'POST'
      payForm.action = process_url
      payForm.target = '_blank'
      Object.entries(fields).forEach(([key, value]) => {
        const input = document.createElement('input')
        input.type = 'hidden'
        input.name = key
        input.value = value
        payForm.appendChild(input)
      })
      document.body.appendChild(payForm)
      payForm.submit()
      // Removing the form node immediately after submit() can race the
      // browser's async handling of a target="_blank" submission — on some
      // browsers this drops or corrupts the POST body entirely (PayFast then
      // sees no data, or a truncated one that fails signature validation).
      // Deferring the removal lets the browser finish reading the form first.
      setTimeout(() => payForm.remove(), 1000)
    } catch (err) {
      setError(err.message || 'Failed to open payment preview')
    } finally {
      setPaying(false)
    }
  }

  async function handleSendWhatsapp() {
    setSending(true)
    setError(null)
    try {
      const payment = await createPayfastPayment(id)
      const link = buildPayfastPaymentLink(payment)
      const phone = form.customers?.mobile || form.customers?.telephone || ''
      const message = `Hi ${form.customers?.customer_name || ''}, here is your payment link for ${form.title || form.invoice_ref}: ${link}`
      window.open(buildWhatsappLink(phone, message), '_blank', 'noopener')
      await logInvoiceEvent(id, 'link_sent_whatsapp', `Sent to ${phone || 'customer'}`)
      fetchInvoiceEvents(id).then(setEvents).catch(() => {})
    } catch (err) {
      setError(err.message || 'Failed to create payment link')
    } finally {
      setSending(false)
    }
  }

  function handleSendReceiptWhatsapp() {
    const phone = form.customers?.mobile || form.customers?.telephone || ''
    const message = `Hi ${form.customers?.customer_name || ''}, thank you for your payment of ${formatCurrency(form.total)} for ${form.title || form.invoice_ref}. Your invoice is marked as paid — let us know if you'd like a copy of the receipt.`
    window.open(buildWhatsappLink(phone, message), '_blank', 'noopener')
  }

  async function handleSendReceiptEmail() {
    setSendingEmail(true)
    setError(null)
    try {
      const pdfBase64 = await invoicePdfBase64(form, lineItems, technicians)
      await sendInvoiceReceiptEmail(id, pdfBase64)
      fetchInvoiceEvents(id).then(setEvents).catch(() => {})
    } catch (err) {
      setError(err.message || 'Failed to send receipt email')
    } finally {
      setSendingEmail(false)
    }
  }

  async function handleMarkRefunded() {
    setActionBusy(true)
    setError(null)
    try {
      await markInvoiceRefunded(id, refundReason)
      setShowRefund(false)
      setRefundReason('')
      load()
    } catch (err) {
      setError(err.message || 'Failed to mark invoice refunded')
    } finally {
      setActionBusy(false)
    }
  }

  async function handleMarkDisputed() {
    setActionBusy(true)
    setError(null)
    try {
      await markInvoiceDisputed(id, 'Marked disputed from invoice page')
      load()
    } catch (err) {
      setError(err.message || 'Failed to mark invoice disputed')
    } finally {
      setActionBusy(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      await deleteInvoice(id)
      navigate('/finance/invoices/draft')
    } catch (err) {
      setError(err.message || 'Failed to delete invoice')
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  if (loading) return <PageContainer><p className="text-sm text-gray-400 mt-8">Loading invoice…</p></PageContainer>
  if (!form)   return <PageContainer><p className="text-sm text-red-500 mt-8">{error || 'Invoice not found.'}</p></PageContainer>

  const ro = !editing

  return (
    <PageContainer>

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <img src="/branding/logo.png" alt="Savvy Civils and Plumbing" className="h-10 w-auto" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">{form.title || 'Invoice'}</h1>
            <p className="text-sm text-gray-500 mt-0.5">Ref: <span className="font-mono">{form.invoice_ref || '—'}</span></p>
          </div>
        </div>
        <div className="flex gap-2">
          {editing ? (
            <Fragment key="editing-actions">
              <button type="submit" form="invoice-detail-form" disabled={saving}
                className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors">
                {saving ? 'Saving…' : '💾 Save'}
              </button>
              <button type="button" onClick={() => { setEditing(false); setError(null); load() }}
                className="px-4 py-2 rounded text-sm font-medium border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors">
                Cancel
              </button>
            </Fragment>
          ) : (
            <Fragment key="view-actions">
              <button type="button" onClick={() => setEditing(true)}
                className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-semibold hover:bg-blue-700 transition-colors">
                ✏️ Edit
              </button>
              <button type="button" onClick={() => previewInvoicePdf(form, lineItems, technicians)}
                title="View Invoice"
                className="flex items-center justify-center bg-gray-100 text-gray-700 px-3 py-2 rounded text-sm font-semibold hover:bg-gray-200 transition-colors">
                <Eye size={16} />
              </button>
              <button type="button" onClick={() => downloadInvoicePdf(form, lineItems, technicians)}
                className="bg-gray-700 text-white px-4 py-2 rounded text-sm font-semibold hover:bg-gray-800 transition-colors">
                ⬇ Download PDF
              </button>
            </Fragment>
          )}
          <button type="button" onClick={() => navigate(-1)}
            className="bg-blue-500 text-white px-4 py-2 rounded text-sm font-semibold hover:bg-blue-600 transition-colors">
            ← Back
          </button>
          <button type="button" onClick={() => setConfirmDelete(true)}
            className="bg-red-600 text-white px-4 py-2 rounded text-sm font-semibold hover:bg-red-700 transition-colors">
            🗑 Delete
          </button>
        </div>
      </div>

      <div className="mb-4 flex items-center gap-3 flex-wrap">
        <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${STATUS_COLORS[form.status] ?? 'bg-gray-100 text-gray-600'}`}>
          {STATUS_LABELS[form.status] ?? form.status}
        </span>
        {PAYMENT_STATUS_LABELS[form.payment_status] && (
          <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${PAYMENT_STATUS_COLORS[form.payment_status]}`}>
            {PAYMENT_STATUS_LABELS[form.payment_status]}
          </span>
        )}
        {form.job_id && (
          <button onClick={() => navigate(`/jobs/${form.job_id}`)} className="text-xs text-teal-600 hover:underline">
            View source job →
          </button>
        )}
        {form.payment_status !== 'paid' && form.status !== 'draft' && Number(form.total) > 0 && (
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={handleSendWhatsapp} disabled={sending}
              className="bg-[#25D366] text-white px-4 py-1.5 rounded text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-colors">
              {sending ? 'Preparing…' : '📲 Send via WhatsApp'}
            </button>
            <button type="button" onClick={handlePreviewPayment} disabled={paying}
              title="Opens the checkout page in a new tab, exactly as the customer will see it — this does not charge you."
              className="bg-gray-100 text-gray-700 px-4 py-1.5 rounded text-sm font-semibold hover:bg-gray-200 disabled:opacity-50 transition-colors">
              {paying ? 'Opening…' : '👁 Preview Payment Page'}
            </button>
          </div>
        )}
        {form.payment_status === 'paid' && (
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={handleSendReceiptWhatsapp}
              className="bg-[#25D366] text-white px-4 py-1.5 rounded text-sm font-semibold hover:opacity-90 transition-colors">
              📲 Send Receipt
            </button>
            <button type="button" onClick={handleSendReceiptEmail} disabled={sendingEmail || !form.customers?.email}
              title={!form.customers?.email ? 'This customer has no email address on file' : ''}
              className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {sendingEmail ? 'Sending…' : '✉️ Email Receipt'}
            </button>
            <button type="button" onClick={() => setShowRefund(true)}
              className="bg-amber-100 text-amber-700 px-4 py-1.5 rounded text-sm font-semibold hover:bg-amber-200 transition-colors">
              Mark Refunded
            </button>
            <button type="button" onClick={handleMarkDisputed} disabled={actionBusy}
              className="bg-amber-100 text-amber-700 px-4 py-1.5 rounded text-sm font-semibold hover:bg-amber-200 disabled:opacity-50 transition-colors">
              Mark Disputed
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      <form id="invoice-detail-form" onSubmit={handleSave} className="space-y-6">
        <div className="grid grid-cols-2 gap-6">
          <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-3">
            <h2 className="text-sm font-bold text-blue-600 pb-2 border-b border-gray-100">Invoice Details</h2>

            <Field label="Status">
              {ro
                ? <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[form.status] ?? 'bg-gray-100 text-gray-600'}`}>{STATUS_LABELS[form.status] ?? form.status}</span>
                : <select value={form.status} onChange={e => set('status', e.target.value)} className={inputCls}>
                    {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                  </select>
              }
            </Field>

            <Field label="Customer">
              {ro
                ? <p className="py-1.5 text-sm text-gray-800">{form.customers?.customer_name || '—'}</p>
                : <select value={form.customer_id || ''} onChange={e => set('customer_id', e.target.value)} className={inputCls}>
                    <option value="">— None —</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.customer_name}</option>)}
                  </select>
              }
            </Field>

            <Field label="Title">
              {ro
                ? <p className="py-1.5 text-sm text-gray-800">{form.title || '—'}</p>
                : <input value={form.title || ''} onChange={e => set('title', e.target.value)} className={inputCls} />
              }
            </Field>

            <Field label="Issue Date">
              {ro
                ? <p className="py-1.5 text-sm text-gray-800">{formatDate(form.issue_date)}</p>
                : <input type="date" value={form.issue_date || ''} onChange={e => set('issue_date', e.target.value)} className={inputCls} />
              }
            </Field>

            <Field label="Due Date">
              {ro
                ? <p className="py-1.5 text-sm text-gray-800">{formatDate(form.due_date)}</p>
                : <input type="date" value={form.due_date || ''} onChange={e => set('due_date', e.target.value)} className={inputCls} />
              }
            </Field>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-3">
            <h2 className="text-sm font-bold text-blue-600 pb-2 border-b border-gray-100">Site Address</h2>

            <Field label="Address">
              {ro
                ? <p className="py-1.5 text-sm text-gray-800 whitespace-pre-line">{form.site_address || '—'}</p>
                : <textarea rows={2} value={form.site_address || ''} onChange={e => set('site_address', e.target.value)} className={`${inputCls} resize-none`} />
              }
            </Field>

            <Field label="City">
              {ro
                ? <p className="py-1.5 text-sm text-gray-800">{form.site_city || '—'}</p>
                : <input value={form.site_city || ''} onChange={e => set('site_city', e.target.value)} className={inputCls} />
              }
            </Field>

            <Field label="County">
              {ro
                ? <p className="py-1.5 text-sm text-gray-800">{form.site_county || '—'}</p>
                : <input value={form.site_county || ''} onChange={e => set('site_county', e.target.value)} className={inputCls} />
              }
            </Field>

            <Field label="Postcode">
              {ro
                ? <p className="py-1.5 text-sm text-gray-800">{form.site_postcode || '—'}</p>
                : <input value={form.site_postcode || ''} onChange={e => set('site_postcode', e.target.value)} className={inputCls} />
              }
            </Field>
          </div>
        </div>

        {technicians.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-bold text-blue-600 uppercase tracking-wider border-b border-gray-100 pb-2 mb-3">
              Technicians
            </h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  <th className="text-left pb-2">Technician</th>
                  <th className="text-left pb-2">Appointed Start</th>
                  <th className="text-left pb-2">Started</th>
                  <th className="text-left pb-2">Finished</th>
                </tr>
              </thead>
              <tbody>
                {technicians.map((t, i) => (
                  <tr key={i} className="border-t border-gray-50">
                    <td className="py-1.5 flex items-center gap-2">
                      <div
                        className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0"
                        style={{ backgroundColor: t.color || '#3B82F6' }}
                      >
                        {t.technician_name?.[0]?.toUpperCase()}
                      </div>
                      {t.technician_name}
                    </td>
                    <td className="py-1.5 text-gray-600">{formatDateTime(t.scheduled_start) || '—'}</td>
                    <td className="py-1.5 text-gray-600">{formatDateTime(t.actual_start) || '—'}</td>
                    <td className="py-1.5 text-gray-600">{formatDateTime(t.actual_end) || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {ro ? (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-bold text-blue-600 uppercase tracking-wider border-b border-gray-100 pb-2 mb-3">Line Items</h2>
            {lineItems.length === 0 ? (
              <p className="text-sm text-gray-400 py-2">No line items.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    <th className="text-left pb-2">Description</th>
                    <th className="text-right pb-2 w-20">Qty</th>
                    <th className="text-left pb-2 w-20">Unit</th>
                    <th className="text-right pb-2 w-28">Unit Price</th>
                    <th className="text-right pb-2 w-20">Tax %</th>
                    <th className="text-right pb-2 w-28">Line Total</th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((it, i) => (
                    <tr key={i} className="border-t border-gray-50">
                      <td className="py-1.5">{it.description}</td>
                      <td className="py-1.5 text-right">{it.quantity}</td>
                      <td className="py-1.5">{it.unit}</td>
                      <td className="py-1.5 text-right">{formatCurrency(it.unit_price)}</td>
                      <td className="py-1.5 text-right">{it.tax_rate}%</td>
                      <td className="py-1.5 text-right font-medium">{formatCurrency((Number(it.quantity) || 0) * (Number(it.unit_price) || 0))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="flex justify-end pt-3 mt-3 border-t border-gray-100">
              <div className="w-56 space-y-1 text-sm">
                <div className="flex justify-between text-gray-600"><span>Subtotal</span><span>{formatCurrency(form.subtotal)}</span></div>
                <div className="flex justify-between text-gray-600"><span>Tax</span><span>{formatCurrency(form.tax_total)}</span></div>
                <div className="flex justify-between font-bold text-gray-900 pt-1 border-t border-gray-100"><span>Total</span><span>{formatCurrency(form.total)}</span></div>
              </div>
            </div>
          </div>
        ) : (
          <LineItemsEditor items={lineItems} catalogue={catalogue} onChange={setLineItems} />
        )}

        <div className="grid grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-2">
            <h2 className="text-sm font-bold text-blue-600 uppercase tracking-wider border-b border-gray-100 pb-2">Notes</h2>
            {ro
              ? <p className="text-sm text-gray-800 whitespace-pre-line">{form.notes || '—'}</p>
              : <textarea rows={3} value={form.notes || ''} onChange={e => set('notes', e.target.value)} className={inputCls + ' resize-none'} />
            }
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-2">
            <h2 className="text-sm font-bold text-blue-600 uppercase tracking-wider border-b border-gray-100 pb-2">Terms</h2>
            {ro
              ? <p className="text-sm text-gray-800 whitespace-pre-line">{form.terms || '—'}</p>
              : <textarea rows={3} value={form.terms || ''} onChange={e => set('terms', e.target.value)} className={inputCls + ' resize-none'} />
            }
          </div>
        </div>
      </form>

      {events.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mt-6">
          <h2 className="text-sm font-bold text-blue-600 uppercase tracking-wider border-b border-gray-100 pb-2 mb-3">Payment History</h2>
          <div className="space-y-2">
            {events.map(ev => (
              <div key={ev.id} className="flex items-start justify-between text-sm border-b border-gray-50 pb-2 last:border-0 last:pb-0">
                <div>
                  <span className="font-medium text-gray-800">{EVENT_LABELS[ev.event_type] || ev.event_type}</span>
                  {ev.detail && <span className="text-gray-500"> — {ev.detail}</span>}
                  {ev.actor_name && <span className="text-gray-400"> · {ev.actor_name}</span>}
                </div>
                <span className="text-gray-400 whitespace-nowrap ml-3">{formatDateTime(ev.created_at)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {showRefund && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h3 className="text-base font-bold text-gray-900">Mark Invoice Refunded?</h3>
            <p className="text-sm text-gray-600">
              This records the refund in Savvy Works for your own tracking — it does <span className="font-semibold">not</span> process the refund in PayFast. Issue the actual refund from your PayFast dashboard first.
            </p>
            <textarea rows={2} value={refundReason} onChange={e => setRefundReason(e.target.value)}
              placeholder="Reason (optional)" className={inputCls + ' resize-none'} />
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={handleMarkRefunded} disabled={actionBusy}
                className="flex-1 bg-amber-600 text-white py-2 rounded text-sm font-semibold hover:bg-amber-700 disabled:opacity-50 transition-colors">
                {actionBusy ? 'Saving…' : 'Confirm Refunded'}
              </button>
              <button type="button" onClick={() => setShowRefund(false)}
                className="flex-1 border border-gray-300 text-gray-600 py-2 rounded text-sm font-medium hover:bg-gray-50 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h3 className="text-base font-bold text-gray-900">Delete Invoice?</h3>
            <p className="text-sm text-gray-600">
              This will permanently delete <span className="font-semibold">{form.title || form.invoice_ref}</span> and cannot be undone.
            </p>
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={handleDelete} disabled={deleting}
                className="flex-1 bg-red-600 text-white py-2 rounded text-sm font-semibold hover:bg-red-700 disabled:opacity-50 transition-colors">
                {deleting ? 'Deleting…' : 'Yes, Delete'}
              </button>
              <button type="button" onClick={() => setConfirmDelete(false)}
                className="flex-1 border border-gray-300 text-gray-600 py-2 rounded text-sm font-medium hover:bg-gray-50 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

    </PageContainer>
  )
}
