import { supabase } from '../../../lib/supabase'
import { getCurrentProfile } from '../../../services/authService'
import { notifyUser, notifyAdmins } from '../../../shared/services/notificationService'

const ASSET_SELECT = '*, asset_categories(name), owner:owner_id(id, full_name), holder:holder_id(id, full_name)'
const genPin = () => String(Math.floor(1000 + Math.random() * 9000))
const DUE_BACK_DAYS = 7
const RECALL_NOTICE_DAYS = 2

// ── Assets ──────────────────────────────────────────────────────

export async function fetchAssets({ activeOnly, categoryId, search, assetGroup } = {}) {
  let query = supabase.from('assets').select(ASSET_SELECT).order('name')

  if (activeOnly !== undefined) query = query.eq('active', activeOnly)
  if (categoryId)               query = query.eq('category_id', categoryId)
  if (assetGroup)               query = query.eq('asset_group', assetGroup)
  if (search)                   query = query.or(`name.ilike.%${search}%,barcode.ilike.%${search}%,serial_number.ilike.%${search}%`)

  const { data, error } = await query
  if (error) throw error
  return data || []
}

export async function fetchAsset(id) {
  const { data, error } = await supabase
    .from('assets')
    .select(ASSET_SELECT)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('Asset not found.')
  return data
}

export async function createAsset(asset) {
  const { data, error } = await supabase.from('assets').insert([asset]).select().maybeSingle()
  if (error) throw error
  return data
}

export async function updateAsset(id, updates) {
  const { data, error } = await supabase.from('assets').update(updates).eq('id', id).select()
  if (error) throw error
  if (!data || data.length === 0) throw new Error('Update failed — no rows were changed. Check your permissions.')
}

export async function fetchTechnicians() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('role', 'technician')
    .eq('is_active', true)
    .order('full_name')
  if (error) throw error
  return data || []
}

export async function fetchAssetCategories() {
  const { data, error } = await supabase.from('asset_categories').select('*').order('name')
  if (error) throw error
  return data || []
}

export async function createAssetCategory(name) {
  const { error } = await supabase.from('asset_categories').insert([{ name }])
  if (error) throw error
}

export async function deleteAssetCategory(id) {
  const { error } = await supabase.from('asset_categories').delete().eq('id', id)
  if (error) throw error
}

// ── Technician: what's with me / in the storeroom ──────────────

// Tools currently in this technician's possession.
export async function fetchMyTools(technicianId) {
  const { data, error } = await supabase
    .from('assets')
    .select(ASSET_SELECT)
    .eq('holder_id', technicianId)
    .order('name')
  if (error) throw error
  return data || []
}

export async function fetchStoreroomTools(search) {
  let query = supabase
    .from('assets')
    .select(ASSET_SELECT)
    .eq('status', 'warehouse')
    .eq('asset_group', 'tool_inventory')
    .eq('active', true)
    .order('name')
  if (search) query = query.or(`name.ilike.%${search}%,barcode.ilike.%${search}%`)

  const { data, error } = await query
  if (error) throw error
  return data || []
}

// Tools currently held by someone other than this technician.
export async function fetchBorrowableTools(technicianId, search) {
  let query = supabase
    .from('assets')
    .select(ASSET_SELECT)
    .eq('status', 'checked_out')
    .eq('asset_group', 'tool_inventory')
    .neq('holder_id', technicianId)
    .order('name')
  if (search) query = query.or(`name.ilike.%${search}%`)

  const { data, error } = await query
  if (error) throw error
  return data || []
}

// Tools this technician has lent out to a colleague (used to power recall).
export async function fetchLentOutTools(technicianId) {
  const { data, error } = await supabase
    .from('assets')
    .select(ASSET_SELECT)
    .eq('status', 'checked_out')
    .neq('holder_id', technicianId)
    .order('name')
  if (error) throw error
  const results = []
  for (const asset of data || []) {
    const { data: lastLog } = await supabase
      .from('asset_checkout_log')
      .select('from_id')
      .eq('asset_id', asset.id)
      .eq('action', 'checked_out')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (lastLog?.from_id === technicianId) results.push(asset)
  }
  return results
}

// ── Requests: borrow from colleague, borrow from storeroom ─────

