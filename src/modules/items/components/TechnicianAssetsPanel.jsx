import { useEffect, useState } from 'react'
import {
  fetchAssetLists, createAssetList, updateAssetList, deleteAssetList, duplicateAssetList,
  removeListItem, requestRecall, fetchMyRecalls, confirmReturnPin, deleteAsset, updateListItemQuantity,
} from '../services/assetService'
import AddListItemModal from './AddListItemModal'
import DuplicateListModal from './DuplicateListModal'
import PinDialog from './PinDialog'
import EditAssetModal from './EditAssetModal'
import ConfirmDialog from '../../../shared/components/ConfirmDialog'
import { useAssetCategories } from '../hooks/useAssetCategories'
import { formatCurrency } from '../../../shared/utils/formatCurrency'

const inputCls = 'px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white'

function ListCard({ list, technicians, categories, adminProfile, recallByAssetId, onChanged }) {
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(list.name)
  const [adding, setAdding] = useState(false)
  const [duplicating, setDuplicating] = useState(false)
  const [pinRecall, setPinRecall] = useState(null)
  const [pinError, setPinError] = useState(null)
  const [editingItem, setEditingItem] = useState(null)
  const [deletingItem, setDeletingItem] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function handleRename() {
    setBusy(true)
    setError(null)
    try {
      await updateAssetList(list.id, { name, assignedTo: list.assigned_to })
      setRenaming(false)
      onChanged()
    } catch (err) {
      setError(err.message || 'Failed to rename')
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    setBusy(true)
    setError(null)
    try {
      await deleteAssetList(list.id)
      onChanged()
    } catch (err) {
      setError(err.message || 'Failed to delete list')
      setBusy(false)
    }
  }

  async function handleDuplicate({ name: newName, assignedTo }) {
    setBusy(true)
    setError(null)
    try {
      await duplicateAssetList(list.id, { name: newName, assignedTo })
      setDuplicating(false)
      onChanged()
    } catch (err) {
      setError(err.message || 'Failed to duplicate')
    } finally {
      setBusy(false)
    }
  }

  // Removing an item that's physically with the technician requires
  // the same PIN-verified recall as anywhere else — no admin shortcut
  // to just take it back. Items never assigned (no holder) can be
  // dropped from the list immediately.
  async function handleStartRemove(item) {
    if (!item.asset.holder_id) {
      setBusy(true)
      setError(null)
      try {
        await removeListItem(item.id)
        onChanged()
      } catch (err) {
        setError(err.message || 'Failed to remove item')
      } finally {
        setBusy(false)
      }
      return
    }
    setBusy(true)
    setError(null)
    try {
      await requestRecall(item.asset.id, adminProfile?.id, { toStoreroom: true })
      onChanged()
    } catch (err) {
      setError(err.message || 'Failed to start recall')
    } finally {
      setBusy(false)
    }
  }

  async function handleConfirmRemovePin(item, pin) {
    const recall = recallByAssetId[item.asset.id]
    if (!recall) return
    setBusy(true)
    setPinError(null)
    try {
      await confirmReturnPin(recall.id, pin)
      await removeListItem(item.id)
      setPinRecall(null)
      onChanged()
    } catch (err) {
      setPinError(err.message || 'Incorrect PIN')
    } finally {
      setBusy(false)
    }
  }

  async function handleDeleteItem() {
    if (!deletingItem) return
    setBusy(true)
    setError(null)
    try {
      await deleteAsset(deletingItem.asset.id)
      await removeListItem(deletingItem.id)
      setDeletingItem(null)
      onChanged()
    } catch (err) {
      setError(err.message || 'Failed to delete item')
    } finally {
      setBusy(false)
    }
  }

  async function handleQuantityChange(item, value) {
    const qty = Math.max(1, Number(value) || 1)
    if (qty === (item.quantity || 1)) return
    setBusy(true)
    setError(null)
    try {
      await updateListItemQuantity(item.id, qty)
      onChanged()
    } catch (err) {
      setError(err.message || 'Failed to update quantity')
    } finally {
      setBusy(false)
    }
  }

  const liability = (list.items || []).reduce((s, i) => s + Number(i.asset?.value || 0) * (i.quantity || 1), 0)

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-start justify-between mb-2">
        {renaming ? (
          <div className="flex gap-2 items-center">
            <input value={name} onChange={e => setName(e.target.value)} className={inputCls} />
            <button disabled={busy} onClick={handleRename} className="text-xs font-medium text-blue-600">Save</button>
            <button onClick={() => { setRenaming(false); setName(list.name) }} className="text-xs text-gray-500">Cancel</button>
          </div>
        ) : (
          <div>
            <p className="text-sm font-bold text-gray-900">{list.name}</p>
            <p className="text-xs text-gray-500">{(list.items || []).length} item{(list.items || []).length === 1 ? '' : 's'} · Liability: {formatCurrency(liability)}</p>
          </div>
        )}
        <div className="flex gap-3 text-xs">
          <button onClick={() => setAdding(true)} className="text-blue-600 font-medium">+ Add</button>
          <button onClick={() => setRenaming(true)} className="text-gray-600 font-medium">Rename</button>
          <button onClick={() => setDuplicating(true)} className="text-gray-600 font-medium">Duplicate</button>
          <button disabled={busy} onClick={handleDelete} className="text-red-600 font-medium">Delete</button>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 rounded-lg mb-2">{error}</div>}

      {(list.items || []).length === 0 ? (
        <p className="text-xs text-gray-400">No items yet.</p>
      ) : (
        <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
          {list.items.map(item => {
            const recall = item.asset?.holder_id ? recallByAssetId[item.asset.id] : null
            return (
              <li key={item.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <button onClick={() => setEditingItem(item)} className="text-gray-900 hover:text-blue-600 hover:underline text-left">
                  {item.asset?.name}
                </button>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400">Owner: {item.asset?.owner?.full_name || 'Office'}</span>
                  <span className="flex items-center gap-1 text-xs text-gray-500">
                    Qty
                    <input
                      type="number" min="1" step="1" disabled={busy}
                      defaultValue={item.quantity || 1} key={`${item.id}-${item.quantity}`}
                      onBlur={e => handleQuantityChange(item, e.target.value)}
                      className="w-14 px-1.5 py-0.5 text-xs rounded border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </span>
                  <span className="text-xs text-gray-500">{formatCurrency(item.asset?.value)} each · {formatCurrency(Number(item.asset?.value || 0) * (item.quantity || 1))} total</span>
                  <button disabled={busy} onClick={() => setEditingItem(item)} className="text-xs font-medium text-blue-600">Edit</button>
                  {recall && recall.status === 'approved' ? (
                    <button disabled={busy} onClick={() => { setPinRecall({ item, recall }); setPinError(null) }} className="text-xs font-medium text-blue-600">Enter PIN</button>
                  ) : recall && recall.status === 'pending' ? (
                    <span className="text-xs text-amber-600">Recall pending</span>
                  ) : (
                    <button disabled={busy} onClick={() => handleStartRemove(item)} className="text-xs text-gray-500">
                      {item.asset?.holder_id ? 'Recall to remove' : 'Remove'}
                    </button>
                  )}
                  <button disabled={busy} onClick={() => setDeletingItem(item)} className="text-xs text-red-600">Delete</button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {adding && (
        <AddListItemModal list={list} listType={list.list_type} technicianId={list.assigned_to}
          onClose={() => setAdding(false)} onAdded={() => { setAdding(false); onChanged() }} />
      )}

      {duplicating && (
        <DuplicateListModal list={list} technicians={technicians} saving={busy}
          onClose={() => setDuplicating(false)} onConfirm={handleDuplicate} />
      )}

      {pinRecall && (
        <PinDialog title={`Confirm return of ${pinRecall.item.asset?.name}`} saving={busy} error={pinError}
          onCancel={() => setPinRecall(null)} onConfirm={pin => handleConfirmRemovePin(pinRecall.item, pin)} />
      )}

      {editingItem && (
        <EditAssetModal asset={editingItem.asset} categories={categories} technicians={technicians}
          onClose={() => setEditingItem(null)} onSaved={() => { setEditingItem(null); onChanged() }} />
      )}

      {deletingItem && (
        <ConfirmDialog title={`Delete ${deletingItem.asset?.name}?`}
          message="This removes it from the storeroom and every technician's list. This can't be undone."
          confirmLabel="Delete" busy={busy}
          onConfirm={handleDeleteItem} onCancel={() => setDeletingItem(null)} />
      )}
    </div>
  )
}

function ListTypeTab({ technician, listType, technicians, categories, adminProfile, onListsChanged }) {
  const [lists, setLists] = useState([])
  const [recallByAssetId, setRecallByAssetId] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [creatingName, setCreatingName] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => { load() }, [technician.id, listType])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [listData, recalls] = await Promise.all([
        fetchAssetLists(listType, technician.id),
        adminProfile ? fetchMyRecalls(adminProfile.id) : Promise.resolve([]),
      ])
      setLists(listData)
      setRecallByAssetId(Object.fromEntries(recalls.map(r => [r.asset_id, r])))
      onListsChanged?.()
    } catch (err) {
      setError(err.message || 'Failed to load lists')
    } finally {
      setLoading(false)
    }
  }

  async function handleCreate() {
    if (!creatingName.trim()) return
    setCreating(true)
    setError(null)
    try {
      await createAssetList({ name: creatingName, listType, assignedTo: technician.id, assetIds: [] })
      setCreatingName('')
      await load()
    } catch (err) {
      setError(err.message || 'Failed to create list')
    } finally {
      setCreating(false)
    }
  }

  if (loading) return <p className="text-sm text-gray-400">Loading…</p>

  return (
    <div className="space-y-3">
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>}

      {lists.map(list => (
        <ListCard key={list.id} list={list} technicians={technicians} categories={categories} adminProfile={adminProfile} recallByAssetId={recallByAssetId} onChanged={load} />
      ))}

      <div className="bg-white rounded-xl border border-dashed border-gray-300 p-4 flex gap-2">
        <input value={creatingName} onChange={e => setCreatingName(e.target.value)}
          placeholder={`New ${listType} list name…`} className={`flex-1 ${inputCls}`} />
        <button disabled={creating || !creatingName.trim()} onClick={handleCreate}
          className="px-3 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg disabled:opacity-50">
          + New list
        </button>
      </div>
    </div>
  )
}

export default function TechnicianAssetsPanel({ technician, technicians, adminProfile, onBack }) {
  const [subTab, setSubTab] = useState('tools')
  const [totalLiability, setTotalLiability] = useState(null)
  const { categories } = useAssetCategories()

  async function refreshTotalLiability() {
    try {
      const lists = await fetchAssetLists(undefined, technician.id)
      const total = lists.reduce((s, list) =>
        s + (list.items || []).reduce((s2, i) => s2 + Number(i.asset?.value || 0) * (i.quantity || 1), 0), 0)
      setTotalLiability(total)
    } catch {
      // leave previous total in place
    }
  }

  useEffect(() => { refreshTotalLiability() }, [technician.id])

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <button onClick={onBack} className="text-sm text-blue-600 font-medium">← All technicians</button>
        <h2 className="text-sm font-bold text-gray-900">{technician.full_name}</h2>
        <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
          Total liability: {totalLiability === null ? '…' : formatCurrency(totalLiability)}
        </span>
      </div>

      <div className="flex gap-1 border-b border-gray-200 mb-3">
        {[{ key: 'tools', label: 'Tools' }, { key: 'inventory', label: 'Inventory' }, { key: 'vehicle', label: 'Vehicle' }].map(t => (
          <button key={t.key} onClick={() => setSubTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${subTab === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {subTab === 'vehicle' ? (
        <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
          <p className="text-sm font-medium text-gray-700">Vehicle assignment coming soon</p>
        </div>
      ) : (
        <ListTypeTab technician={technician} listType={subTab} technicians={technicians} categories={categories} adminProfile={adminProfile} onListsChanged={refreshTotalLiability} />
      )}
    </div>
  )
}
