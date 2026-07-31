import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { MoreVertical } from 'lucide-react'
import PageContainer from '../../../shared/components/PageContainer.jsx'
import PageHeader from '../../../shared/components/PageHeader'
import EmptyState from '../../../shared/components/EmptyState'
import AssetHistoryModal from '../components/AssetHistoryModal'
import EditAssetModal from '../components/EditAssetModal'
import TechnicianAssetsPanel from '../components/TechnicianAssetsPanel'
import PinDialog from '../components/PinDialog'
import ConfirmDialog from '../../../shared/components/ConfirmDialog'
import {
  fetchAssets, fetchTechnicians, fetchAssetCategories, assignAsset, deleteAsset,
  fetchStoreroomRequests, approveRequest, denyRequest, confirmHandoverPin,
  fetchStoreroomReturns, approveReturn, denyReturn, confirmReturnHandover,
} from '../services/assetService'
import { formatCurrency } from '../../../shared/utils/formatCurrency'
import { getCurrentProfile } from '../../../services/authService'

function AssignDialog({ asset, technicians, onCancel, onConfirm, saving }) {
  const [technicianId, setTechnicianId] = useState('')
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-sm p-4 space-y-3">
        <h2 className="text-sm font-bold text-gray-900">Assign {asset.name}</h2>
        <select value={technicianId} onChange={e => setTechnicianId(e.target.value)}
          className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200">
          <option value="">— Select technician —</option>
          {technicians.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
        </select>
        <div className="flex gap-2 pt-1">
          <button onClick={onCancel} className="flex-1 px-3 py-2 rounded-lg text-sm font-medium border border-gray-200 text-gray-600">Cancel</button>
          <button disabled={!technicianId || saving} onClick={() => onConfirm(technicianId)}
            className="flex-1 px-3 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white disabled:opacity-50">
            {saving ? 'Assigning…' : 'Assign'}
          </button>
        </div>
      </div>
    </div>
  )
}

function RowMenu({ onHistory, onEdit, onDelete }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative inline-block">
      <button onClick={() => setOpen(o => !o)} className="p-1 rounded hover:bg-gray-100">
        <MoreVertical size={16} className="text-gray-400" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1 w-40 bg-white border border-gray-200 rounded-lg shadow-lg z-20 py-1 flex flex-col">
            <button onClick={() => { setOpen(false); onEdit() }} className="block w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50">Edit</button>
            <button onClick={() => { setOpen(false); onHistory() }} className="block w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50">View history</button>
            <button onClick={() => { setOpen(false); onDelete() }} className="block w-full text-left px-3 py-2 text-xs text-red-600 hover:bg-red-50">Delete</button>
          </div>
        </>
      )}
    </div>
  )
}