export async function requestBorrow(assetId, holderId, borrowerId, note) {
  const asset = await fetchAsset(assetId)
  const { error } = await supabase
    .from('asset_requests')
    .insert([{ asset_id: assetId, type: 'borrow_peer', from_id: holderId, to_id: borrowerId, status: 'pending', note: note || '' }])
  if (error) throw error

  const profile = await getCurrentProfile().catch(() => null)
  await notifyUser(holderId, {
    title: 'Tool request',
    body: `${profile?.full_name || 'A colleague'} would like to borrow your "${asset.name}".`,
    link: '/tools',
  }).catch(() => {})
}

// A tool sitting in the storeroom still needs an admin to hand it
// over and confirm with a PIN — technicians can no longer self-serve.
export async function requestStoreroom(assetId, technicianId, note) {
  const asset = await fetchAsset(assetId)
  if (asset.status !== 'warehouse') throw new Error('This tool is not in the storeroom.')

  const { error } = await supabase
    .from('asset_requests')
    .insert([{ asset_id: assetId, type: 'borrow_storeroom', from_id: null, to_id: technicianId, status: 'pending', note: note || '' }])
  if (error) throw error

  const profile = await getCurrentProfile().catch(() => null)
  await notifyAdmins({
    title: 'Storeroom tool request',
    body: `${profile?.full_name || 'A technician'} requested "${asset.name}" from the storeroom.`,
    link: '/items/assets/active',
  }).catch(() => {})
}

// Requests this technician has sent (peer or storeroom).
export async function fetchMyRequests(technicianId) {
  const { data, error } = await supabase
    .from('asset_requests')
    .select('*, assets(id, name, value, condition)')
    .eq('to_id', technicianId)
    .eq('type', 'borrow_peer')
    .order('created_at', { ascending: false })
  const storeroom = await supabase
    .from('asset_requests')
    .select('*, assets(id, name, value, condition)')
    .eq('to_id', technicianId)
    .eq('type', 'borrow_storeroom')
    .order('created_at', { ascending: false })
  if (error) throw error
  if (storeroom.error) throw storeroom.error
  return [...(data || []), ...(storeroom.data || [])].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
}

