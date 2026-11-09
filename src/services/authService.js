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

// Set just before a deactivated person is signed out, so the login page can
// say why instead of dropping them on a blank form.
export const DEACTIVATED_FLAG = 'savvy_account_deactivated'

export const DEACTIVATED_MESSAGE = 'Your account has been deactivated. Please contact your administrator.'

export async function endDeactivatedSession() {
  try { sessionStorage.setItem(DEACTIVATED_FLAG, '1') } catch { /* private mode etc. */ }
  await supabase.auth.signOut()
}

// Asks the server whether the current login may still be used.
//   'ok'       - signed in and the profile is active
//   'inactive' - the profile has been deactivated
//   'revoked'  - the server no longer accepts this session (banned or its
//                session was revoked when the person was deactivated)
//   'unknown'  - couldn't tell (offline, server hiccup): do nothing
export async function checkAccess() {
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error) return (error.status === 401 || error.status === 403) ? 'revoked' : 'unknown'
  if (!user) return 'unknown'

  const { data, error: profileError } = await supabase
    .from('profiles')
    .select('is_active')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (profileError || !data) return 'unknown'
  return data.is_active === false ? 'inactive' : 'ok'
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
