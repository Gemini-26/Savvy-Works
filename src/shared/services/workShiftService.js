import { supabase } from '../../lib/supabase'

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
  const { error } = await supabase
    .from('work_shifts')
    .update({ clock_out: new Date().toISOString() })
    .eq('id', shiftId)
  if (error) throw error
  notifyWorkShiftChanged()
}

// Most recent closed shifts, newest first — used to show a per-day clock history.
export async function fetchShiftHistory(technicianId, limit = 30) {
  const { data, error } = await supabase
    .from('work_shifts')
    .select('*')
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
    .select('*, profiles:technician_id (id, full_name, role, color)')
    .not('clock_out', 'is', null)
    .order('clock_in', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data || []
}