// Peer requests against this technician's tools — pending ones need
// an approve/deny decision, approved ones still need the PIN shown.
export async function fetchIncomingRequests(technicianId) {
  const { data, error } = await supabase
    .from('asset_requests')
    .select('*, assets(id, name, value, condition), requester:to_id(full_name)')
    .eq('from_id', technicianId)
    .eq('type', 'borrow_peer')
    .in('status', ['pending', 'approved'])
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

// Admin queue: storeroom requests waiting on an approval decision.
export async function fetchStoreroomRequests() {
  const { data, error } = await supabase
    .from('asset_requests')
    .select('*, assets(id, name, value, condition), requester:to_id(full_name)')
    .eq('type', 'borrow_storeroom')
    .in('status', ['pending', 'approved'])
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

// Current holder (peer) or admin (storeroom) approves — generates the
// one-time PIN they'll show the requester in person.
export async function approveRequest(requestId, approverId) {
  const pin = genPin()
  const { data: existing, error: fetchErr } = await supabase
    .from('asset_requests')
    .select('from_id')
    .eq('id', requestId)
    .maybeSingle()
  if (fetchErr) throw fetchErr

  const updates = { status: 'approved', pin }
  if (!existing?.from_id && approverId) updates.from_id = approverId

  const { data: request, error } = await supabase
    .from('asset_requests')
    .update(updates)
    .eq('id', requestId)
    .select('*, assets(name)')
    .maybeSingle()
  if (error) throw error
  if (!request) throw new Error('Request not found.')

  await notifyUser(request.to_id, {
    title: 'Request approved',
    body: `Your request for "${request.assets?.name}" was approved. Get the PIN in person to complete the handover.`,
    link: '/tools',
  }).catch(() => {})
  return request
}

export async function denyRequest(requestId) {
  const { data: request, error } = await supabase
    .from('asset_requests')
    .update({ status: 'denied', resolved_at: new Date().toISOString() })
    .eq('id', requestId)
    .select('*, assets(name)')
    .maybeSingle()
  if (error) throw error
  if (!request) return
  await notifyUser(request.to_id, {
    title: 'Request denied',
    body: `Your request for "${request.assets?.name}" was denied.`,
    link: '/tools',
  }).catch(() => {})
}

// Requester enters the PIN shown by the holder/admin — this is what
// actually transfers the tool. Both parties must be present in person.
export async function confirmHandoverPin(requestId, enteredPin) {
  const { data: request, error: reqErr } = await supabase
    .from('asset_requests')
    .select('*, assets(*)')
    .eq('id', requestId)
    .maybeSingle()
  if (reqErr) throw reqErr
  if (!request) throw new Error('Request not found.')
  if (request.status !== 'approved') throw new Error('This request is not ready for handover.')
  if (request.pin_used) throw new Error('This PIN has already been used.')
  if (enteredPin !== request.pin) throw new Error('Incorrect PIN. Ask them to show their PIN again.')

  const nowIso = new Date().toISOString()
  const dueBack = new Date()
  dueBack.setDate(dueBack.getDate() + DUE_BACK_DAYS)

  const { error: assetErr } = await supabase
    .from('assets')
    .update({ holder_id: request.to_id, status: 'checked_out', since: nowIso, due_back: dueBack.toISOString().slice(0, 10) })
    .eq('id', request.asset_id)
  if (assetErr) throw assetErr

  await supabase.from('asset_checkout_log').insert([{
    asset_id: request.asset_id, action: 'checked_out', from_id: request.from_id, to_id: request.to_id,
    condition_out: request.assets?.condition,
    comment_out: request.type === 'borrow_storeroom' ? 'PIN-verified storeroom handover' : 'PIN-verified peer handover',
  }])

  await supabase
    .from('asset_requests')
    .update({ status: 'completed', pin_used: true, resolved_at: nowIso })
    .eq('id', requestId)

  if (request.from_id) {
    await notifyUser(request.from_id, {
      title: 'Handover confirmed',
      body: `Handover of "${request.assets?.name}" was confirmed with a verified PIN.`,
      link: '/tools',
    }).catch(() => {})
  }
}

// ── Recalls (PIN-verified return, admin- or peer-initiated) ────

// A lender or admin asks for a tool back. The current holder must
// generate a PIN when they're ready to hand it back; the recaller
// enters that PIN to confirm receipt — same trust model as borrowing,
// just reversed.
export async function requestRecall(assetId, recallerId, { toStoreroom = false } = {}) {
  const asset = await fetchAsset(assetId)
  if (!asset.holder_id) throw new Error('This tool has no current holder to recall from.')

  const { error } = await supabase
    .from('asset_requests')
    .insert([{ asset_id: assetId, type: 'recall', from_id: recallerId, to_id: asset.holder_id, status: 'pending', return_to_storeroom: toStoreroom }])
  if (error) throw error

  if (!asset.due_back) {
    const dueBack = new Date()
    dueBack.setDate(dueBack.getDate() + RECALL_NOTICE_DAYS)
    await supabase.from('assets').update({ due_back: dueBack.toISOString().slice(0, 10) }).eq('id', assetId)
  }

  await notifyUser(asset.holder_id, {
    title: 'Tool recalled',
    body: `Please return "${asset.name}" within ${RECALL_NOTICE_DAYS} days. Generate a handover PIN when you're ready.`,
    link: '/tools',
  }).catch(() => {})
}

// Recall requests this technician/admin has sent, still open.
export async function fetchMyRecalls(profileId) {
  const { data, error } = await supabase
    .from('asset_requests')
    .select('*, assets(id, name, value, condition), holder:to_id(full_name)')
    .eq('from_id', profileId)
    .eq('type', 'recall')
    .in('status', ['pending', 'approved'])
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

// Recalls against tools this technician currently holds.
export async function fetchIncomingRecalls(technicianId) {
  const { data, error } = await supabase
    .from('asset_requests')
    .select('*, assets(id, name, value, condition), recaller:from_id(full_name)')
    .eq('to_id', technicianId)
    .eq('type', 'recall')
    .in('status', ['pending', 'approved'])
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

// Holder confirms they're physically ready to hand the tool back —
// generates the PIN the recaller will enter.
export async function generateReturnPin(requestId) {
  const pin = genPin()
  const { data: request, error } = await supabase
    .from('asset_requests')
    .update({ status: 'approved', pin })
    .eq('id', requestId)
    .select('*, assets(name)')
    .maybeSingle()
  if (error) throw error
  if (!request) throw new Error('Request not found.')

  await notifyUser(request.from_id, {
    title: 'Ready for handover',
    body: `"${request.assets?.name}" is ready to be returned. Get the PIN in person to confirm.`,
    link: request.return_to_storeroom ? '/items/assets/active' : '/tools',
  }).catch(() => {})
  return request
}

// Recaller enters the PIN — transfers the tool back to them (or to
// the storeroom, for admin-initiated recalls).
export async function confirmReturnPin(requestId, enteredPin) {
  const { data: request, error: reqErr } = await supabase
    .from('asset_requests')
    .select('*, assets(*)')
    .eq('id', requestId)
    .maybeSingle()
  if (reqErr) throw reqErr
  if (!request) throw new Error('Request not found.')
  if (request.status !== 'approved') throw new Error('This recall is not ready for handover yet.')
  if (request.pin_used) throw new Error('This PIN has already been used.')
  if (enteredPin !== request.pin) throw new Error('Incorrect PIN. Ask them to show their PIN again.')

  const nowIso = new Date().toISOString()
  const backToOwner = !request.return_to_storeroom && request.assets?.owner_id === request.from_id
  const updates = request.return_to_storeroom
    ? { holder_id: null, status: 'warehouse', since: null, due_back: null }
    : { holder_id: request.from_id, status: backToOwner ? 'with_owner' : 'checked_out', since: nowIso, due_back: null }

  const { error: assetErr } = await supabase.from('assets').update(updates).eq('id', request.asset_id)
  if (assetErr) throw assetErr

  await supabase.from('asset_checkout_log').insert([{
    asset_id: request.asset_id, action: 'returned', from_id: request.to_id, to_id: request.return_to_storeroom ? null : request.from_id,
    condition_in: request.assets?.condition, comment_in: 'PIN-verified recall',
  }])

  await supabase
    .from('asset_requests')
    .update({ status: 'completed', pin_used: true, resolved_at: nowIso })
    .eq('id', requestId)

  await notifyUser(request.to_id, {
    title: 'Return confirmed',
    body: `Your return of "${request.assets?.name}" was confirmed with a verified PIN.`,
    link: '/tools',
  }).catch(() => {})
}

// ── Returns (technician-initiated, admin/colleague-approved, PIN) ──

// Current holder asks to return a tool — to the storeroom (admin
// approves) or to a colleague (that colleague approves). Unlike the
// old instant self-return, this always needs an approval + PIN.
export async function requestReturn(assetId, technicianId, { toStoreroom = true, colleagueId = null, note } = {}) {
  const asset = await fetchAsset(assetId)
  if (asset.holder_id !== technicianId) throw new Error('You are not the current holder of this tool.')

  const { error } = await supabase
    .from('asset_requests')
    .insert([{
      asset_id: assetId,
      from_id: technicianId,
      to_id: toStoreroom ? null : colleagueId,
      type: 'return',
      status: 'pending',
      return_to_storeroom: toStoreroom,
      note: note || '',
    }])
  if (error) throw error

  if (toStoreroom) {
    await notifyAdmins({
      title: 'Tool return requested',
      body: `A technician wants to return "${asset.name}" to the storeroom.`,
      link: '/items/assets/active',
    }).catch(() => {})
  } else if (colleagueId) {
    await notifyUser(colleagueId, {
      title: 'Tool return requested',
      body: `A colleague wants to return "${asset.name}" to you.`,
      link: '/tools',
    }).catch(() => {})
  }
}

// Return requests this technician has sent, still open.
export async function fetchMyReturnRequests(technicianId) {
  const { data, error } = await supabase
    .from('asset_requests')
    .select('*, assets(id, name, value, condition)')
    .eq('from_id', technicianId)
    .eq('type', 'return')
    .in('status', ['pending', 'approved'])
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

// Return requests waiting on this colleague's approval/PIN entry.
export async function fetchIncomingReturns(profileId) {
  const { data, error } = await supabase
    .from('asset_requests')
    .select('*, assets(id, name, value, condition), returner:from_id(full_name)')
    .eq('to_id', profileId)
    .eq('type', 'return')
    .in('status', ['pending', 'approved'])
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

// Admin queue: storeroom returns waiting on an approval decision.
export async function fetchStoreroomReturns() {
  const { data, error } = await supabase
    .from('asset_requests')
    .select('*, assets(id, name, value, condition), returner:from_id(full_name)')
    .eq('type', 'return')
    .eq('return_to_storeroom', true)
    .in('status', ['pending', 'approved'])
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

// Receiving party (admin for storeroom, colleague for peer) approves
// the return — generates the PIN the returning technician will show.
export async function approveReturn(requestId, approverId) {
  const pin = genPin()
  const { data: existing, error: fetchErr } = await supabase
    .from('asset_requests')
    .select('to_id')
    .eq('id', requestId)
    .maybeSingle()
  if (fetchErr) throw fetchErr

  const updates = { status: 'approved', pin }
  if (!existing?.to_id && approverId) updates.to_id = approverId

  const { data: request, error } = await supabase
    .from('asset_requests')
    .update(updates)
    .eq('id', requestId)
    .select('*, assets(name)')
    .maybeSingle()
  if (error) throw error
  if (!request) throw new Error('Request not found.')

  await notifyUser(request.from_id, {
    title: 'Return approved',
    body: `Your return of "${request.assets?.name}" was approved. Show your PIN in person to confirm.`,
    link: '/tools',
  }).catch(() => {})
  return request
}

export async function denyReturn(requestId) {
  const { data: request, error } = await supabase
    .from('asset_requests')
    .update({ status: 'denied', resolved_at: new Date().toISOString() })
    .eq('id', requestId)
    .select('*, assets(name)')
    .maybeSingle()
  if (error) throw error
  if (!request) return
  await notifyUser(request.from_id, {
    title: 'Return denied',
    body: `Your return of "${request.assets?.name}" was denied.`,
    link: '/tools',
  }).catch(() => {})
}

// Receiving party enters the PIN shown by the returning technician —
// this is what actually transfers the tool back.
export async function confirmReturnHandover(requestId, enteredPin) {
  const { data: request, error: reqErr } = await supabase
    .from('asset_requests')
    .select('*, assets(*)')
    .eq('id', requestId)
    .maybeSingle()
  if (reqErr) throw reqErr
  if (!request) throw new Error('Request not found.')
  if (request.status !== 'approved') throw new Error('This return is not ready for handover yet.')
  if (request.pin_used) throw new Error('This PIN has already been used.')
  if (enteredPin !== request.pin) throw new Error('Incorrect PIN. Ask them to show their PIN again.')

  const nowIso = new Date().toISOString()
  const backToOwner = !request.return_to_storeroom && request.assets?.owner_id === request.to_id
  const updates = request.return_to_storeroom
    ? { holder_id: null, status: 'warehouse', since: null, due_back: null }
    : { holder_id: request.to_id, status: backToOwner ? 'with_owner' : 'checked_out', since: nowIso, due_back: null }

  const { error: assetErr } = await supabase.from('assets').update(updates).eq('id', request.asset_id)
  if (assetErr) throw assetErr

  await supabase.from('asset_checkout_log').insert([{
    asset_id: request.asset_id, action: 'returned', from_id: request.from_id,
    to_id: request.return_to_storeroom ? null : request.to_id,
    condition_in: request.assets?.condition, comment_in: 'PIN-verified return',
  }])

  await supabase
    .from('asset_requests')
    .update({ status: 'completed', pin_used: true, resolved_at: nowIso })
    .eq('id', requestId)

  await notifyUser(request.from_id, {
    title: 'Return confirmed',
    body: `Your return of "${request.assets?.name}" was confirmed with a verified PIN.`,
    link: '/tools',
  }).catch(() => {})
}

export function isOverdue(asset) {
  return Boolean(asset.due_back) && asset.status === 'checked_out' && new Date(asset.due_back) < new Date(new Date().toDateString())
}

export async function fetchOverdueAssets() {
  const today = new Date().toISOString().slice(0, 10)
  const { data, error } = await supabase
    .from('assets')
    .select(ASSET_SELECT)
    .eq('status', 'checked_out')
    .not('due_back', 'is', null)
    .lt('due_back', today)
    .order('due_back')
  if (error) throw error
  return data || []
}

export async function sendOverdueReminder(assetId) {
  const asset = await fetchAsset(assetId)
  if (!asset.holder_id) return
  await notifyUser(asset.holder_id, {
    title: 'Overdue tool reminder',
    body: `"${asset.name}" was due back ${asset.due_back} and is now overdue. Please return it as soon as possible.`,
    link: '/tools',
  }).catch(() => {})
}

// Technician (or admin, on a technician's behalf) returns a tool to the storeroom directly.
export async function returnAsset(assetId, { condition, comment } = {}) {
  const asset = await fetchAsset(assetId)
  const previousHolder = asset.holder_id

  const { error } = await supabase
    .from('assets')
    .update({ holder_id: null, status: 'warehouse', since: null, due_back: null, condition: condition || asset.condition })
    .eq('id', assetId)
  if (error) throw error

  await supabase.from('asset_checkout_log').insert([{
    asset_id: assetId, action: 'returned', from_id: previousHolder,
    condition_in: condition || asset.condition, comment_in: comment || '',
  }])

  await notifyAdmins({
    title: 'Tool returned',
    body: `"${asset.name}" was returned to the storeroom${condition === 'Damaged' ? ' — marked damaged' : ''}.`,
    link: `/items/assets/active`,
  }).catch(() => {})
}

// Admin assigns/reassigns a tool directly (no checkout request needed).
export async function assignAsset(assetId, technicianId) {
  const asset = await fetchAsset(assetId)
  const nowIso = new Date().toISOString()

  const { error } = await supabase
    .from('assets')
    .update({ holder_id: technicianId, status: 'checked_out', since: nowIso })
    .eq('id', assetId)
  if (error) throw error

  await supabase.from('asset_checkout_log').insert([{
    asset_id: assetId, action: 'checked_out', from_id: asset.holder_id, to_id: technicianId,
    condition_out: asset.condition, comment_out: 'Assigned by admin',
  }])

  await notifyUser(technicianId, {
    title: 'Tool assigned to you',
    body: `"${asset.name}" has been assigned to you.`,
    link: '/tools',
  }).catch(() => {})
}

// ── Full history for the admin "view history" kebab action ─────

export async function fetchAssetFullHistory(assetId) {
  const [logRes, reqRes] = await Promise.all([
    supabase
      .from('asset_checkout_log')
      .select('*, from_profile:from_id(full_name), to_profile:to_id(full_name)')
      .eq('asset_id', assetId)
      .order('created_at', { ascending: false }),
    supabase
      .from('asset_requests')
      .select('*, from_profile:from_id(full_name), to_profile:to_id(full_name)')
      .eq('asset_id', assetId)
      .order('created_at', { ascending: false }),
  ])
  if (logRes.error) throw logRes.error
  if (reqRes.error) throw reqRes.error

  const logEvents = (logRes.data || []).map(row => ({
    id: `log-${row.id}`,
    at: row.created_at,
    label: row.action === 'checked_out'
      ? `Checked out${row.to_profile?.full_name ? ` to ${row.to_profile.full_name}` : ''}`
      : `Returned${row.from_profile?.full_name ? ` by ${row.from_profile.full_name}` : ''}`,
    detail: row.action === 'checked_out' ? (row.comment_out || null) : (row.comment_in || null),
    condition: row.action === 'checked_out' ? row.condition_out : row.condition_in,
    pin: null,
  }))

  const requestEvents = []
  for (const r of reqRes.data || []) {
    const kindLabel = r.type === 'recall' ? 'Recall' : r.type === 'return' ? 'Return' : r.type === 'borrow_storeroom' ? 'Storeroom request' : 'Borrow request'
    const openedBy = r.type === 'return' ? r.from_profile?.full_name : (r.to_profile?.full_name || r.from_profile?.full_name)
    requestEvents.push({
      id: `req-${r.id}-created`,
      at: r.created_at,
      label: `${kindLabel} opened by ${openedBy || 'someone'}`,
      detail: r.note || null,
      condition: null,
      pin: null,
    })
    if (r.pin) {
      const approvedBy = r.type === 'return' ? (r.to_profile?.full_name || 'admin') : (r.from_profile?.full_name || 'admin')
      requestEvents.push({
        id: `req-${r.id}-approved`,
        at: r.created_at,
        label: `Approved by ${approvedBy} — PIN issued`,
        detail: null,
        condition: null,
        pin: r.pin,
      })
    }
    if (r.status === 'completed' && r.resolved_at) {
      requestEvents.push({
        id: `req-${r.id}-completed`,
        at: r.resolved_at,
        label: r.type === 'return' ? 'Return confirmed with verified PIN' : `Handover confirmed with verified PIN`,
        detail: null,
        condition: null,
        pin: r.pin,
      })
    }
    if (r.status === 'denied') {
      requestEvents.push({
        id: `req-${r.id}-denied`,
        at: r.resolved_at || r.created_at,
        label: `Request denied`,
        detail: null,
        condition: null,
        pin: null,
      })
    }
  }

  return [...logEvents, ...requestEvents].sort((a, b) => new Date(b.at) - new Date(a.at))
}

// ── Tool / Inventory lists ──────────────────────────────────────

export async function fetchAssetLists(listType, assignedTo) {
  let query = supabase
    .from('asset_lists')
    .select('*, assignee:assigned_to(full_name), items:asset_list_items(id, quantity, asset:asset_id(id, name, value, condition, item_kind, holder_id, status))')
    .order('name')
  if (listType)   query = query.eq('list_type', listType)
  if (assignedTo) query = query.eq('assigned_to', assignedTo)
  const { data, error } = await query
  if (error) throw error
  return data || []
}

export async function fetchAssetList(id) {
  const { data, error } = await supabase
    .from('asset_lists')
    .select('*, assignee:assigned_to(full_name), items:asset_list_items(id, quantity, asset:asset_id(id, name, value, item_kind, holder_id, status))')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('List not found.')
  return data
}

export async function createAssetList({ name, listType, assignedTo, assetIds = [] }) {
  const { data, error } = await supabase
    .from('asset_lists')
    .insert([{ name, list_type: listType, assigned_to: assignedTo || null }])
    .select()
    .maybeSingle()
  if (error) throw error

  if (assetIds.length > 0) {
    const { error: itemsErr } = await supabase
      .from('asset_list_items')
      .insert(assetIds.map(assetId => ({ list_id: data.id, asset_id: assetId })))
    if (itemsErr) throw itemsErr
  }

  if (assignedTo) {
    await notifyUser(assignedTo, {
      title: 'Tool list assigned',
      body: `You've been assigned the "${name}" list.`,
      link: '/tools',
    }).catch(() => {})
  }
  return data
}

export async function updateAssetList(id, { name, assignedTo }) {
  const { error } = await supabase
    .from('asset_lists')
    .update({ name, assigned_to: assignedTo || null, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function deleteAssetList(id) {
  const { error } = await supabase.from('asset_lists').delete().eq('id', id)
  if (error) throw error
}

export async function addListItem(listId, assetId, quantity = 1) {
  const { error } = await supabase.from('asset_list_items').insert([{ list_id: listId, asset_id: assetId, quantity }])
  if (error) throw error
}

export async function removeListItem(itemId) {
  const { error } = await supabase.from('asset_list_items').delete().eq('id', itemId)
  if (error) throw error
}

// Duplicating a list clones each item as a brand-new physical asset
// row (not a second reference to the same tool) so the new
// technician gets their own unit rather than sharing one with the
// original — this is what lets an admin build a 100-item template
// once and stamp out a fresh, independently-tracked copy per person.
export async function duplicateAssetList(id, { name, assignedTo } = {}) {
  const original = await fetchAssetList(id)
  const nowIso = new Date().toISOString()

  const newAssetIds = []
  for (const item of original.items || []) {
    const src = item.asset
    const { data: clone, error } = await supabase
      .from('assets')
      .insert([{
        name: src.name,
        item_kind: src.item_kind,
        asset_group: 'tool_inventory',
        value: src.value,
        condition: src.condition || 'Good',
        holder_id: assignedTo || null,
        status: assignedTo ? 'checked_out' : 'warehouse',
        since: assignedTo ? nowIso : null,
      }])
      .select()
      .maybeSingle()
    if (error) throw error
    newAssetIds.push(clone.id)

    if (assignedTo) {
      await supabase.from('asset_checkout_log').insert([{
        asset_id: clone.id, action: 'checked_out', to_id: assignedTo,
        condition_out: clone.condition, comment_out: `Cloned from "${original.name}" list duplication`,
      }])
    }
  }

  const copy = await createAssetList({
    name: name || `${original.name} (copy)`,
    listType: original.list_type,
    assignedTo: assignedTo || null,
    assetIds: newAssetIds,
  })
  return copy
}
