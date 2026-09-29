import { useEffect, useRef } from 'react'

// Re-runs `refresh` when the page/app comes back to the foreground and on a
// slow interval, so technician screens pick up office changes (a visit
// deleted, a technician removed) without a manual reload. Technicians leave
// the app open in the background all day, so load-once goes stale fast.
export function useRefreshOnFocus(refresh, intervalMs = 60_000) {
  const ref = useRef(refresh)
  ref.current = refresh

  useEffect(() => {
    const run = () => { if (document.visibilityState === 'visible') ref.current() }
    document.addEventListener('visibilitychange', run)
    window.addEventListener('focus', run)
    const t = setInterval(run, intervalMs)
    return () => {
      document.removeEventListener('visibilitychange', run)
      window.removeEventListener('focus', run)
      clearInterval(t)
    }
  }, [intervalMs])
}
