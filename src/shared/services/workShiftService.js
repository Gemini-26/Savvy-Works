import { supabase } from '../../lib/supabase'
import { getCurrentProfile } from '../../services/authService'

// Fired whenever a clock-in/out happens, so every mounted widget showing
// shift state (the floating bubble, profile pages) can refetch and stay
// in sync — there's no shared store, so a DOM event is the simplest fix.
const WORKSHIFT_CHANGED = 'workshift:changed'

export function onWorkShiftChange(handler) {
  window.addEventListener(WORKSHIFT_CHANGED, handler)
  return () => window.removeEventListener(WORKSHIFT_CHANGED, handler)
}

function notifyWorkShiftChanged() {
  window.dispatchEvent(new Event(WORKSHIFT_CHANGED))
}

// The user's currently open shift (clocked in, not yet clocked out), if any.
export async function fetchActiveShift(technicianId) {
  const { data, error } = await supabase
    .from('work_shifts')
    .select('*')
    .eq('technician_id', technicianId)
    .is('clock_out', null)
    .order('clock_in', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function clockInForWork(technicianId) {
  const { data, error } = await supabase
    .from('work_shifts')
    .insert([{ technician_id: technicianId, clock_in: new Date().toISOString() }])
    .select()
  if (error) throw error
  notifyWorkShiftChanged()
  return data[0]
}

export async function clockOutForWork(shiftId) {
  const profile = await getCurrentProfile().catch(() => null)
  const { error } = await supabase
    .from('work_shifts')
    .update({ clock_out: new Date().toISOString(), clocked_out_by: profile?.id || null })
    .eq('id', shiftId)
  if (error) throw error
  notifyWorkShiftChanged()
}

// Admin correction of a day shift (e.g. clocked in two hours after
// starting work). The database trigger rejects this for non-admins and
// keeps the original times plus who changed them. Leaving clock_out empty
// keeps the shift open.
export async function adjustShiftTimes(shiftId, { clock_in, clock_out }, reason = '') {
  if (!clock_in) throw new Error('Clock-in time is required')
  if (clock_out && new Date(clock_out) <= new Date(clock_in)) throw new Error('Clock-out must be after clock-in')
  const now = Date.now() + 60_000
  if (new Date(clock_in) > now || (clock_out && new Date(clock_out) > now)) {
    throw new Error("Times can't be in the future")
  }

  const { data: current, error: fetchErr } = await supabase
    .from('work_shifts').select('technician_id, clock_out').eq('id', shiftId).maybeSingle()
  if (fetchErr) throw fetchErr
  if (!current) throw new Error('Shift not found')

  const updates = { clock_in, clock_out: clock_out || null, adjustment_reason: reason.trim() || null }
  if (clock_out && !current.clock_out) {
    // An admin closing someone's open shift here is the same as force-clocking them out.
    const profile = await getCurrentProfile().catch(() => null)
    updates.clocked_out_by = profile?.id || null
  }
  if (!clock_out && current.clock_out) {
    // Reopening a finished shift — only if they don't already have one open.
    const open = await fetchActiveShift(current.technician_id)
    if (open) throw new Error('They already have an open shift — close that one first')
    updates.clocked_out_by = null
  }

  const { data, error } = await supabase.from('work_shifts').update(updates).eq('id', shiftId).select('id')
  if (error) throw error
  if (!data?.length) throw new Error('Update failed — no rows were changed. Check your permissions.')
  notifyWorkShiftChanged()
}

// Called periodically from the browser (Geolocation API) while a shift is
// open. Doesn't fire the workshift:changed event — this isn't a state
// change other widgets need to react to, just a background position update.
export async function updateShiftLocation(shiftId, lat, lng) {
  const { error } = await supabase
    .from('work_shifts')
    .update({ last_lat: lat, last_lng: lng, last_location_at: new Date().toISOString() })
    .eq('id', shiftId)
  if (error) throw error
}

// Most recent closed shifts, newest first — used to show a per-day clock history.
export async function fetchShiftHistory(technicianId, limit = 30) {
  const { data, error } = await supabase
    .from('work_shifts')
    .select('*, clocked_out_by_profile:clocked_out_by (full_name)')
    .eq('technician_id', technicianId)
    .not('clock_out', 'is', null)
    .order('clock_in', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data || []
}

// Company-wide: everyone currently clocked in (clock_out still null), newest first.
export async function fetchActiveShiftsForCompany() {
  const { data, error } = await supabase
    .from('work_shifts')
    .select('*, profiles:technician_id (id, full_name, role, color)')
    .is('clock_out', null)
    .order('clock_in', { ascending: false })
  if (error) throw error
  return data || []
}

// Company-wide: most recent completed shifts across all users, newest first.
export async function fetchShiftHistoryForCompany(limit = 100) {
  const { data, error } = await supabase
    .from('work_shifts')
    .select('*, profiles:technician_id (id, full_name, role, color), clocked_out_by_profile:clocked_out_by (full_name)')
    .not('clock_out', 'is', null)
    .order('clock_in', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data || []
}
