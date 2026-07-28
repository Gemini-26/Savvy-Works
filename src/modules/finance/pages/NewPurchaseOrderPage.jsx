import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PageContainer from '../../../shared/components/PageContainer.jsx'
import { createPurchaseOrder } from '../services/purchaseOrderService'
import { useItems } from '../../quotes/hooks/useItems'
import LineItemsEditor from '../../quotes/components/LineItemsEditor'

function today() {
  return new Date().toISOString().split('T')[0]
}

const inputCls = 'w-full px-3 py-2 text-sm rounded border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white'

export default function NewPurchaseOrderPage() {
  const navigate = useNavigate()
  const { items: catalogue } = useItems()
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState(null)

  const [form, setForm] = useState({
    supplier_name: '',
    title: '',
    issue_date: today(),
    due_date: '',
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
      await createPurchaseOrder({
        ...form,
        due_date: form.due_date || null,
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
        <div className="grid grid-cols-2 gap-6">

          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            <h2 className="text-sm font-bold text-blue-600 uppercase tracking-wider border-b border-gray-100 pb-2">
              Purchase Order Details
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Supplier <span className="text-red-500">*</span>
                </label>
                <input required value={form.supplier_name} onChange={e => set('supplier_name', e.target.value)}
                  placeholder="Supplier name" className={inputCls} />
              </div>

              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-500 mb-1">Title / Summary</label>
                <input value={form.title} onChange={e => set('title', e.target.value)}
                  placeholder="e.g. Copper pipe restock" className={inputCls} />
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

          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-2">
            <h2 className="text-sm font-bold text-blue-600 uppercase tracking-wider border-b border-gray-100 pb-2">Notes</h2>
            <textarea rows={3} value={form.notes} onChange={e => set('notes', e.target.value)}
              placeholder="Notes for the supplier…" className={inputCls + ' resize-none'} />
          </div>
        </div>

        <LineItemsEditor items={lineItems} catalogue={catalogue} onChange={setLineItems} />

        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-2">
          <h2 className="text-sm font-bold text-blue-600 uppercase tracking-wider border-b border-gray-100 pb-2">Terms</h2>
          <textarea rows={3} value={form.terms} onChange={e => set('terms', e.target.value)}
            placeholder="Payment terms, delivery terms, etc…" className={inputCls + ' resize-none'} />
        </div>
      </form>
    </PageContainer>
  )
}