function StoreroomTab() {
  const navigate = useNavigate()
  const location = useLocation()
  const [assets, setAssets] = useState([])
  const [technicians, setTechnicians] = useState([])
  const [categories, setCategories] = useState([])
  const [storeroomRequests, setStoreroomRequests] = useState([])
  const [storeroomReturns, setStoreroomReturns] = useState([])
  const [adminProfile, setAdminProfile] = useState(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [assigningAsset, setAssigningAsset] = useState(null)
  const [historyAsset, setHistoryAsset] = useState(null)
  const [editingAsset, setEditingAsset] = useState(null)
  const [deletingAsset, setDeletingAsset] = useState(null)
  const [pinRequest, setPinRequest] = useState(null)
  const [pinReturn, setPinReturn] = useState(null)
  const [pinError, setPinError] = useState(null)
  const [busyId, setBusyId] = useState(null)

  useEffect(() => { load() }, [location.key, search])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const profile = adminProfile || await getCurrentProfile().catch(() => null)
      if (profile) setAdminProfile(profile)

      const [assetData, techData, catData, requestData, returnData] = await Promise.all([
        fetchAssets({ activeOnly: true, search: search || undefined, assetGroup: 'tool_inventory' }),
        fetchTechnicians(),
        fetchAssetCategories(),
        fetchStoreroomRequests(),
        fetchStoreroomReturns(),
      ])
      // Only tools with no permanent owner belong to the storeroom pool —
      // a technician's own gear (owner_id set) lives under Tools & Inventory,
      // even while it's temporarily checked out to someone else.
      setAssets(assetData.filter(a => !a.owner_id))
      setTechnicians(techData)
      setCategories(catData)
      setStoreroomRequests(requestData)
      setStoreroomReturns(returnData)
    } catch (err) {
      setError(err.message || 'Failed to load storeroom')
    } finally {
      setLoading(false)
    }
  }

  async function withBusy(id, fn) {
    setBusyId(id)
    setError(null)
    try {
      await fn()
      await load()
    } catch (err) {
      setError(err.message || 'Something went wrong')
    } finally {
      setBusyId(null)
    }
  }

  async function handleDelete() {
    await withBusy(deletingAsset.id, async () => {
      await deleteAsset(deletingAsset.id)
      setDeletingAsset(null)
    })
  }

  async function handleAssign(technicianId) {
    await withBusy(assigningAsset.id, async () => {
      await assignAsset(assigningAsset.id, technicianId)
      setAssigningAsset(null)
    })
  }

  async function handleApproveStoreroom(requestId) {
    await withBusy(requestId, () => approveRequest(requestId, adminProfile?.id))
  }

  async function handleDenyStoreroom(requestId) {
    await withBusy(requestId, () => denyRequest(requestId))
  }

  async function handleConfirmStoreroomPin(pin) {
    setBusyId(pinRequest.id)
    setPinError(null)
    try {
      await confirmHandoverPin(pinRequest.id, pin)
      setPinRequest(null)
      await load()
    } catch (err) {
      setPinError(err.message || 'Incorrect PIN')
    } finally {
      setBusyId(null)
    }
  }

  async function handleApproveReturn(requestId) {
    await withBusy(requestId, () => approveReturn(requestId, adminProfile?.id))
  }

  async function handleDenyReturn(requestId) {
    await withBusy(requestId, () => denyReturn(requestId))
  }

  async function handleConfirmReturnPin(pin) {
    setBusyId(pinReturn.id)
    setPinError(null)
    try {
      await confirmReturnHandover(pinReturn.id, pin)
      setPinReturn(null)
      await load()
    } catch (err) {
      setPinError(err.message || 'Incorrect PIN')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
      <PageHeader
        title="Storeroom"
        subtitle="Company-owned tools and inventory available for checkout"
        actions={
          <button onClick={() => navigate('/items/assets/new')}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors">
            + New Asset
          </button>
        }
      />

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>}

      {storeroomRequests.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Storeroom requests</p>
          {storeroomRequests.map(r => (
            <div key={r.id} className="flex items-center justify-between text-sm">
              <div>
                <span className="font-medium text-gray-900">{r.assets?.name}</span>
                <span className="text-gray-500"> — requested by {r.requester?.full_name}</span>
              </div>
              {r.status === 'approved' ? (
                <span className="text-xs text-blue-600 font-mono">PIN {r.pin} shown to requester</span>
              ) : (
                <div className="flex gap-2">
                  <button disabled={busyId === r.id} onClick={() => handleApproveStoreroom(r.id)}
                    className="text-xs font-medium bg-green-600 text-white px-3 py-1 rounded-lg disabled:opacity-50">Approve</button>
                  <button disabled={busyId === r.id} onClick={() => handleDenyStoreroom(r.id)}
                    className="text-xs font-medium bg-gray-100 text-gray-600 px-3 py-1 rounded-lg disabled:opacity-50">Deny</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {storeroomReturns.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Storeroom returns</p>
          {storeroomReturns.map(r => (
            <div key={r.id} className="flex items-center justify-between text-sm">
              <div>
                <span className="font-medium text-gray-900">{r.assets?.name}</span>
                <span className="text-gray-500"> — return requested by {r.returner?.full_name}</span>
              </div>
              {r.status === 'approved' ? (
                <button onClick={() => { setPinReturn(r); setPinError(null) }}
                  className="text-xs font-medium bg-blue-600 text-white px-3 py-1 rounded-lg">Enter PIN</button>
              ) : (
                <div className="flex gap-2">
                  <button disabled={busyId === r.id} onClick={() => handleApproveReturn(r.id)}
                    className="text-xs font-medium bg-green-600 text-white px-3 py-1 rounded-lg disabled:opacity-50">Approve</button>
                  <button disabled={busyId === r.id} onClick={() => handleDenyReturn(r.id)}
                    className="text-xs font-medium bg-gray-100 text-gray-600 px-3 py-1 rounded-lg disabled:opacity-50">Deny</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search by name, barcode or serial…"
        className="w-full max-w-sm px-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      {loading ? (
        <p className="text-sm text-gray-400">Loading storeroom…</p>
      ) : assets.length === 0 ? (
        <EmptyState title="Storeroom is empty" description="Add a tool or inventory item, or check the search filter." />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3">Asset</th>
                <th className="text-left px-4 py-3">Currently with</th>
                <th className="text-left px-4 py-3">Kind</th>
                <th className="text-left px-4 py-3">Condition</th>
                <th className="text-right px-4 py-3">Value</th>
                <th className="text-right px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {assets.map(asset => (
                <tr key={asset.id} className="hover:bg-blue-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">
                    {asset.name}
                    <div className="text-xs text-gray-400 font-mono">{asset.barcode || asset.serial_number || ''}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{asset.holder?.full_name || 'In storeroom'}</td>
                  <td className="px-4 py-3 text-gray-600 capitalize">{asset.item_kind}</td>
                  <td className="px-4 py-3 text-gray-600">{asset.condition}</td>
                  <td className="px-4 py-3 text-right text-gray-900 tabular-nums">{formatCurrency(asset.value)}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-2">
                      {!asset.holder_id && (
                        <button disabled={busyId === asset.id} onClick={() => setAssigningAsset(asset)} className="text-xs font-medium text-blue-600">Assign</button>
                      )}
                      <RowMenu onEdit={() => setEditingAsset(asset)} onHistory={() => setHistoryAsset(asset)} onDelete={() => setDeletingAsset(asset)} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {assigningAsset && (
        <AssignDialog asset={assigningAsset} technicians={technicians} saving={busyId === assigningAsset.id}
          onCancel={() => setAssigningAsset(null)} onConfirm={handleAssign} />
      )}

      {historyAsset && <AssetHistoryModal asset={historyAsset} onClose={() => setHistoryAsset(null)} />}

      {deletingAsset && (
        <ConfirmDialog
          title={`Delete ${deletingAsset.name}?`}
          message={deletingAsset.holder_id
            ? 'This will deactivate the asset and mark it as returned. Its history will be kept.'
            : 'This will deactivate the asset. Its history will be kept.'}
          confirmLabel="Delete"
          busy={busyId === deletingAsset.id}
          onConfirm={handleDelete}
          onCancel={() => setDeletingAsset(null)}
        />
      )}

      {editingAsset && (
        <EditAssetModal asset={editingAsset} categories={categories}
          onClose={() => setEditingAsset(null)} onSaved={() => { setEditingAsset(null); load() }} />
      )}

      {pinRequest && (
        <PinDialog title={`Show PIN to confirm handover of ${pinRequest.assets?.name}`} saving={busyId === pinRequest.id} error={pinError}
          onCancel={() => setPinRequest(null)} onConfirm={handleConfirmStoreroomPin} />
      )}

      {pinReturn && (
        <PinDialog title={`Confirm return of ${pinReturn.assets?.name}`} saving={busyId === pinReturn.id} error={pinError}
          onCancel={() => setPinReturn(null)} onConfirm={handleConfirmReturnPin} />
      )}
    </>
  )
}

function ToolsInventoryTab() {
  const [technicians, setTechnicians] = useState([])
  const [selected, setSelected] = useState(null)
  const [adminProfile, setAdminProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    setLoading(true)
    Promise.all([fetchTechnicians(), getCurrentProfile().catch(() => null)])
      .then(([techs, profile]) => { setTechnicians(techs); setAdminProfile(profile) })
      .catch(err => setError(err.message || 'Failed to load technicians'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <p className="text-sm text-gray-400">Loading…</p>
  if (error) return <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>

  if (selected) {
    return (
      <TechnicianAssetsPanel
        technician={selected}
        technicians={technicians}
        adminProfile={adminProfile}
        onBack={() => setSelected(null)}
      />
    )
  }

  return (
    <>
      <PageHeader title="Tools & Inventory" subtitle="Select a technician to manage what's assigned to them" />
      {technicians.length === 0 ? (
        <EmptyState title="No technicians yet" description="Add a technician under Users to start assigning tools." />
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {technicians.map(t => (
            <button key={t.id} onClick={() => setSelected(t)}
              className="text-left bg-white rounded-xl border border-gray-200 p-4 hover:border-blue-300 transition-colors">
              <p className="text-sm font-bold text-gray-900">{t.full_name}</p>
              <p className="text-xs text-gray-500 mt-0.5">View tools, inventory & vehicle</p>
            </button>
          ))}
        </div>
      )}
    </>
  )
}

export default function AssetsPage() {
  const [tab, setTab] = useState('storeroom')

  return (
    <PageContainer>
      <div className="flex gap-1 border-b border-gray-200 mb-4">
        {[
          { key: 'storeroom', label: 'Storeroom Tools' },
          { key: 'tools_inventory', label: 'Tools & Inventory' },
          { key: 'vehicles', label: 'Vehicles' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'storeroom' && <StoreroomTab />}
      {tab === 'tools_inventory' && <ToolsInventoryTab />}
      {tab === 'vehicles' && (
        <EmptyState title="Vehicles coming soon" description="Vehicle tracking will live here — tools and inventory first." />
      )}
    </PageContainer>
  )
}
