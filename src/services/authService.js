import { supabase } from '../lib/supabase'

export async function getCurrentSession() {
  const { data: { session } } = await supabase.auth.getSession()
  return session
}

export function onSessionChange(callback) {
  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session)
  })
  return subscription
}

// Returns the profile row for the currently logged-in user, or null.
export async function getCurrentProfile() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase
    .from('profiles')
    .select('*, companies(name, currency, logo_url)')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (error) throw error
  return data
}

// Returns just the company_id for the logged-in user — useful for inserts.
export async function getMyCompanyId() {
  const profile = await getCurrentProfile()
  return profile?.company_id ?? null
}

// Records a login event for the "User Logs" admin page. Best-effort —
// never let a logging failure block sign-in.
export async function logLoginEvent() {
  const profile = await getCurrentProfile().catch(() => null)
  if (!profile) return
  await supabase.from('login_events').insert({ profile_id: profile.id }).then(
    () => {},
    () => {}
  )
}
