import { Outlet, NavLink } from 'react-router-dom'
import { Briefcase, CalendarDays, User, LogOut, Wrench } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import NotificationBell from '../../../shared/components/NotificationBell'
import ClockBubble from '../../../shared/components/ClockBubble'

const tabs = [
  { to: '/', label: 'My Jobs', icon: Briefcase, end: true },
  { to: '/schedule', label: 'Schedule', icon: CalendarDays },
  { to: '/tools', label: 'My Tools', icon: Wrench },
  { to: '/profile', label: 'Profile', icon: User },
]

export default function TechnicianLayout({ profile }) {
  async function handleLogout() {
    await supabase.auth.signOut()
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-sm font-bold text-gray-900">{profile?.companies?.name || 'SavvyWorks'}</p>
          <p className="text-xs text-gray-500">{profile?.full_name}</p>
        </div>
        <div className="flex items-center gap-1">
          <NotificationBell />
          <button
            onClick={handleLogout}
            className="p-2 rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="Log out"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <main className="flex-1 pb-20 overflow-y-auto">
        <Outlet />
      </main>

      <nav className="fixed bottom-0 inset-x-0 z-10 bg-white border-t border-gray-200 flex">
        {tabs.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 text-xs font-medium transition-colors ${
                isActive ? 'text-blue-600' : 'text-gray-400'
              }`
            }
          >
            <Icon size={20} />
            {label}
          </NavLink>
        ))}
      </nav>

      <ClockBubble />
    </div>
  )
}
