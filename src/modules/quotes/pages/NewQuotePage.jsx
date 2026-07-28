import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PageContainer from '../../../shared/components/PageContainer.jsx'
import { createQuote } from '../services/quoteService'
import { useCustomers } from '../../../shared/hooks/useCustomers'
import { useProfiles } from '../../../shared/hooks/useProfiles'
import { useItems } from '../hooks/useItems'
import LineItemsEditor from '../components/LineItemsEditor'

function today() {
  return new Date().toISOString().split('T')[0]
}

function addDays(dateStr, n) {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

const inputCls = 'w-full px-3 py-2 text-sm rounded border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white'

export default function NewQuotePage() {
  const navigate = useNavigate()
  const { customers } = useCustomers()
  const { profiles } = useProfiles()
  const { items: catalogue } = useItems()
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState(null)

  const issueDate = today()

  const [form, setForm] = useState({
    customer_id: '',
    assigned_to: '',
    title: '',
    issue_date: issueDate,
    valid_until: addDays(issueDate, 30),
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
      await createQuote({
        ...form,
        customer_id: form.customer_id || null,
        assigned_to: form.assigned_to || null,
        valid_until: form.valid_until || null,
      }, lineItems)
      navigate('/quotes/draft')
    } catch (err) {
      setError(err.message || 'Failed to save quote')
      setSaving(false)
    }
  }

  return (
    <PageContainer>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">New Quote</h1>
        <div className="flex gap-2">
          <button type="submit" form="new-quote-form" disabled={saving}
            className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2 rounded text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
            💾 {saving ? 'Saving…' : 'Save Quote'}
          </button>
          <button type="button" onClick={() => navigate('/quotes/draft')}
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

      <form id="new-quote-form" onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-2 gap-6">

          {/* Quote details */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            <h2 className="text-sm font-bold text-blue-600 uppercase tracking-wider border-b border-gray-100 pb-2">
              Quote Details
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

              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-500 mb-1">Assigned Technician</label>
                <select value={form.assigned_to} onChange={e => set('assigned_to', e.target.value)} className={inputCls}>
                  <option value="">— Unassigned —</option>
                  {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Issue Date</label>
                <input type="date" value={form.issue_date} onChange={e => set('issue_date', e.target.value)} className={inputCls} />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Valid Until</label>
                <input type="date" value={form.valid_until} onChange={e => set('valid_until', e.target.value)} className={inputCls} />
              </div>
            </div>
          </div>

          {/* Site */}
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
              placeholder="Payment terms, validity, etc…" className={inputCls + ' resize-none'} />
          </div>
        </div>
      </form>
    </PageContainer>
  )
}
