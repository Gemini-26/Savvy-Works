import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import Layout from '../components/Layout'
import Login from '../pages/Login'
import Dashboard from '../pages/Dashboard'
import Soon from '../shared/components/Soon'
import { generateModuleRoutes } from './moduleRoutes'
import { useCurrentUser } from '../hooks/useCurrentUser'
import { useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { checkAccess, endDeactivatedSession } from '../services/authService'
import TechnicianLayout from '../modules/technician/components/TechnicianLayout'
import MyJobsPage from '../modules/technician/pages/MyJobsPage'
import JobDetailPage from '../modules/technician/pages/JobDetailPage'
import MySchedulePage from '../modules/technician/pages/MySchedulePage'
import ProfilePage from '../modules/technician/pages/ProfilePage'
import MyToolsPage from '../modules/technician/pages/MyToolsPage'
import MyProfilePage from '../modules/users/pages/MyProfilePage'
import ProfileDocumentsPage from '../modules/users/pages/ProfileDocumentsPage'
import MyPoliciesPage from '../modules/policies/pages/MyPoliciesPage'
import PolicyReadPage from '../modules/policies/pages/PolicyReadPage'
import NoProfileScreen from '../components/NoProfileScreen'

export default function AppRoutes({ session }) {
  const routes = generateModuleRoutes()
  const { profile, loading, failed } = useCurrentUser()

  // Someone deactivated while already signed in: the server ends their session
  // (and bans the login), but this tab won't notice until it next talks to the
  // server. Ask again whenever the tab comes back into view and every 5 minutes.
  useEffect(() => {
    if (!session) return undefined
    let stopped = false
    async function recheck() {
      if (document.visibilityState === 'hidden') return
      const result = await checkAccess().catch(() => 'unknown')
      if (stopped) return
      if (result === 'inactive') endDeactivatedSession()
      else if (result === 'revoked') supabase.auth.signOut()
    }
    const timer = setInterval(recheck, 5 * 60 * 1000)
    document.addEventListener('visibilitychange', recheck)
    return () => {
      stopped = true
      clearInterval(timer)
      document.removeEventListener('visibilitychange', recheck)
    }
  }, [session])

  // Deactivated: don't render the app at all, just end the session. The login
  // page then shows why (see DEACTIVATED_FLAG).
  useEffect(() => {
    if (session && profile && profile.is_active === false) endDeactivatedSession()
  }, [session, profile])

  if (session && profile?.is_active === false) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <p className="text-sm text-gray-500">Signing you out…</p>
      </div>
    )
  }

  if (session && loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    )
  }

  // Signed in, but the login has no staff profile: every company table would
  // come back empty, so say why instead of rendering the app with no data.
  if (session && !profile) {
    return <NoProfileScreen email={session.user?.email} failed={failed} />
  }

  const isTechnician = session && profile?.role === 'technician'

  return (
    <Router>
      <Routes>
        <Route
          path="/login"
          element={session ? <Navigate to="/" replace /> : <Login />}
        />

        {isTechnician ? (
          <Route path="/" element={<TechnicianLayout profile={profile} />}>
            <Route index element={<MyJobsPage profile={profile} />} />
            <Route path="jobs/:id" element={<JobDetailPage profile={profile} />} />
            <Route path="schedule" element={<MySchedulePage profile={profile} />} />
            <Route path="tools" element={<MyToolsPage profile={profile} />} />
            <Route path="profile" element={<ProfilePage profile={profile} />} />
            <Route path="profile/documents" element={<ProfileDocumentsPage profile={profile} />} />
            <Route path="profile/policies" element={<MyPoliciesPage profile={profile} />} />
            <Route path="profile/policies/:id" element={<PolicyReadPage profile={profile} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        ) : (
          <Route
            path="/"
            element={session ? <Layout /> : <Navigate to="/login" replace />}
          >
            <Route index element={<Dashboard />} />
            <Route path="profile" element={<MyProfilePage profile={profile} />} />
            <Route path="profile/documents" element={<ProfileDocumentsPage profile={profile} />} />
            <Route path="profile/policies" element={<MyPoliciesPage profile={profile} />} />
            <Route path="profile/policies/:id" element={<PolicyReadPage profile={profile} />} />

            {/* Lets non-technician staff (admins) accept/attend/complete their
                own appointment assignments through the exact same flow a
                technician uses, instead of a separate admin-only shortcut. */}
            <Route path="my-jobs" element={<MyJobsPage profile={profile} basePath="/my-jobs" />} />
            <Route path="my-jobs/:id" element={<JobDetailPage profile={profile} />} />

            {routes.map((route) => (
              <Route
                key={route.path}
                path={route.path}
                element={route.element}
              />
            ))}

            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        )}
      </Routes>
    </Router>
  )
}
