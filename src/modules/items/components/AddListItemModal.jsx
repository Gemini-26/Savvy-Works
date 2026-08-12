import { useEffect, useState } from 'react'
import { fetchAssets, fetchAssetCategories, createAsset, assignAsset, addListItem } from '../services/assetService'

const inputCls = 'w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white'

export default function AddListItemModal({ list, listType, technicianId, onClose, onAdded }) {
  const [mode, setMode] = useState('existing') // 'existing' | 'new'
  const [storeroomItems, setStoreroomItems] = useState([])
  const [categories, setCategories] = useState([])
  const [selectedAssetId, setSelectedAssetId] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [newName, setNewName] = useState('')
  const [newCategoryId, setNewCategoryId] = useState('')
  const [newValue, setNewValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchAssets({ assetGroup: 'tool_inventory', activeOnly: true }).then(all =>
      setStoreroomItems(all.filter(a => a.status === 'warehouse' && a.item_kind === (listType === 'tools' ? 'tool' : 'inventory')))
    ).catch(err => setError(err.message))
    fetchAssetCategories().then(setCategories).catch(() => {})
  }, [listType])

  async function handleAddExisting() {
    if (!selectedAssetId) return
    setSaving(true)
    setError(null)
    try {
      await assignAsset(selectedAssetId, technicianId)
      await addListItem(list.id, selectedAssetId, Math.max(1, Number(quantity) || 1))
      onAdded()
    } catch (err) {
      setError(err.message || 'Failed to add item')
    } finally {
      setSaving(false)
    }
  }

  async function handleCreateNew() {
    if (!newName.trim()) return
    setSaving(true)
    setError(null)
    try {
      const created = await createAsset({
        name: newName,
        category_id: newCategoryId || null,
        item_kind: listType === 'tools' ? 'tool' : 'inventory',
        asset_group: 'tool_inventory',
        value: Number(newValue) || 0,
        condition: 'Good',
        owner_id: technicianId,
        holder_id: technicianId,
        status: 'with_owner',
        since: new Date().toISOString(),
      })
      await addListItem(list.id, created.id, Math.max(1, Number(quantity) || 1))
      onAdded()
    } catch (err) {
      setError(err.message || 'Failed to create item')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-900">Add {listType === 'tools' ? 'tool' : 'inventory item'}</h2>
          <button onClick={onClose} className="text-sm text-gray-400 hover:text-gray-600">✕</button>
        </div>

        <div className="flex gap-1 px-5 pt-3">
          {[{ key: 'existing', label: 'From storeroom' }, { key: 'new', label: 'Create new' }].map(t => (
            <button key={t.key} onClick={() => setMode(t.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full ${mode === t.key ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-5 space-y-3">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 rounded-lg">{error}</div>}

          {mode === 'existing' ? (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Storeroom item</label>
              <select value={selectedAssetId} onChange={e => setSelectedAssetId(e.target.value)} className={inputCls}>
                <option value="">— Select —</option>
                {storeroomItems.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              {storeroomItems.length === 0 && <p className="text-xs text-gray-400 mt-1">Nothing available in the storeroom — create a new one instead.</p>}
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Name</label>
                <input value={newName} onChange={e => setNewName(e.target.value)} className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Category</label>
                  <select value={newCategoryId} onChange={e => setNewCategoryId(e.target.value)} className={inputCls}>
                    <option value="">— Uncategorised —</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Value (R)</label>
                  <input type="number" step="0.01" min="0" value={newValue} onChange={e => setNewValue(e.target.value)} className={inputCls} />
                </div>
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Quantity</label>
            <input type="number" step="1" min="1" value={quantity} onChange={e => setQuantity(e.target.value)} className={inputCls} />
          </div>
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex gap-2">
          <button onClick={onClose} className="flex-1 px-3 py-2 rounded-lg text-sm font-medium border border-gray-200 text-gray-600">Cancel</button>
          <button
            disabled={saving || (mode === 'existing' ? !selectedAssetId : !newName.trim())}
            onClick={mode === 'existing' ? handleAddExisting : handleCreateNew}
            className="flex-1 px-3 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white disabled:opacity-50">
            {saving ? 'Adding…' : 'Add'}
          </button>
        </div>
      </div>
    </div>
  )
}
