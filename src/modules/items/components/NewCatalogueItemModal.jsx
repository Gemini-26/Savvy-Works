import { useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { createItem } from '../services/itemService'
import { useCategories } from '../hooks/useCategories'
import { ITEM_TYPE_LABELS, ITEM_UNITS } from '../../../shared/constants/itemTypes'

const inputCls = 'w-full px-3 py-2 text-sm rounded border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white'

function Field({ label, required, span, children }) {
  return (
    <div className={span ? 'col-span-2' : ''}>
      <label className="block text-xs font-medium text-gray-500 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

// Quick-add a catalogue item without leaving the page (e.g. a job's
// Materials tab). Same fields and saving rules as Items → New Item; the
// saved item is handed back so the caller can drop it straight onto a line.
export default function NewCatalogueItemModal({ initialName = '', onCreated, onClose }) {
  const { categories } = useCategories()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [form, setForm] = useState({
    item_code: '', name: initialName, description: '', item_type: 'Product',
    unit: 'each', category_id: '', cost_price: '', sell_price: '', tax_rate: '15',
  })

  const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }))

  async function handleSubmit(e) {
    e.preventDefault()
    // The form sits inside the job page's own form; don't submit that too.
    e.stopPropagation()
    setSaving(true)
    setError(null)
    try {
      const item = await createItem({
        item_code:   form.item_code.trim() || null,
        name:        form.name.trim(),
        description: form.description.trim() || null,
        item_type:   form.item_type.toLowerCase(),
        unit:        form.unit,
        category_id: form.category_id || null,
        cost_price:  Number(form.cost_price) || 0,
        sell_price:  Number(form.sell_price) || 0,
        tax_rate:    Number(form.tax_rate) || 0,
      })
      await onCreated(item)
      onClose()
    } catch (err) {
      setError(err.message || 'Failed to save item')
      setSaving(false)
    }
  }

  // Portalled to <body>: callers can sit inside another <form>, and nested
  // forms are invalid HTML (the browser would drop this one).
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <form onSubmit={handleSubmit} onClick={e => e.stopPropagation()}
        className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-semibold text-gray-900">New catalogue item</h2>
            <p className="text-xs text-gray-500 mt-0.5">Saved to Items so it can be reused on any job, quote or invoice</p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 grid grid-cols-2 gap-3">
          <Field label="Name" required span>
            <input required autoFocus value={form.name} onChange={e => set('name', e.target.value)}
              placeholder="Item name" className={inputCls} />
          </Field>
          <Field label="Item Code">
            <input value={form.item_code} onChange={e => set('item_code', e.target.value)}
              placeholder="e.g. PLM-001" className={inputCls} />
          </Field>
          <Field label="Category">
            <select value={form.category_id} onChange={e => set('category_id', e.target.value)} className={inputCls}>
              <option value="">— Uncategorised —</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Type" required>
            <select value={form.item_type} onChange={e => set('item_type', e.target.value)} className={inputCls}>
              {ITEM_TYPE_LABELS.map(t => <option key={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Unit" required>
            <select value={form.unit} onChange={e => set('unit', e.target.value)} className={inputCls}>
              {ITEM_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </Field>
          <Field label="Cost Price (R)">
            <input type="number" step="0.01" min="0" value={form.cost_price}
              onChange={e => set('cost_price', e.target.value)} placeholder="0.00" className={inputCls} />
          </Field>
          <Field label="Sell Price (R)" required>
            <input required type="number" step="0.01" min="0" value={form.sell_price}
              onChange={e => set('sell_price', e.target.value)} placeholder="0.00" className={inputCls} />
          </Field>
          <Field label="Tax Rate (%)" required>
            <input required type="number" step="0.01" min="0" value={form.tax_rate}
              onChange={e => set('tax_rate', e.target.value)} className={inputCls} />
          </Field>
          <Field label="Description" span>
            <textarea rows={2} value={form.description} onChange={e => set('description', e.target.value)}
              placeholder="Optional description" className={inputCls + ' resize-none'} />
          </Field>

          {error && (
            <div className="col-span-2 bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded">{error}</div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 rounded-lg">Cancel</button>
          <button type="submit" disabled={saving}
            className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50">
            {saving ? 'Saving…' : 'Save & add'}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  )
}
