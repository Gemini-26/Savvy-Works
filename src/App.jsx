import { useEffect, useState } from 'react'
import AppRoutes from './routes/AppRoutes'
import { getCurrentSession, onSessionChange } from './services/authService'

export default function App() {
  const [session, setSession] = useState(undefined)

  useEffect(() => {
    getCurrentSession().then(setSession)

    const subscription = onSessionChange(setSession)

    return () => subscription.unsubscribe()
  }, [])

  if (session === undefined) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    )
  }

  return <AppRoutes session={session} />
}
