import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { addDays, format } from 'date-fns'
import PageContainer from '../../../shared/components/PageContainer.jsx'
import { createPurchaseOrder } from '../services/purchaseOrderService'
import { useItems } from '../../quotes/hooks/useItems'
import LineItemsEditor from '../../quotes/components/LineItemsEditor'
import SupplierField from '../components/SupplierField'
import SiteField from '../../customers/components/SiteField'
import RefPicker from '../../../shared/components/RefPicker'
import { searchQuotesForRef, searchJobsForRef, searchInvoicesForRef } from '../utils/refSearch'

function today() {
  return new Date().toISOString().split('T')[0]
}

function addTerms(dateStr, days) {
  if (!dateStr) return ''
  return format(addDays(new Date(dateStr + 'T00:00:00'), Number(days) || 0), 'yyyy-MM-dd')
}

const inputCls = 'w-full px-3 py-2 text-sm rounded border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white'
const labelCls = 'block text-xs font-medium text-gray-500 mb-1'
const PAYMENT_TERMS_OPTIONS = [0, 7, 14, 30, 60, 90]
const STATUSES = ['draft', 'awaiting_approval', 'approved', 'rejected', 'actioned', 'paid']
const STATUS_LABELS = {
  draft: 'Draft', awaiting_approval: 'Awaiting Approval', approved: 'Approved',
  rejected: 'Rejected', actioned: 'Actioned', paid: 'Paid',
}

