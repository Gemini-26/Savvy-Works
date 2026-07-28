import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PageContainer from '../../../shared/components/PageContainer.jsx'
import { createInvoice } from '../services/invoiceService'
import { useCustomers } from '../../../shared/hooks/useCustomers'
import { useItems } from '../../quotes/hooks/useItems'
import LineItemsEditor from '../../quotes/components/LineItemsEditor'

function today() {
  return new Date().toISOString().split('T')[0]
}

function addDays(dateStr, n) {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

const inputCls = 'w-full px-3 py-2 text-sm rounded border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white'

export default function NewInvoicePage() {
  const navigate = useNavigate()
  const { customers } = useCustomers()
  const { items: catalogue } = useItems()
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState(null)

  const issueDate = today()

  const [form, setForm] = useState({
    customer_id: '',
    title: '',
    issue_date: issueDate,
    due_date: addDays(issueDate, 30),
    site_address: '',
    site_city: '',
    site_county: '',
    site_postcode: '',
    notes: '',
    terms: '',
    status: 'draft',
  })

  const [lineItems, setLineItems] = useState([])

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await createInvoice({
        ...form,
        customer_id: form.customer_id || null,
        due_date: form.due_date || null,
      }, lineItems)
      navigate('/finance/invoices/draft')
    } catch (err) {
      setError(err.message || 'Failed to save invoice')
      setSaving(false)
    }
  }

  return (
    <PageContainer>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">New Invoice</h1>
        <div className="flex gap-2">
          <button type="submit" form="new-invoice-form" disabled={saving}
            className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2 rounded text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
            💾 {saving ? 'Saving…' : 'Save Invoice'}
          </button>
          <button type="button" onClick={() => navigate('/finance/invoices/draft')}
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

      <form id="new-invoice-form" onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-2 gap-6">

          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            <h2 className="text-sm font-bold text-blue-600 uppercase tracking-wider border-b border-gray-100 pb-2">
              Invoice Details
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Customer <span className="text-red-500">*</span>
                </label>
                <select required value={form.customer_id} onChange={e => set('customer_id', e.target.value)} className={inputCls}>
                  <option value="">Select Customer</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.customer_name}</option>)}
                </select>
              </div>

              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-500 mb-1">Title / Summary</label>
                <input value={form.title} onChange={e => set('title', e.target.value)}
                  placeholder="e.g. Bathroom re-piping" className={inputCls} />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Issue Date</label>
                <input type="date" value={form.issue_date} onChange={e => set('issue_date', e.target.value)} className={inputCls} />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Due Date</label>
                <input type="date" value={form.due_date} onChange={e => set('due_date', e.target.value)} className={inputCls} />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            <h2 className="text-sm font-bold text-blue-600 uppercase tracking-wider border-b border-gray-100 pb-2">
              Site Address
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-500 mb-1">Address</label>
                <textarea rows={2} value={form.site_address} onChange={e => set('site_address', e.target.value)}
                  className={inputCls + ' resize-none'} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">City</label>
                <input value={form.site_city} onChange={e => set('site_city', e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">County</label>
                <input value={form.site_county} onChange={e => set('site_county', e.target.value)} className={inputCls} />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-500 mb-1">Postcode</label>
                <input value={form.site_postcode} onChange={e => set('site_postcode', e.target.value)} className={inputCls} />
              </div>
            </div>
          </div>
        </div>

        <LineItemsEditor items={lineItems} catalogue={catalogue} onChange={setLineItems} />

        <div className="grid grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-2">
            <h2 className="text-sm font-bold text-blue-600 uppercase tracking-wider border-b border-gray-100 pb-2">Notes</h2>
            <textarea rows={3} value={form.notes} onChange={e => set('notes', e.target.value)}
              placeholder="Notes visible to the customer…" className={inputCls + ' resize-none'} />
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-2">
            <h2 className="text-sm font-bold text-blue-600 uppercase tracking-wider border-b border-gray-100 pb-2">Terms</h2>
            <textarea rows={3} value={form.terms} onChange={e => set('terms', e.target.value)}
              placeholder="Payment terms, banking details, etc…" className={inputCls + ' resize-none'} />
          </div>
        </div>
      </form>
    </PageContainer>
  )
}
