import { useEffect, useRef, useState } from 'react'
import { getCurrentProfile, onSessionChange } from '../services/authService'
import { onAvatarChange } from '../shared/services/avatarService'

export function useCurrentUser() {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const lastUserId = useRef(undefined)

  // A new profile picture shows in the header and on the profile page straight
  // away, without a reload.
  useEffect(() => onAvatarChange((profileId, avatarUrl) => {
    setProfile(p => (p && p.id === profileId ? { ...p, avatar_url: avatarUrl } : p))
  }), [])

  useEffect(() => {
    function load() {
      setLoading(true)
      setFailed(false)
      getCurrentProfile()
        .then(setProfile)
        .catch(() => { setProfile(null); setFailed(true) })
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

  return { profile, loading, failed, isAdmin: profile?.role === 'admin' }
}
