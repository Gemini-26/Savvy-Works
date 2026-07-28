import { useEffect, useState } from 'react'
import PageContainer from '../../../shared/components/PageContainer.jsx'
import PageHeader from '../../../shared/components/PageHeader'
import EmptyState from '../../../shared/components/EmptyState'
import {
  fetchAssetLists, createAssetList, updateAssetList, deleteAssetList,
  duplicateAssetList, addListItem, removeListItem, fetchAssets, fetchTechnicians,
} from '../services/assetService'
import { formatCurrency } from '../../../shared/utils/formatCurrency'

const inputCls = 'w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white'

function ListEditorModal({ list, listType, technicians, allAssets, onClose, onSaved }) {
  const [name, setName] = useState(list?.name || '')
  const [assignedTo, setAssignedTo] = useState(list?.assigned_to || '')
  const [items, setItems] = useState(list?.items || [])
  const [addAssetId, setAddAssetId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const availableAssets = allAssets.filter(a => a.item_kind === (listType === 'tools' ? 'tool' : 'inventory'))

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      if (list) {
        await updateAssetList(list.id, { name, assignedTo: assignedTo || null })
      } else {
        const created = await createAssetList({
          name, listType, assignedTo: assignedTo || null,
          assetIds: items.map(i => i.asset.id),
        })
        onSaved(created)
        return
      }
      onSaved()
    } catch (err) {
      setError(err.message || 'Failed to save list')
    } finally {
      setSaving(false)
    }
  }

  async function handleAddItem() {
    if (!addAssetId) return
    const asset = allAssets.find(a => a.id === addAssetId)
    if (!asset) return
    if (list) {
      await addListItem(list.id, addAssetId).catch(err => setError(err.message))
      setItems(prev => [...prev, { id: `temp-${addAssetId}`, asset, quantity: 1 }])
    } else {
      setItems(prev => [...prev, { id: `temp-${addAssetId}`, asset, quantity: 1 }])
    }
    setAddAssetId('')
  }

  async function handleRemoveItem(item) {
    if (list && !String(item.id).startsWith('temp-')) {
      await removeListItem(item.id).catch(err => setError(err.message))
    }
    setItems(prev => prev.filter(i => i.id !== item.id))
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-lg max-h-[85vh] flex flex-col">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-900">{list ? 'Edit list' : `New ${listType} list`}</h2>
          <button onClick={onClose} className="text-sm text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <div className="p-5 space-y-3 overflow-y-auto">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 rounded-lg">{error}</div>}

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">List name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder='e.g. "Test Technician Tools"' className={inputCls} />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Assign to technician</label>
            <select value={assignedTo} onChange={e => setAssignedTo(e.target.value)} className={inputCls}>
              <option value="">— Unassigned —</option>
              {technicians.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Items</label>
            <div className="flex gap-2 mb-2">
              <select value={addAssetId} onChange={e => setAddAssetId(e.target.value)} className={inputCls}>
                <option value="">— Select {listType === 'tools' ? 'a tool' : 'an inventory item'} —</option>
                {availableAssets.filter(a => !items.some(i => i.asset.id === a.id)).map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
              <button type="button" onClick={handleAddItem} className="px-3 py-2 text-sm font-semibold bg-gray-100 rounded-lg text-gray-700 shrink-0">Add</button>
            </div>
            {items.length === 0 ? (
              <p className="text-xs text-gray-400">No items added yet.</p>
            ) : (
              <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
                {items.map(item => (
                  <li key={item.id} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span className="text-gray-900">{item.asset.name}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-500">{formatCurrency(item.asset.value)}</span>
                      <button onClick={() => handleRemoveItem(item)} className="text-xs text-red-600">Remove</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex gap-2">
          <button onClick={onClose} className="flex-1 px-3 py-2 rounded-lg text-sm font-medium border border-gray-200 text-gray-600">Cancel</button>
          <button disabled={saving || !name.trim()} onClick={handleSave}
            className="flex-1 px-3 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white disabled:opacity-50">
            {saving ? 'Saving…' : 'Save list'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function AssetListsPage() {
  const [tab, setTab] = useState('tools')
  const [lists, setLists] = useState([])
  const [technicians, setTechnicians] = useState([])
  const [allAssets, setAllAssets] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [editingList, setEditingList] = useState(null)
  const [creating, setCreating] = useState(false)

  useEffect(() => { load() }, [tab])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [listData, techData, assetData] = await Promise.all([
        fetchAssetLists(tab),
        fetchTechnicians(),
        fetchAssets({ assetGroup: 'tool_inventory' }),
      ])
      setLists(listData)
      setTechnicians(techData)
      setAllAssets(assetData)
    } catch (err) {
      setError(err.message || 'Failed to load lists')
    } finally {
      setLoading(false)
    }
  }

  async function handleDuplicate(list) {
    try {
      await duplicateAssetList(list.id)
      await load()
    } catch (err) {
      setError(err.message || 'Failed to duplicate list')
    }
  }

  async function handleDelete(list) {
    try {
      await deleteAssetList(list.id)
      await load()
    } catch (err) {
      setError(err.message || 'Failed to delete list')
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="Tool & Inventory Lists"
        subtitle="Reusable, assignable bundles of tools or inventory"
        actions={
          <button onClick={() => setCreating(true)} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors">
            + New List
          </button>
        }
      />

      <div className="flex gap-1 border-b border-gray-200 mb-2">
        {[{ key: 'tools', label: 'Tool Lists' }, { key: 'inventory', label: 'Inventory Lists' }].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>}

      {loading ? (
        <p className="text-sm text-gray-400">Loading lists…</p>
      ) : lists.length === 0 ? (
        <EmptyState title="No lists yet" description={`Build a reusable ${tab} list and assign it to a technician.`} />
      ) : (
        <div className="space-y-2">
          {lists.map(list => (
            <div key={list.id} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-bold text-gray-900">{list.name}</p>
                  <p className="text-xs text-gray-500">
                    {list.items?.length || 0} item{list.items?.length === 1 ? '' : 's'}
                    {list.assignee ? ` · assigned to ${list.assignee.full_name}` : ' · unassigned'}
                  </p>
                </div>
                <div className="flex gap-3 text-xs">
                  <button onClick={() => setEditingList(list)} className="text-blue-600 font-medium">Edit</button>
                  <button onClick={() => handleDuplicate(list)} className="text-gray-600 font-medium">Duplicate</button>
                  <button onClick={() => handleDelete(list)} className="text-red-600 font-medium">Delete</button>
                </div>
              </div>
              {list.items?.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {list.items.map(item => (
                    <span key={item.id} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{item.asset?.name}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {editingList && (
        <ListEditorModal list={editingList} listType={editingList.list_type} technicians={technicians} allAssets={allAssets}
          onClose={() => setEditingList(null)} onSaved={() => { setEditingList(null); load() }} />
      )}

      {creating && (
        <ListEditorModal list={null} listType={tab} technicians={technicians} allAssets={allAssets}
          onClose={() => setCreating(false)} onSaved={() => { setCreating(false); load() }} />
      )}
    </PageContainer>
  )
}
