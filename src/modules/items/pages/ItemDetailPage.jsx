import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import PageContainer from '../../../shared/components/PageContainer.jsx'
import { fetchItem, updateItem, deleteItem } from '../services/itemService'
import { useCategories } from '../hooks/useCategories'
import { ITEM_TYPE_LABELS, ITEM_UNITS } from '../../../shared/constants/itemTypes'
import { formatCurrency } from '../../../shared/utils/formatCurrency'

const inputCls    = 'w-full px-3 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white'

function Field({ label, children }) {
  return (
    <div className="flex items-start gap-3">
      <label className="w-32 shrink-0 pt-1.5 text-sm text-gray-600 text-right">{label}</label>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  )
}

function toDisplayType(raw) {
  if (!raw) return 'Product'
  return raw.charAt(0).toUpperCase() + raw.slice(1)
}

export default function ItemDetailPage() {
  const { id }   = useParams()
  const navigate = useNavigate()
  const { categories } = useCategories()

  const [editing,       setEditing]       = useState(false)
  const [loading,       setLoading]       = useState(true)
  const [saving,        setSaving]        = useState(false)
  const [deleting,      setDeleting]      = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error,         setError]         = useState(null)
  const [form,          setForm]          = useState(null)

  useEffect(() => {
    fetchItem(id)
      .then(data => { setForm(dbToForm(data)); setLoading(false) })
      .catch(err  => { setError(err.message || 'Failed to load item'); setLoading(false) })
  }, [id])

  function dbToForm(d) {
    return {
      item_code:   d.item_code   ?? '',
      name:        d.name        ?? '',
      description: d.description ?? '',
      item_type:   toDisplayType(d.item_type),
      unit:        d.unit        ?? 'each',
      category_id: d.category_id ?? '',
      cost_price:  d.cost_price  ?? 0,
      sell_price:  d.sell_price  ?? 0,
      tax_rate:    d.tax_rate    ?? 15,
      active:      d.active      ?? true,
    }
  }

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await updateItem(id, {
        item_code:   form.item_code || null,
        name:        form.name,
        description: form.description || null,
        item_type:   form.item_type.toLowerCase(),
        unit:        form.unit,
        category_id: form.category_id || null,
        cost_price:  Number(form.cost_price) || 0,
        sell_price:  Number(form.sell_price) || 0,
        tax_rate:    Number(form.tax_rate) || 0,
        active:      form.active,
      })
      setEditing(false)
    } catch (err) {
      setError(err.message || 'Failed to save changes')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      await deleteItem(id)
      navigate(-1)
    } catch (err) {
      setError(err.message || 'Failed to delete item')
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  if (loading) return <PageContainer><p className="text-sm text-gray-400 mt-8">Loading item…</p></PageContainer>
  if (!form)   return <PageContainer><p className="text-sm text-red-500 mt-8">{error || 'Item not found.'}</p></PageContainer>

  const ro = !editing

  return (
    <PageContainer>

      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-900">{form.name || form.item_code || 'Item'}</h1>
        <div className="flex gap-2">
          {editing ? (
            <>
              <button type="submit" form="item-detail-form" disabled={saving}
                className="flex items-center gap-1.5 bg-blue-600 text-white px-4 py-2 rounded text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors">
                💾 {saving ? 'Saving…' : 'Save'}
              </button>
              <button type="button" onClick={() => { setEditing(false); setError(null) }}
                className="px-4 py-2 rounded text-sm font-medium border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors">
                Cancel
              </button>
            </>
          ) : (
            <button type="button" onClick={() => setEditing(true)}
              className="flex items-center gap-1.5 bg-blue-600 text-white px-4 py-2 rounded text-sm font-semibold hover:bg-blue-700 transition-colors">
              ✏️ Edit
            </button>
          )}
          <button type="button" onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 bg-blue-500 text-white px-4 py-2 rounded text-sm font-semibold hover:bg-blue-600 transition-colors">
            ← Back
          </button>
          <button type="button" onClick={() => setConfirmDelete(true)}
            className="flex items-center gap-1.5 bg-red-600 text-white px-4 py-2 rounded text-sm font-semibold hover:bg-red-700 transition-colors">
            🗑 Delete
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded mb-3">{error}</div>
      )}

      <form id="item-detail-form" onSubmit={handleSave}>
        <div className="bg-white border border-gray-200 rounded-xl p-6 max-w-2xl space-y-3">

          <Field label="Item Code">
            {ro ? <p className="py-1.5 text-sm text-gray-800 font-mono">{form.item_code || '—'}</p>
                : <input value={form.item_code} onChange={e => set('item_code', e.target.value)} className={inputCls} />}
          </Field>

          <Field label="Name">
            {ro ? <p className="py-1.5 text-sm text-gray-800">{form.name}</p>
                : <input required value={form.name} onChange={e => set('name', e.target.value)} className={inputCls} />}
          </Field>

          <Field label="Description">
            {ro ? <p className="py-1.5 text-sm text-gray-800 whitespace-pre-line">{form.description || '—'}</p>
                : <textarea rows={2} value={form.description} onChange={e => set('description', e.target.value)} className={`${inputCls} resize-none`} />}
          </Field>

          <Field label="Category">
            {ro ? <p className="py-1.5 text-sm text-gray-800">{categories.find(c => c.id === form.category_id)?.name || '—'}</p>
                : <select value={form.category_id} onChange={e => set('category_id', e.target.value)} className={inputCls}>
                    <option value="">— Uncategorised —</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>}
          </Field>

          <Field label="Type">
            {ro ? <p className="py-1.5 text-sm text-gray-800">{form.item_type}</p>
                : <select value={form.item_type} onChange={e => set('item_type', e.target.value)} className={inputCls}>
                    {ITEM_TYPE_LABELS.map(t => <option key={t}>{t}</option>)}
                  </select>}
          </Field>

          <Field label="Unit">
            {ro ? <p className="py-1.5 text-sm text-gray-800">{form.unit}</p>
                : <select value={form.unit} onChange={e => set('unit', e.target.value)} className={inputCls}>
                    {ITEM_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>}
          </Field>

          <Field label="Cost Price">
            {ro ? <p className="py-1.5 text-sm text-gray-800">{formatCurrency(form.cost_price)}</p>
                : <input type="number" step="0.01" min="0" value={form.cost_price} onChange={e => set('cost_price', e.target.value)} className={inputCls} />}
          </Field>

          <Field label="Sell Price">
            {ro ? <p className="py-1.5 text-sm text-gray-800 font-semibold">{formatCurrency(form.sell_price)}</p>
                : <input required type="number" step="0.01" min="0" value={form.sell_price} onChange={e => set('sell_price', e.target.value)} className={inputCls} />}
          </Field>

          <Field label="Tax Rate">
            {ro ? <p className="py-1.5 text-sm text-gray-800">{Number(form.tax_rate)}%</p>
                : <input required type="number" step="0.01" min="0" value={form.tax_rate} onChange={e => set('tax_rate', e.target.value)} className={inputCls} />}
          </Field>

          <Field label="Active">
            {ro ? <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${form.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {form.active ? 'Active' : 'Inactive'}
                  </span>
                : <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input type="checkbox" checked={form.active} onChange={e => set('active', e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600" />
                    Active
                  </label>}
          </Field>

        </div>
      </form>

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h3 className="text-base font-bold text-gray-900">Delete Item?</h3>
            <p className="text-sm text-gray-600">
              This will permanently delete <span className="font-semibold">{form.name}</span> and cannot be undone.
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
