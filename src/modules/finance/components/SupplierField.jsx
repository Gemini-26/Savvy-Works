import { useState } from 'react'
import { useSuppliers } from '../../../shared/hooks/useSuppliers'
import { createSupplier } from '../services/supplierService'

const inputCls = 'w-full px-3 py-2 text-sm rounded border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white'
const labelCls = 'block text-xs font-medium text-gray-500 mb-1'

const emptyDraft = { name: '', contact_name: '', email: '', phone: '', mobile: '', address: '', city: '', county: '', postcode: '' }

// Supplier picker for Purchase Orders — the "suppliers" table existed but had
// zero rows and no UI anywhere before this. Selecting a supplier shows its
// contact/address details (read-only, sourced straight from the suppliers
// row); "+ New Supplier" creates one inline without leaving the page.
export default function SupplierField({ supplierId, onChange }) {
  const { suppliers, loading, reload } = useSuppliers()
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState(emptyDraft)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const selected = suppliers.find(s => s.id === supplierId) || null

  function setDraftField(field, value) {
    setDraft(prev => ({ ...prev, [field]: value }))
  }

  async function handleCreate() {
    if (!draft.name.trim()) {
      setError('Supplier name is required.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const supplier = await createSupplier(draft)
      await reload()
      onChange(supplier)
      setCreating(false)
      setDraft(emptyDraft)
    } catch (err) {
      setError(err.message || 'Failed to create supplier')
    } finally {
      setSaving(false)
    }
  }

  if (creating) {
    return (
      <div className="border border-gray-200 rounded p-3 space-y-2 bg-gray-50">
        <p className="text-xs font-semibold text-gray-600">New Supplier</p>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <input placeholder="Supplier name" value={draft.name} onChange={e => setDraftField('name', e.target.value)} className={inputCls} />
        <input placeholder="Contact name" value={draft.contact_name} onChange={e => setDraftField('contact_name', e.target.value)} className={inputCls} />
        <div className="grid grid-cols-2 gap-2">
          <input placeholder="Telephone" value={draft.phone} onChange={e => setDraftField('phone', e.target.value)} className={inputCls} />
          <input placeholder="Mobile" value={draft.mobile} onChange={e => setDraftField('mobile', e.target.value)} className={inputCls} />
        </div>
        <input placeholder="Email" type="email" value={draft.email} onChange={e => setDraftField('email', e.target.value)} className={inputCls} />
        <input placeholder="Address" value={draft.address} onChange={e => setDraftField('address', e.target.value)} className={inputCls} />
        <div className="grid grid-cols-3 gap-2">
          <input placeholder="City" value={draft.city} onChange={e => setDraftField('city', e.target.value)} className={inputCls} />
          <input placeholder="County" value={draft.county} onChange={e => setDraftField('county', e.target.value)} className={inputCls} />
          <input placeholder="Postcode" value={draft.postcode} onChange={e => setDraftField('postcode', e.target.value)} className={inputCls} />
        </div>
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={handleCreate} disabled={saving} className="bg-blue-600 text-white px-3 py-1.5 rounded text-xs font-semibold hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Saving…' : 'Save Supplier'}
          </button>
          <button type="button" onClick={() => { setCreating(false); setError(null) }} className="px-3 py-1.5 rounded text-xs font-medium border border-gray-300 text-gray-600 hover:bg-gray-100">
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <label className={labelCls}>Supplier <span className="text-red-500">*</span></label>
      <div className="flex items-center gap-2">
        <select
          required
          value={supplierId || ''}
          onChange={e => onChange(suppliers.find(s => s.id === e.target.value) || null)}
          className={inputCls}
        >
          <option value="">{loading ? 'Loading…' : 'Select Supplier'}</option>
          {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <button type="button" onClick={() => setCreating(true)} title="New Supplier"
          className="shrink-0 w-9 h-9 flex items-center justify-center rounded border border-gray-300 text-gray-600 hover:bg-gray-100">
          +
        </button>
      </div>

      {selected && (
        <div className="mt-2 text-xs text-gray-600 bg-gray-50 border border-gray-100 rounded p-2 space-y-0.5">
          {selected.contact_name && <p>{selected.contact_name}</p>}
          {selected.address && <p>{selected.address}</p>}
          {(selected.city || selected.county || selected.postcode) && (
            <p>{[selected.city, selected.county, selected.postcode].filter(Boolean).join(', ')}</p>
          )}
          {selected.phone && <p>Tel: {selected.phone}</p>}
          {selected.mobile && <p>Mobile: {selected.mobile}</p>}
          {selected.email && <p>{selected.email}</p>}
        </div>
      )}
    </div>
  )
}
