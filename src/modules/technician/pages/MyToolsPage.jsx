import { useEffect, useState } from 'react'
import { Wrench, RotateCcw, Search, MoreVertical } from 'lucide-react'
import {
  fetchMyTools, fetchLentOutTools,
  fetchStoreroomTools, fetchBorrowableTools, requestStoreroom, requestBorrow,
  fetchMyRequests, fetchIncomingRequests, approveRequest, denyRequest, confirmHandoverPin,
  fetchMyRecalls, fetchIncomingRecalls, requestRecall, generateReturnPin, confirmReturnPin,
  requestReturn, fetchMyReturnRequests, fetchIncomingReturns, confirmReturnHandover,
  isOverdue, fetchListQuantitiesForTechnician,
} from '../../items/services/assetService'
import { formatCurrency } from '../../../shared/utils/formatCurrency'

const CONDITION_STYLE = {
  Good:    'bg-green-100 text-green-700',
  Fair:    'bg-amber-100 text-amber-700',
  Damaged: 'bg-red-100 text-red-700',
}

function ConditionBadge({ condition }) {
  if (!condition) return null
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${CONDITION_STYLE[condition] || 'bg-gray-100 text-gray-500'}`}>
      {condition}
    </span>
  )
}

function OverdueBadge() {
  return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">Overdue</span>
}

function ToolMenu({ onReturn }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative inline-block">
      <button onClick={() => setOpen(o => !o)} className="p-1 rounded hover:bg-gray-100">
        <MoreVertical size={16} className="text-gray-400" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1 w-44 bg-white border border-gray-200 rounded-lg shadow-lg z-20 py-1">
            <button onClick={() => { setOpen(false); onReturn() }}
              className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-1.5">
              <RotateCcw size={12} /> Return this tool
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function ReturnRequestDialog({ tool, onCancel, onConfirm, saving }) {
  const [comment, setComment] = useState('')
  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-sm p-4 space-y-3">
        <h2 className="text-sm font-bold text-gray-900">Request return of {tool.name}</h2>
        <p className="text-xs text-gray-500">This will need to be approved, then confirmed in person with a PIN.</p>
        <textarea rows={2} value={comment} onChange={e => setComment(e.target.value)}
          placeholder="Comment (optional)" className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 resize-none" />
        <div className="flex gap-2 pt-1">
          <button onClick={onCancel} className="flex-1 px-3 py-2 rounded-lg text-sm font-medium border border-gray-200 text-gray-600">Cancel</button>
          <button disabled={saving} onClick={() => onConfirm({ comment })}
            className="flex-1 px-3 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white disabled:opacity-50">
            {saving ? 'Requesting…' : 'Request return'}
          </button>
        </div>
      </div>
    </div>
  )
}

function PinDialog({ title, onCancel, onConfirm, saving, error }) {
  const [pin, setPin] = useState('')
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-xs p-4 space-y-3 text-center">
        <h2 className="text-sm font-bold text-gray-900">{title}</h2>
        <p className="text-xs text-gray-500">Ask them to show their PIN, then enter it here to confirm.</p>
        <input value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
          maxLength={4} placeholder="----"
          className="w-full text-center text-2xl tracking-[0.5em] font-mono px-3 py-2 rounded-lg border border-gray-200" />
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex gap-2 pt-1">
          <button onClick={onCancel} className="flex-1 px-3 py-2 rounded-lg text-sm font-medium border border-gray-200 text-gray-600">Cancel</button>
          <button disabled={saving || pin.length !== 4} onClick={() => onConfirm(pin)}
            className="flex-1 px-3 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white disabled:opacity-50">
            {saving ? 'Confirming…' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ToolDetailModal({ tool, profile, onCancel, onRequestStoreroom, onRequestBorrow, saving }) {
  const inStoreroom = tool.status === 'warehouse'
  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-sm p-4 space-y-3">
        <h2 className="text-sm font-bold text-gray-900">{tool.name}</h2>
        <p className="text-xs text-gray-500">{tool.asset_categories?.name || 'Uncategorised'} · {formatCurrency(tool.value)}</p>
        {inStoreroom ? (
          <div className="bg-green-50 rounded-lg p-3">
            <p className="text-sm font-medium text-green-700">Available in storeroom</p>
            <p className="text-xs text-green-600 mt-0.5">Request it and an admin will confirm the handover with a PIN.</p>
          </div>
        ) : (
          <div className="bg-amber-50 rounded-lg p-3">
            <p className="text-sm font-medium text-amber-700">Currently in use</p>
            <p className="text-xs text-amber-600 mt-0.5">This tool is with {tool.holder?.full_name || 'a colleague'} right now.</p>
          </div>
        )}
        <div className="flex gap-2 pt-1">
          <button onClick={onCancel} className="flex-1 px-3 py-2 rounded-lg text-sm font-medium border border-gray-200 text-gray-600">Close</button>
          {inStoreroom ? (
            <button disabled={saving} onClick={onRequestStoreroom}
              className="flex-1 px-3 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white disabled:opacity-50">
              {saving ? 'Requesting…' : 'Request from storeroom'}
            </button>
          ) : (
            <button disabled={saving} onClick={onRequestBorrow}
              className="flex-1 px-3 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white disabled:opacity-50">
              {saving ? 'Requesting…' : `Request from ${tool.holder?.full_name?.split(' ')[0] || 'holder'}`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default function MyToolsPage({ profile }) {
  const [tab, setTab] = useState('storeroom')
  const [myTools, setMyTools] = useState([])
  const [quantities, setQuantities] = useState({})
  const [lentOut, setLentOut] = useState([])
  const [incoming, setIncoming] = useState([])
  const [myRequests, setMyRequests] = useState([])
  const [myRecalls, setMyRecalls] = useState([])
  const [incomingRecalls, setIncomingRecalls] = useState([])
  const [myReturns, setMyReturns] = useState([])
  const [incomingReturns, setIncomingReturns] = useState([])
  const [storeroomSearch, setStoreroomSearch] = useState('')
  const [storeroomResults, setStoreroomResults] = useState([])
  const [storeroomAll, setStoreroomAll] = useState([])
  const [storeroomAllLoading, setStoreroomAllLoading] = useState(true)
  const [colleagueSearch, setColleagueSearch] = useState('')
  const [colleagueResults, setColleagueResults] = useState([])
  const [selectedTool, setSelectedTool] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [returningTool, setReturningTool] = useState(null)
  const [pinRequest, setPinRequest] = useState(null)
  const [pinReturn, setPinReturn] = useState(null)
  const [pinReturnHandover, setPinReturnHandover] = useState(null)
  const [pinError, setPinError] = useState(null)
  const [busyId, setBusyId] = useState(null)

  useEffect(() => { load(); loadStoreroomAll() }, [profile.id])

  useEffect(() => {
    if (!storeroomSearch.trim()) { setStoreroomResults([]); return }
    const handle = setTimeout(() => {
      fetchStoreroomTools(storeroomSearch.trim()).then(setStoreroomResults).catch(err => setError(err.message))
    }, 250)
    return () => clearTimeout(handle)
  }, [storeroomSearch])

  useEffect(() => {
    if (!colleagueSearch.trim()) { setColleagueResults([]); return }
    const handle = setTimeout(() => {
      fetchBorrowableTools(profile.id, colleagueSearch.trim()).then(setColleagueResults).catch(err => setError(err.message))
    }, 250)
    return () => clearTimeout(handle)
  }, [colleagueSearch, profile.id])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [mine, lent, inc, reqs, recalls, incRecalls, myRet, incRet, qty] = await Promise.all([
        fetchMyTools(profile.id),
        fetchLentOutTools(profile.id),
        fetchIncomingRequests(profile.id),
        fetchMyRequests(profile.id),
        fetchMyRecalls(profile.id),
        fetchIncomingRecalls(profile.id),
        fetchMyReturnRequests(profile.id),
        fetchIncomingReturns(profile.id),
        fetchListQuantitiesForTechnician(profile.id),
      ])
      setMyTools(mine)
      setQuantities(qty)
      setLentOut(lent)
      setIncoming(inc)
      setMyRequests(reqs.filter(r => r.status === 'pending' || r.status === 'approved'))
      setMyRecalls(recalls)
      setIncomingRecalls(incRecalls)
      setMyReturns(myRet)
      setIncomingReturns(incRet)
    } catch (err) {
      setError(err.message || 'Failed to load tools')
    } finally {
      setLoading(false)
    }
  }

  async function loadStoreroomAll() {
    setStoreroomAllLoading(true)
    try {
      setStoreroomAll(await fetchStoreroomTools())
    } catch (err) {
      setError(err.message)
    } finally {
      setStoreroomAllLoading(false)
    }
  }

  async function withBusy(id, fn) {
    setBusyId(id)
    setError(null)
    try {
      await fn()
      await load()
      await loadStoreroomAll()
    } catch (err) {
      setError(err.message || 'Something went wrong')
    } finally {
      setBusyId(null)
    }
  }

  async function handleRequestReturn({ comment }) {
    const tool = returningTool
    const isStoreroomOrigin = !tool.owner
    await withBusy(tool.id, async () => {
      await requestReturn(tool.id, profile.id, {
        toStoreroom: isStoreroomOrigin,
        colleagueId: isStoreroomOrigin ? null : tool.owner.id,
        note: comment,
      })
      setReturningTool(null)
    })
  }

  async function handleRequestStoreroom(tool) {
    await withBusy(tool.id, async () => {
      await requestStoreroom(tool.id, profile.id)
      setSelectedTool(null)
    })
  }

  async function handleRequestBorrow(tool) {
    await withBusy(tool.id, async () => {
      await requestBorrow(tool.id, tool.holder.id, profile.id)
      setSelectedTool(null)
    })
  }

  async function handleApprove(requestId) { await withBusy(requestId, () => approveRequest(requestId, profile.id)) }
  async function handleDeny(requestId) { await withBusy(requestId, () => denyRequest(requestId)) }

  async function handleConfirmPin(pin) {
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

  async function handleRecall(toolId) { await withBusy(toolId, () => requestRecall(toolId, profile.id)) }
  async function handleGenerateReturnPin(requestId) { await withBusy(requestId, () => generateReturnPin(requestId)) }

  async function handleConfirmReturnPin(pin) {
    setBusyId(pinReturn.id)
    setPinError(null)
    try {
      await confirmReturnPin(pinReturn.id, pin)
      setPinReturn(null)
      await load()
    } catch (err) {
      setPinError(err.message || 'Incorrect PIN')
    } finally {
      setBusyId(null)
    }
  }

  async function handleConfirmReturnHandover(pin) {
    setBusyId(pinReturnHandover.id)
    setPinError(null)
    try {
      await confirmReturnHandover(pinReturnHandover.id, pin)
      setPinReturnHandover(null)
      await load()
    } catch (err) {
      setPinError(err.message || 'Incorrect PIN')
    } finally {
      setBusyId(null)
    }
  }

  if (loading) return <div className="p-4 text-sm text-gray-500">Loading…</div>

  const myValue = myTools.reduce((s, t) => s + Number(t.value || 0), 0)

  // A tool with no distinct owner (owner_id null, or owner === self) came
  // from the storeroom rather than a colleague — the same signal already
  // used elsewhere in this module to detect provenance.
  const storeroomHeld = myTools.filter(t => !t.owner)
  const colleagueHeld = myTools.filter(t => t.owner && t.owner.id !== profile.id)
  const myOwnTools = myTools.filter(t => t.item_kind === 'tool' && t.owner && t.owner.id === profile.id)
  const myOwnInventory = myTools.filter(t => t.item_kind === 'inventory' && t.owner && t.owner.id === profile.id)

  const TABS = [
    { key: 'storeroom', label: 'Storeroom Tools' },
    { key: 'mine', label: 'My Tools' },
    { key: 'inventory', label: 'My Inventory' },
    { key: 'colleagues', label: "My Colleague's Tools" },
  ]

  return (
    <div className="p-4 space-y-5">
      <h1 className="text-lg font-bold text-gray-900">My Tools</h1>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>}

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 p-3">
          <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center mb-2"><Wrench size={16} className="text-blue-600" /></div>
          <div className="text-lg font-bold text-gray-900 tabular-nums">{myTools.length}</div>
          <div className="text-xs text-gray-500">With me</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-3">
          <div className="text-lg font-bold text-gray-900 tabular-nums">{formatCurrency(myValue)}</div>
          <div className="text-xs text-gray-500">My liability</div>
        </div>
      </div>

      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-3 py-2 text-xs font-medium border-b-2 -mb-px whitespace-nowrap ${tab === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'storeroom' && (
        <div className="space-y-5">
          {incomingRecalls.filter(r => r.return_to_storeroom !== false).length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Recall requests</p>
              <div className="space-y-2">
                {incomingRecalls.map(r => (
                  <div key={r.id} className="bg-white rounded-xl border border-gray-200 p-3">
                    <p className="text-sm font-semibold text-gray-900">{r.assets?.name}</p>
                    <p className="text-xs text-gray-500 mb-2">{r.recaller?.full_name || 'The storeroom'} is requesting this tool back</p>
                    {r.status === 'approved' ? (
                      <div className="bg-blue-50 rounded-lg p-3 text-center">
                        <p className="text-xs text-blue-700 mb-1">Show this PIN to confirm the handover</p>
                        <p className="text-2xl font-mono font-bold tracking-[0.4em] text-blue-900">{r.pin}</p>
                      </div>
                    ) : (
                      <button disabled={busyId === r.id} onClick={() => handleGenerateReturnPin(r.id)}
                        className="text-xs font-medium bg-amber-600 text-white px-3 py-1.5 rounded-lg disabled:opacity-50">
                        {busyId === r.id ? 'Preparing…' : "I'm ready — generate PIN"}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {myReturns.filter(r => r.return_to_storeroom).length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">My return requests</p>
              <div className="space-y-2">
                {myReturns.filter(r => r.return_to_storeroom).map(r => (
                  <div key={r.id} className="bg-white rounded-xl border border-gray-200 p-3">
                    <p className="text-sm font-semibold text-gray-900">{r.assets?.name}</p>
                    {r.status === 'approved' ? (
                      <div className="bg-blue-50 rounded-lg p-3 text-center mt-2">
                        <p className="text-xs text-blue-700 mb-1">Show this PIN to the admin to confirm the return</p>
                        <p className="text-2xl font-mono font-bold tracking-[0.4em] text-blue-900">{r.pin}</p>
                      </div>
                    ) : (
                      <p className="text-xs text-gray-500">Waiting for admin approval</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {myRequests.filter(r => r.type === 'borrow_storeroom' || !r.type).length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">My requests</p>
              <div className="space-y-2">
                {myRequests.filter(r => r.type === 'borrow_storeroom').map(r => (
                  <div key={r.id} className="bg-white rounded-xl border border-gray-200 p-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{r.assets?.name}</p>
                      <p className="text-xs text-gray-500">{r.status === 'pending' ? 'Waiting for approval' : 'Approved — enter PIN in person to receive'}</p>
                    </div>
                    {r.status === 'approved' && (
                      <button onClick={() => { setPinRequest(r); setPinError(null) }}
                        className="text-xs font-medium bg-blue-600 text-white px-3 py-1.5 rounded-lg">Enter PIN</button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">With me from storeroom</p>
            {storeroomHeld.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">No storeroom tools checked out to you.</p>
            ) : (
              <div className="space-y-2">
                {storeroomHeld.map(tool => (
                  <div key={tool.id} className="bg-white rounded-xl border border-gray-200 p-3">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-semibold text-gray-900">{tool.name}</p>
                      <div className="flex items-center gap-1">
                        {isOverdue(tool) && <OverdueBadge />}
                        <ConditionBadge condition={tool.condition} />
                        <ToolMenu onReturn={() => setReturningTool(tool)} />
                      </div>
                    </div>
                    <p className="text-xs text-gray-500">
                      {tool.asset_categories?.name || 'Uncategorised'} · {formatCurrency(tool.value)}
                      {quantities[tool.id] > 1 ? ` · Qty: ${quantities[tool.id]}` : ''}
                      {tool.due_back ? ` · due ${tool.due_back}` : ''}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1">
              <Search size={12} /> Tools in the storeroom
            </p>
            <input
              value={storeroomSearch}
              onChange={e => setStoreroomSearch(e.target.value)}
              placeholder="Search tool name or barcode…"
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 mb-2"
            />
            {storeroomSearch.trim() ? (
              storeroomResults.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">No results for "{storeroomSearch}"</p>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {storeroomResults.map(tool => (
                    <button key={tool.id} onClick={() => setSelectedTool(tool)}
                      className="w-full text-left bg-white rounded-xl border border-gray-200 p-3">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-semibold text-gray-900">{tool.name}</p>
                        <span className="text-xs font-medium text-green-700">In storeroom</span>
                      </div>
                      <p className="text-xs text-gray-500">{tool.asset_categories?.name || 'Uncategorised'} · {formatCurrency(tool.value)}</p>
                    </button>
                  ))}
                </div>
              )
            ) : storeroomAllLoading ? (
              <p className="text-sm text-gray-400 text-center py-4">Loading…</p>
            ) : storeroomAll.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">The storeroom is empty.</p>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {storeroomAll.map(tool => (
                  <button key={tool.id} onClick={() => setSelectedTool(tool)}
                    className="w-full text-left bg-white rounded-xl border border-gray-200 p-3">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-semibold text-gray-900">{tool.name}</p>
                      <span className="text-xs font-medium text-green-700">In storeroom</span>
                    </div>
                    <p className="text-xs text-gray-500">{tool.asset_categories?.name || 'Uncategorised'} · {formatCurrency(tool.value)}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'mine' && (
        <div>
          {myOwnTools.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No tools of your own.</p>
          ) : (
            <div className="space-y-2">
              {myOwnTools.map(tool => (
                <div key={tool.id} className="bg-white rounded-xl border border-gray-200 p-3">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-semibold text-gray-900">{tool.name}</p>
                    <ConditionBadge condition={tool.condition} />
                  </div>
                  <p className="text-xs text-gray-500">
                    {tool.asset_categories?.name || 'Uncategorised'} · {formatCurrency(tool.value)}
                    {quantities[tool.id] > 1 ? ` · Qty: ${quantities[tool.id]}` : ''}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'inventory' && (
        <div>
          {myOwnInventory.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No inventory items of your own.</p>
          ) : (
            <div className="space-y-2">
              {myOwnInventory.map(tool => (
                <div key={tool.id} className="bg-white rounded-xl border border-gray-200 p-3">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-semibold text-gray-900">{tool.name}</p>
                    <ConditionBadge condition={tool.condition} />
                  </div>
                  <p className="text-xs text-gray-500">
                    {tool.asset_categories?.name || 'Uncategorised'} · {formatCurrency(tool.value)}
                    {quantities[tool.id] > 1 ? ` · Qty: ${quantities[tool.id]}` : ''}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'colleagues' && (
        <div className="space-y-5">
          {incomingReturns.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Incoming returns</p>
              <div className="space-y-2">
                {incomingReturns.map(r => (
                  <div key={r.id} className="bg-white rounded-xl border border-gray-200 p-3">
                    <p className="text-sm font-semibold text-gray-900">{r.assets?.name}</p>
                    <p className="text-xs text-gray-500 mb-2">{r.returner?.full_name} wants to return this to you</p>
                    {r.status === 'approved' ? (
                      <button onClick={() => { setPinReturnHandover(r); setPinError(null) }}
                        className="text-xs font-medium bg-blue-600 text-white px-3 py-1.5 rounded-lg">Enter PIN</button>
                    ) : (
                      <div className="flex gap-2">
                        <button disabled={busyId === r.id} onClick={() => withBusy(r.id, () => approveRequest(r.id, profile.id))}
                          className="text-xs font-medium bg-green-600 text-white px-3 py-1.5 rounded-lg disabled:opacity-50">Approve</button>
                        <button disabled={busyId === r.id} onClick={() => withBusy(r.id, () => denyRequest(r.id))}
                          className="text-xs font-medium bg-gray-100 text-gray-600 px-3 py-1.5 rounded-lg disabled:opacity-50">Deny</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {myReturns.filter(r => !r.return_to_storeroom).length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">My return requests</p>
              <div className="space-y-2">
                {myReturns.filter(r => !r.return_to_storeroom).map(r => (
                  <div key={r.id} className="bg-white rounded-xl border border-gray-200 p-3">
                    <p className="text-sm font-semibold text-gray-900">{r.assets?.name}</p>
                    {r.status === 'approved' ? (
                      <div className="bg-blue-50 rounded-lg p-3 text-center mt-2">
                        <p className="text-xs text-blue-700 mb-1">Show this PIN to confirm the return</p>
                        <p className="text-2xl font-mono font-bold tracking-[0.4em] text-blue-900">{r.pin}</p>
                      </div>
                    ) : (
                      <p className="text-xs text-gray-500">Waiting for approval</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {myRecalls.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">My recall requests</p>
              <div className="space-y-2">
                {myRecalls.map(r => (
                  <div key={r.id} className="bg-white rounded-xl border border-gray-200 p-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{r.assets?.name}</p>
                      <p className="text-xs text-gray-500">{r.status === 'pending' ? `Waiting for ${r.holder?.full_name || 'the holder'} to prepare handover` : 'Ready — enter PIN in person'}</p>
                    </div>
                    {r.status === 'approved' && (
                      <button onClick={() => { setPinReturn(r); setPinError(null) }}
                        className="text-xs font-medium bg-blue-600 text-white px-3 py-1.5 rounded-lg">Enter PIN</button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {incoming.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Requests for your tools</p>
              <div className="space-y-2">
                {incoming.map(r => (
                  <div key={r.id} className="bg-white rounded-xl border border-gray-200 p-3">
                    <p className="text-sm font-semibold text-gray-900">{r.assets?.name}</p>
                    <p className="text-xs text-gray-500 mb-2">{r.requester?.full_name} wants to borrow this</p>
                    {r.status === 'approved' ? (
                      <div className="bg-blue-50 rounded-lg p-3 text-center">
                        <p className="text-xs text-blue-700 mb-1">Show this PIN to {r.requester?.full_name} to complete the handover</p>
                        <p className="text-2xl font-mono font-bold tracking-[0.4em] text-blue-900">{r.pin}</p>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <button disabled={busyId === r.id} onClick={() => handleApprove(r.id)}
                          className="text-xs font-medium bg-green-600 text-white px-3 py-1.5 rounded-lg disabled:opacity-50">Approve</button>
                        <button disabled={busyId === r.id} onClick={() => handleDeny(r.id)}
                          className="text-xs font-medium bg-gray-100 text-gray-600 px-3 py-1.5 rounded-lg disabled:opacity-50">Deny</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {myRequests.filter(r => r.type === 'borrow_peer').length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">My requests</p>
              <div className="space-y-2">
                {myRequests.filter(r => r.type === 'borrow_peer').map(r => (
                  <div key={r.id} className="bg-white rounded-xl border border-gray-200 p-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{r.assets?.name}</p>
                      <p className="text-xs text-gray-500">{r.status === 'pending' ? 'Waiting for approval' : 'Approved — enter PIN in person to receive'}</p>
                    </div>
                    {r.status === 'approved' && (
                      <button onClick={() => { setPinRequest(r); setPinError(null) }}
                        className="text-xs font-medium bg-blue-600 text-white px-3 py-1.5 rounded-lg">Enter PIN</button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {lentOut.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Lent to colleagues</p>
              <div className="space-y-2">
                {lentOut.map(tool => (
                  <div key={tool.id} className="bg-white rounded-xl border border-gray-200 p-3">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-semibold text-gray-900">{tool.name}</p>
                      {isOverdue(tool) && <OverdueBadge />}
                    </div>
                    <p className="text-xs text-gray-500 mb-2">With {tool.holder?.full_name} · due {tool.due_back || 'not set'}</p>
                    <button disabled={busyId === tool.id} onClick={() => handleRecall(tool.id)} className="text-xs font-medium text-amber-700">
                      {busyId === tool.id ? 'Recalling…' : 'Recall (PIN-verified)'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">With me from colleagues</p>
            {colleagueHeld.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">No colleague tools checked out to you.</p>
            ) : (
              <div className="space-y-2">
                {colleagueHeld.map(tool => (
                  <div key={tool.id} className="bg-white rounded-xl border border-gray-200 p-3">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-semibold text-gray-900">{tool.name}</p>
                      <div className="flex items-center gap-1">
                        {isOverdue(tool) && <OverdueBadge />}
                        <ConditionBadge condition={tool.condition} />
                        <ToolMenu onReturn={() => setReturningTool(tool)} />
                      </div>
                    </div>
                    <p className="text-xs text-gray-500">
                      {tool.asset_categories?.name || 'Uncategorised'} · {formatCurrency(tool.value)}
                      {quantities[tool.id] > 1 ? ` · Qty: ${quantities[tool.id]}` : ''}
                      {tool.owner ? ` · owned by ${tool.owner.full_name}` : ''}
                      {tool.due_back ? ` · due ${tool.due_back}` : ''}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1">
              <Search size={12} /> Search colleagues' tools
            </p>
            <input
              value={colleagueSearch}
              onChange={e => setColleagueSearch(e.target.value)}
              placeholder="Search tool name…"
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 mb-2"
            />
            {colleagueSearch && colleagueResults.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">No results for "{colleagueSearch}"</p>
            )}
            {colleagueResults.length > 0 && (
              <div className="space-y-2">
                {colleagueResults.map(tool => (
                  <button key={tool.id} onClick={() => setSelectedTool(tool)}
                    className="w-full text-left bg-white rounded-xl border border-gray-200 p-3">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-semibold text-gray-900">{tool.name}</p>
                      <span className="text-xs font-medium text-amber-700">With {tool.holder?.full_name?.split(' ')[0] || 'someone'}</span>
                    </div>
                    <p className="text-xs text-gray-500">{tool.asset_categories?.name || 'Uncategorised'} · {formatCurrency(tool.value)}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {returningTool && (
        <ReturnRequestDialog tool={returningTool} saving={busyId === returningTool.id}
          onCancel={() => setReturningTool(null)} onConfirm={handleRequestReturn} />
      )}

      {pinRequest && (
        <PinDialog title={`Enter PIN for ${pinRequest.assets?.name}`} saving={busyId === pinRequest.id} error={pinError}
          onCancel={() => setPinRequest(null)} onConfirm={handleConfirmPin} />
      )}

      {pinReturn && (
        <PinDialog title={`Confirm return of ${pinReturn.assets?.name}`} saving={busyId === pinReturn.id} error={pinError}
          onCancel={() => setPinReturn(null)} onConfirm={handleConfirmReturnPin} />
      )}

      {pinReturnHandover && (
        <PinDialog title={`Confirm return of ${pinReturnHandover.assets?.name}`} saving={busyId === pinReturnHandover.id} error={pinError}
          onCancel={() => setPinReturnHandover(null)} onConfirm={handleConfirmReturnHandover} />
      )}

      {selectedTool && (
        <ToolDetailModal tool={selectedTool} profile={profile} saving={busyId === selectedTool.id}
          onCancel={() => setSelectedTool(null)}
          onRequestStoreroom={() => handleRequestStoreroom(selectedTool)}
          onRequestBorrow={() => handleRequestBorrow(selectedTool)}
        />
      )}
    </div>
  )
}
