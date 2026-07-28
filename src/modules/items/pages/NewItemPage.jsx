import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PageContainer from '../../../shared/components/PageContainer.jsx'
import { createItem } from '../services/itemService'
import { useCategories } from '../hooks/useCategories'
import { ITEM_TYPE_LABELS, ITEM_UNITS } from '../../../shared/constants/itemTypes'

const inputCls = 'w-full px-3 py-2 text-sm rounded border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white'

function Field({ label, required, children, span }) {
  return (
    <div className={span ? 'col-span-2' : ''}>
      <label className="block text-xs font-medium text-gray-500 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

export default function NewItemPage() {
  const navigate = useNavigate()
  const { categories } = useCategories()
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState(null)

  const [form, setForm] = useState({
    item_code:   '',
    name:        '',
    description: '',
    item_type:   'Product',
    unit:        'each',
    category_id: '',
    cost_price:  '',
    sell_price:  '',
    tax_rate:    '15',
  })

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await createItem({
        item_code:   form.item_code || null,
        name:        form.name,
        description: form.description || null,
        item_type:   form.item_type.toLowerCase(),
        unit:        form.unit,
        category_id: form.category_id || null,
        cost_price:  Number(form.cost_price) || 0,
        sell_price:  Number(form.sell_price) || 0,
        tax_rate:    Number(form.tax_rate) || 0,
      })
      navigate('/items/products')
    } catch (err) {
      setError(err.message || 'Failed to save item')
      setSaving(false)
    }
  }

  return (
    <PageContainer>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">New Item</h1>
        <div className="flex gap-2">
          <button
            type="submit"
            form="new-item-form"
            disabled={saving}
            className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2 rounded text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
          >
            💾 {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/items/products')}
            className="flex items-center gap-2 bg-blue-500 text-white px-5 py-2 rounded text-sm font-semibold hover:bg-blue-600"
          >
            ← Back
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      <form id="new-item-form" onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-5 max-w-3xl">
        <div className="grid grid-cols-2 gap-4">

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

          <Field label="Name" required span>
            <input required value={form.name} onChange={e => set('name', e.target.value)}
              placeholder="Item name" className={inputCls} />
          </Field>

          <Field label="Description" span>
            <textarea rows={2} value={form.description} onChange={e => set('description', e.target.value)}
              placeholder="Optional description" className={inputCls + ' resize-none'} />
          </Field>

          <Field label="Type" required>
            <select required value={form.item_type} onChange={e => set('item_type', e.target.value)} className={inputCls}>
              {ITEM_TYPE_LABELS.map(t => <option key={t}>{t}</option>)}
            </select>
          </Field>

          <Field label="Unit" required>
            <select required value={form.unit} onChange={e => set('unit', e.target.value)} className={inputCls}>
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

        </div>
      </form>
    </PageContainer>
  )
}
