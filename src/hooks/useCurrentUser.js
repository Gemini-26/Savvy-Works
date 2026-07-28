import { useEffect, useRef, useState } from 'react'
import { getCurrentProfile, onSessionChange } from '../services/authService'

export function useCurrentUser() {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const lastUserId = useRef(undefined)

  useEffect(() => {
    function load() {
      setLoading(true)
      getCurrentProfile()
        .then(setProfile)
        .catch(() => setProfile(null))
        .finally(() => setLoading(false))
    }

    load()

    // Only reload when the logged-in user actually changes (login/logout/
    // account switch) — Supabase also fires this on token refresh, which
    // would otherwise retrigger getCurrentProfile() -> getUser() in a loop.
    const subscription = onSessionChange((session) => {
      const userId = session?.user?.id ?? null
      if (userId === lastUserId.current) return
      lastUserId.current = userId
      load()
    })
    return () => subscription.unsubscribe()
  }, [])

  return { profile, loading, isAdmin: profile?.role === 'admin' }
}
