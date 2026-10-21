import { useEffect, useState } from 'react'
import { fetchMyPolicies, POLICIES_CHANGED } from '../services/policyService'

// How many documents the signed-in person has signed / still has to sign.
// Re-counts whenever one is signed, published or withdrawn anywhere in the app.
export function usePolicyProgress(profile) {
  const [state, setState] = useState({ loading: true, error: null, signed: 0, total: 0, outstanding: 0, first: null })

  useEffect(() => {
    if (!profile?.id) return
    let cancelled = false
    function load() {
      fetchMyPolicies(profile)
        .then(r => {
          if (cancelled) return
          const next = r.items.find(i => !i.signature)
          setState({ loading: false, error: null, signed: r.signed, total: r.total, outstanding: r.outstanding, first: next?.doc ?? null })
        })
        // A counting hiccup must never get in the way of the rest of the app,
        // but it must not fail silently either: the card says it couldn't load.
        .catch(err => { if (!cancelled) setState(s => ({ ...s, loading: false, error: err.message || 'Could not load' })) })
    }
    load()
    window.addEventListener(POLICIES_CHANGED, load)
    return () => { cancelled = true; window.removeEventListener(POLICIES_CHANGED, load) }
  }, [profile])

  return state
}
