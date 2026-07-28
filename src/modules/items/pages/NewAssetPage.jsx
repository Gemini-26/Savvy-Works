import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PageContainer from '../../../shared/components/PageContainer.jsx'
import { createAsset, fetchTechnicians, assignAsset } from '../services/assetService'
import { useAssetCategories } from '../hooks/useAssetCategories'
import { useEffect } from 'react'

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

export default function NewAssetPage() {
  const navigate = useNavigate()
  const { categories } = useAssetCategories()
  const [technicians, setTechnicians] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => { fetchTechnicians().then(setTechnicians).catch(() => {}) }, [])

  const [form, setForm] = useState({
    name:          '',
    category_id:   '',
    item_kind:     'tool',
    barcode:       '',
    serial_number: '',
    value:         '',
    condition:     'Good',
    owner_id:      '',
    assign_to:     '',
  })

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const owned = Boolean(form.owner_id)
      const created = await createAsset({
        name:          form.name,
        category_id:   form.category_id || null,
        item_kind:     form.item_kind,
        barcode:       form.barcode || null,
        serial_number: form.serial_number || null,
        value:         Number(form.value) || 0,
        condition:     form.condition,
        owner_id:      form.owner_id || null,
        holder_id:     owned ? form.owner_id : null,
        status:        owned ? 'with_owner' : 'warehouse',
        since:         owned ? new Date().toISOString() : null,
      })
      if (form.assign_to && !owned && created) {
        await assignAsset(created.id, form.assign_to)
      }
      navigate('/items/assets/active')
    } catch (err) {
      setError(err.message || 'Failed to save asset')
      setSaving(false)
    }
  }

  return (
    <PageContainer>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">New Asset</h1>
        <div className="flex gap-2">
          <button
            type="submit"
            form="new-asset-form"
            disabled={saving}
            className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2 rounded text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
          >
            💾 {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/items/assets/active')}
            className="flex items-center gap-2 bg-blue-500 text-white px-5 py-2 rounded text-sm font-semibold hover:bg-blue-600"
          >
            ← Back
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded mb-4">{error}</div>
      )}

      <form id="new-asset-form" onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-5 max-w-3xl">
        <div className="grid grid-cols-2 gap-4">

          <Field label="Name" required span>
            <input required value={form.name} onChange={e => set('name', e.target.value)}
              placeholder="e.g. Bosch SDS Drill" className={inputCls} />
          </Field>

          <Field label="Category">
            <select value={form.category_id} onChange={e => set('category_id', e.target.value)} className={inputCls}>
              <option value="">— Uncategorised —</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>

          <Field label="Condition" required>
            <select required value={form.condition} onChange={e => set('condition', e.target.value)} className={inputCls}>
              <option>Good</option>
              <option>Fair</option>
              <option>Damaged</option>
            </select>
          </Field>

          <Field label="Kind" required>
            <select required value={form.item_kind} onChange={e => set('item_kind', e.target.value)} className={inputCls}>
              <option value="tool">Tool</option>
              <option value="inventory">Inventory</option>
            </select>
          </Field>

          <Field label="Barcode">
            <input value={form.barcode} onChange={e => set('barcode', e.target.value)}
              placeholder="e.g. BC-001" className={inputCls} />
          </Field>

          <Field label="Serial Number">
            <input value={form.serial_number} onChange={e => set('serial_number', e.target.value)}
              className={inputCls} />
          </Field>

          <Field label="Replacement Value (R)" required>
            <input required type="number" step="0.01" min="0" value={form.value}
              onChange={e => set('value', e.target.value)} placeholder="0.00" className={inputCls} />
          </Field>

          <Field label="Registered Owner">
            <select value={form.owner_id} onChange={e => set('owner_id', e.target.value)} className={inputCls}>
              <option value="">— Company tool (storeroom) —</option>
              {technicians.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
            </select>
          </Field>

          {!form.owner_id && (
            <Field label="Assign to technician now (optional)">
              <select value={form.assign_to} onChange={e => set('assign_to', e.target.value)} className={inputCls}>
                <option value="">— Leave in storeroom —</option>
                {technicians.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
              </select>
            </Field>
          )}

        </div>
      </form>
    </PageContainer>
  )
}