export default function NewPurchaseOrderPage() {
  const navigate = useNavigate()
  const { items: catalogue } = useItems()
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState(null)

  const [form, setForm] = useState({
    supplier_id: null,
    supplier_name: '',
    customer_id: null,
    site_id: null,
    expected_delivery_date: '',
    title: '',
    issue_date: today(),
    due_date: addTerms(today(), 30),
    reference: '',
    payment_terms_days: 30,
    quote_ref: null,
    job_ref: null,
    invoice_ref: null,
    status: 'draft',
    supplier_notes: '',
    delivery_notes: '',
    notes: '',
  })

  const [lineItems, setLineItems] = useState([])

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  // Keep the Payment Due Date in step with Purchase Date / Payment Terms
  // until the user has picked a supplier and is ready to save — it's a
  // convenience default, not a lock, so it stays a plain editable input.
  useEffect(() => {
    set('due_date', addTerms(form.issue_date, form.payment_terms_days))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.issue_date, form.payment_terms_days])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.supplier_id) {
      setError('Please select a supplier.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await createPurchaseOrder({
        supplier_id:  form.supplier_id,
        supplier_name: form.supplier_name,
        customer_id:  form.customer_id,
        site_id:      form.site_id,
        expected_delivery_date: form.expected_delivery_date || null,
        title:        form.title,
        issue_date:   form.issue_date,
        due_date:     form.due_date || null,
        reference:    form.reference || null,
        payment_terms_days: form.payment_terms_days,
        quote_id:     form.quote_ref?.id || null,
        job_id:       form.job_ref?.id || null,
        invoice_id:   form.invoice_ref?.id || null,
        status:       form.status,
        supplier_notes: form.supplier_notes || null,
        delivery_notes: form.delivery_notes || null,
        notes:        form.notes || null,
      }, lineItems)
      navigate('/finance/po/draft')
    } catch (err) {
      setError(err.message || 'Failed to save purchase order')
      setSaving(false)
    }
  }

  return (
    <PageContainer>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">New Purchase Order</h1>
        <div className="flex gap-2">
          <button type="submit" form="new-po-form" disabled={saving}
            className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2 rounded text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
            💾 {saving ? 'Saving…' : 'Save Purchase Order'}
          </button>
          <button type="button" onClick={() => navigate('/finance/po/draft')}
            className="flex items-center gap-2 bg-blue-500 text-white px-5 py-2 rounded text-sm font-semibold hover:bg-blue-600">
            ← Back
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      <form id="new-po-form" onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
            <h2 className="text-sm font-bold text-blue-600 uppercase tracking-wider border-b border-gray-100 pb-2">
              Supplier Details
            </h2>
            <SupplierField
              supplierId={form.supplier_id}
              onChange={supplier => { set('supplier_id', supplier?.id || null); set('supplier_name', supplier?.name || '') }}
            />
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
            <h2 className="text-sm font-bold text-blue-600 uppercase tracking-wider border-b border-gray-100 pb-2">
              Customer / Delivery Details
            </h2>
            <SiteField
              customerId={form.customer_id}
              siteId={form.site_id}
              expectedDeliveryDate={form.expected_delivery_date}
              onCustomerChange={id => { set('customer_id', id); set('site_id', null) }}
              onSiteChange={id => set('site_id', id)}
              onDateChange={d => set('expected_delivery_date', d)}
            />
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
            <h2 className="text-sm font-bold text-blue-600 uppercase tracking-wider border-b border-gray-100 pb-2">
              Purchase Order Details
            </h2>

            <div>
              <label className={labelCls}>Purchase Order Ref.</label>
              <p className="py-2 text-sm text-gray-500 italic">Auto-generated on save</p>
            </div>

            <div>
              <label className={labelCls}>Title / Summary</label>
              <input value={form.title} onChange={e => set('title', e.target.value)}
                placeholder="e.g. Copper pipe restock" className={inputCls} />
            </div>

            <div>
              <label className={labelCls}>Purchase Date <span className="text-red-500">*</span></label>
              <input type="date" required value={form.issue_date} onChange={e => set('issue_date', e.target.value)} className={inputCls} />
            </div>

            <div>
              <label className={labelCls}>Reference</label>
              <input value={form.reference} onChange={e => set('reference', e.target.value)}
                placeholder="Reference (if any)" className={inputCls} />
            </div>

            <RefPicker label="Quote Ref" placeholder="Quote Ref, if any" value={form.quote_ref}
              onChange={v => set('quote_ref', v)} searchFn={searchQuotesForRef} />
            <RefPicker label="Job Ref" placeholder="Job Ref, if any" value={form.job_ref}
              onChange={v => set('job_ref', v)} searchFn={searchJobsForRef} />
            <RefPicker label="Invoice Ref" placeholder="Invoice Ref, if any" value={form.invoice_ref}
              onChange={v => set('invoice_ref', v)} searchFn={searchInvoicesForRef} />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Payment Terms</label>
                <select value={form.payment_terms_days} onChange={e => set('payment_terms_days', Number(e.target.value))} className={inputCls}>
                  {PAYMENT_TERMS_OPTIONS.map(d => <option key={d} value={d}>{d} Days</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Payment Due Date</label>
                <input type="date" value={form.due_date} onChange={e => set('due_date', e.target.value)} className={inputCls} />
              </div>
            </div>

            <div>
              <label className={labelCls}>Status</label>
              <select value={form.status} onChange={e => set('status', e.target.value)} className={inputCls}>
                {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </select>
            </div>
          </div>
        </div>

        <LineItemsEditor items={lineItems} catalogue={catalogue} onChange={setLineItems} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-2">
            <h2 className="text-sm font-bold text-blue-600 uppercase tracking-wider border-b border-gray-100 pb-2">Supplier Notes</h2>
            <textarea rows={4} value={form.supplier_notes} onChange={e => set('supplier_notes', e.target.value)}
              placeholder="Notes for the supplier…" className={inputCls + ' resize-none'} />
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-2">
            <h2 className="text-sm font-bold text-blue-600 uppercase tracking-wider border-b border-gray-100 pb-2">Delivery Notes</h2>
            <textarea rows={4} value={form.delivery_notes} onChange={e => set('delivery_notes', e.target.value)}
              placeholder="Notes for delivery…" className={inputCls + ' resize-none'} />
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-2">
            <h2 className="text-sm font-bold text-blue-600 uppercase tracking-wider border-b border-gray-100 pb-2">Internal Notes</h2>
            <textarea rows={4} value={form.notes} onChange={e => set('notes', e.target.value)}
              placeholder="Internal notes (not shown to supplier)…" className={inputCls + ' resize-none'} />
          </div>
        </div>
      </form>
    </PageContainer>
  )
}
