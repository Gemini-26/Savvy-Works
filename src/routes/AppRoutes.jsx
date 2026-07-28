import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import Layout from '../components/Layout'
import Login from '../pages/Login'
import Dashboard from '../pages/Dashboard'
import Soon from '../shared/components/Soon'
import { generateModuleRoutes } from './moduleRoutes'
import { useCurrentUser } from '../hooks/useCurrentUser'
import TechnicianLayout from '../modules/technician/components/TechnicianLayout'
import MyJobsPage from '../modules/technician/pages/MyJobsPage'
import JobDetailPage from '../modules/technician/pages/JobDetailPage'
import MySchedulePage from '../modules/technician/pages/MySchedulePage'
import ProfilePage from '../modules/technician/pages/ProfilePage'
import MyToolsPage from '../modules/technician/pages/MyToolsPage'
import MyProfilePage from '../modules/users/pages/MyProfilePage'

export default function AppRoutes({ session }) {
  const routes = generateModuleRoutes()
  const { profile, loading } = useCurrentUser()

  if (session && loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    )
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
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        ) : (
          <Route
            path="/"
            element={session ? <Layout /> : <Navigate to="/login" replace />}
          >
            <Route index element={<Dashboard />} />
            <Route path="profile" element={<MyProfilePage profile={profile} />} />

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
