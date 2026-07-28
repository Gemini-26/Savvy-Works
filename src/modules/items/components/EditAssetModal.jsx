import { useState } from 'react'
import { updateAsset } from '../services/assetService'

const inputCls = 'w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white'

export default function EditAssetModal({ asset, categories, onClose, onSaved }) {
  const [form, setForm] = useState({
    name:          asset.name || '',
    category_id:   asset.category_id || '',
    item_kind:     asset.item_kind || 'tool',
    barcode:       asset.barcode || '',
    serial_number: asset.serial_number || '',
    value:         asset.value ?? '',
    condition:     asset.condition || 'Good',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      await updateAsset(asset.id, {
        name:          form.name,
        category_id:   form.category_id || null,
        item_kind:     form.item_kind,
        barcode:       form.barcode || null,
        serial_number: form.serial_number || null,
        value:         Number(form.value) || 0,
        condition:     form.condition,
      })
      onSaved()
    } catch (err) {
      setError(err.message || 'Failed to save changes')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-900">Edit {asset.name}</h2>
          <button onClick={onClose} className="text-sm text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <div className="p-5 space-y-3">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 rounded-lg">{error}</div>}

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Name</label>
            <input value={form.name} onChange={e => set('name', e.target.value)} className={inputCls} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Category</label>
              <select value={form.category_id} onChange={e => set('category_id', e.target.value)} className={inputCls}>
                <option value="">— Uncategorised —</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Kind</label>
              <select value={form.item_kind} onChange={e => set('item_kind', e.target.value)} className={inputCls}>
                <option value="tool">Tool</option>
                <option value="inventory">Inventory</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Barcode</label>
              <input value={form.barcode} onChange={e => set('barcode', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Serial Number</label>
              <input value={form.serial_number} onChange={e => set('serial_number', e.target.value)} className={inputCls} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Value (R)</label>
              <input type="number" step="0.01" min="0" value={form.value} onChange={e => set('value', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Condition</label>
              <select value={form.condition} onChange={e => set('condition', e.target.value)} className={inputCls}>
                <option>Good</option>
                <option>Fair</option>
                <option>Damaged</option>
              </select>
            </div>
          </div>
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex gap-2">
          <button onClick={onClose} className="flex-1 px-3 py-2 rounded-lg text-sm font-medium border border-gray-200 text-gray-600">Cancel</button>
          <button disabled={saving || !form.name.trim()} onClick={handleSave}
            className="flex-1 px-3 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white disabled:opacity-50">
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  )
}
