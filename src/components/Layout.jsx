import { useState, useEffect } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import {
  Target, FileText, Briefcase, Calendar, FolderKanban,
  DollarSign, Users, Package, Receipt, UserCircle2,
  BarChart2, FolderOpen, Settings, ChevronDown,
  LogOut, Menu, X, BookOpen, MessageSquare, Bell,
  Handshake, User, LayoutDashboard
} from 'lucide-react'
import NotificationBell from '../shared/components/NotificationBell'
import ClockBubble from '../shared/components/ClockBubble'

// ─────────────────────────────────────────────────────────────────────────────
// Full navigation structure — mirrors menu.txt
// ─────────────────────────────────────────────────────────────────────────────
const NAV = [
  {
    label: 'Leads', icon: Target, color: 'text-green-600',
    children: [
      { label: 'New Lead',         path: '/leads/new' },
      { label: 'All Leads',        path: '/leads/all' },
      { label: 'My Leads',         path: '/leads/my' },
      { label: 'Unassigned Leads', path: '/leads/unassigned' },
      { label: 'Actioned Leads',   path: '/leads/actioned' },
      { label: 'Rejected Leads',   path: '/leads/rejected' },
      { label: 'Authorisation',    path: '/leads/authorisation' },
      { label: 'Converted Leads',  path: '/leads/converted' },
      { label: 'Search Leads',     path: '/leads/search' },
      { label: 'Lead Tasks',       path: '/leads/tasks' },
    ],
  },
  {
    label: 'Quotes', icon: FileText, color: 'text-teal-600',
    children: [
      { label: 'Dashboard',        path: '/quotes/dashboard' },
      { label: 'New Quote',        path: '/quotes/new' },
      { label: 'Draft Quotes',     path: '/quotes/draft' },
      { label: 'Actioned Quotes',  path: '/quotes/actioned' },
      { label: 'Call Back Quotes', path: '/quotes/callback' },
      { label: 'Accepted Quotes',  path: '/quotes/accepted' },
      { label: 'Converted Quotes', path: '/quotes/converted' },
      { label: 'Reminders',        path: '/quotes/reminders' },
      { label: 'Search Quotes',    path: '/quotes/search' },
      { label: 'Appointments',     path: '/quotes/appointments' },
      { label: 'New Recurring',    path: '/quotes/recurring/new' },
      { label: 'Recurring Quotes', path: '/quotes/recurring' },
    ],
  },
  {
    label: 'Jobs', icon: Briefcase, color: 'text-blue-600',
    children: [
      { label: 'Dashboard',          path: '/jobs/dashboard' },
      { label: 'New Job',            path: '/jobs/new' },
      { label: 'Active Jobs',        path: '/jobs/active' },
      { label: 'Completed Jobs',     path: '/jobs/completed' },
      { label: 'Unassigned Jobs',    path: '/jobs/unassigned' },
      { label: 'Action Required',    path: '/jobs/action-required' },
      { label: 'Overdue Jobs',       path: '/jobs/overdue' },
      { label: 'Authorisation Jobs', path: '/jobs/authorisation' },
      { label: 'On Hold',            path: '/jobs/on-hold' },
      { label: 'Search Jobs',        path: '/jobs/search' },
      { label: 'User Appointments',  path: '/jobs/appointments/user' },
      { label: 'Team Appointments',  path: '/jobs/appointments/team' },
      { label: 'New Recurring Job',  path: '/jobs/recurring/new' },
      { label: 'Recurring Jobs',     path: '/jobs/recurring' },
      { label: 'Archives',           path: '/jobs/archives' },
    ],
  },
  {
    label: 'Planner', icon: Calendar, color: 'text-indigo-600',
    children: [
      { label: 'Time Planner',     path: '/planner/time' },
      { label: 'Project Planner',  path: '/planner/project' },
      { label: 'Geo Planner',      path: '/planner/geo' },
      { label: 'Vehicle Tracking', path: '/planner/vehicles' },
      { label: 'Mobile Tracking',  path: '/planner/mobile' },
    ],
  },
  {
    label: 'Projects', icon: FolderKanban, color: 'text-purple-600',
    children: [
      { label: 'New Project',        path: '/projects/new' },
      { label: 'Active Projects',    path: '/projects/active' },
      { label: 'Inactive Projects',  path: '/projects/inactive' },
      { label: 'Completed Projects', path: '/projects/completed' },
    ],
  },
  {
    label: 'Finance', icon: DollarSign, color: 'text-violet-600',
    sections: [
      {
        heading: 'Invoices',
        items: [
          { label: 'Dashboard',          path: '/finance/invoices/dashboard' },
          { label: 'New Invoice',        path: '/finance/invoices/new' },
          { label: 'Draft Invoices',     path: '/finance/invoices/draft' },
          { label: 'Outstanding',        path: '/finance/invoices/outstanding' },
          { label: 'Overdue',            path: '/finance/invoices/overdue' },
          { label: 'Paid Invoices',      path: '/finance/invoices/paid' },
          { label: 'Search Invoices',    path: '/finance/invoices/search' },
          { label: 'Payments',           path: '/finance/payments' },
          { label: 'Account Statements', path: '/finance/invoices/statements' },
          { label: 'Reminders',          path: '/finance/invoices/reminders' },
          { label: 'New Recurring',      path: '/finance/invoices/recurring/new' },
          { label: 'Recurring Invoices', path: '/finance/invoices/recurring' },
        ],
      },
      {
        heading: 'Purchase Orders',
        items: [
          { label: 'Dashboard',          path: '/finance/po/dashboard' },
          { label: 'New Purchase Order', path: '/finance/po/new' },
          { label: 'Draft POs',          path: '/finance/po/draft' },
          { label: 'Awaiting Approval',  path: '/finance/po/awaiting' },
          { label: 'Approved POs',       path: '/finance/po/approved' },
          { label: 'Rejected POs',       path: '/finance/po/rejected' },
          { label: 'Actioned POs',       path: '/finance/po/actioned' },
          { label: 'Paid POs',           path: '/finance/po/paid' },
          { label: 'Search POs',         path: '/finance/po/search' },
          { label: 'Invoices Received',  path: '/finance/po/invoices-received' },
          { label: 'PO Statements',      path: '/finance/po/statements' },
          { label: 'New Recurring PO',   path: '/finance/po/recurring/new' },
          { label: 'Recurring POs',      path: '/finance/po/recurring' },
        ],
      },
    ],
  },
  {
    label: 'Contacts', icon: Users, color: 'text-orange-600',
    sections: [
      {
        heading: 'Customers',
        items: [
          { label: 'New Customer',       path: '/contacts/customers/new' },
          { label: 'Active Customers',   path: '/contacts/customers/active' },
          { label: 'Inactive Customers', path: '/contacts/customers/inactive' },
          { label: 'Customer Logins',    path: '/contacts/customers/logins' },
        ],
      },
      {
        heading: 'Suppliers',
        items: [
          { label: 'New Supplier',       path: '/contacts/suppliers/new' },
          { label: 'Active Suppliers',   path: '/contacts/suppliers/active' },
          { label: 'Inactive Suppliers', path: '/contacts/suppliers/inactive' },
        ],
      },
    ],
  },
  {
    label: 'Items', icon: Package, color: 'text-amber-600',
    children: [
      { label: 'Product Categories',  path: '/items/categories' },
      { label: 'Products',            path: '/items/products' },
      { label: 'Product Groups',      path: '/items/groups' },
      { label: 'Catalogues',          path: '/items/catalogues' },
      { label: 'New Asset',           path: '/items/assets/new' },
      { label: 'Active Assets',       path: '/items/assets/active' },
      { label: 'Action Required',     path: '/items/assets/action-required' },
      { label: 'Inactive Assets',     path: '/items/assets/inactive' },
      { label: 'Asset Groups',        path: '/items/assets/groups' },
      { label: 'Asset Categories',    path: '/items/assets/categories' },
      { label: 'Asset Types',         path: '/items/assets/types' },
      { label: 'Asset Tags',          path: '/items/assets/tags' },
      { label: 'Asset Manufacturers', path: '/items/assets/manufacturers' },
      { label: 'Asset Models',        path: '/items/assets/models' },
    ],
  },
  {
    label: 'Expenses', icon: Receipt, color: 'text-red-600',
    children: [
      { label: 'Expenses', path: '/expenses' },
    ],
  },
  {
    label: 'Users', icon: UserCircle2, color: 'text-cyan-600',
    sections: [
      {
        heading: 'Users',
        items: [
          { label: 'New User',       path: '/users/new' },
          { label: 'Live Users',     path: '/users/live' },
          { label: 'Active Users',   path: '/users/active' },
          { label: 'Inactive Users', path: '/users/inactive' },
          { label: 'User Logs',      path: '/users/logs' },
        ],
      },
      {
        heading: 'Team Members',
        items: [
          { label: 'Active Team Members',   path: '/users/team/active' },
          { label: 'Inactive Team Members', path: '/users/team/inactive' },
        ],
      },
      {
        heading: 'Time Off',
        items: [
          { label: 'Awaiting Approval',  path: '/users/timeoff/awaiting' },
          { label: 'Approved',           path: '/users/timeoff/approved' },
          { label: 'Declined',           path: '/users/timeoff/declined' },
          { label: 'All Time Off',       path: '/users/timeoff/all' },
          { label: 'Lone Worker Active', path: '/users/timeoff/lone-worker' },
        ],
      },
    ],
  },
  {
    label: 'Reports', icon: BarChart2, color: 'text-slate-600',
    sections: [
      {
        heading: 'Customers',
        items: [
          { label: 'Customer Profit',     path: '/reports/customers/profit' },
          { label: 'Customer Invoice',    path: '/reports/customers/invoice' },
          { label: 'Customer Complaints', path: '/reports/customers/complaints' },
          { label: 'Customer Job',        path: '/reports/customers/job' },
          { label: 'Customer Sites',      path: '/reports/customers/sites' },
        ],
      },
      {
        heading: 'Jobs',
        items: [
          { label: 'Job Summary',    path: '/reports/jobs/summary' },
          { label: 'Job Report',     path: '/reports/jobs/report' },
          { label: 'Recurring Jobs', path: '/reports/jobs/recurring' },
          { label: 'Job Costing',    path: '/reports/jobs/costing' },
          { label: 'Job Completion', path: '/reports/jobs/completion' },
          { label: 'Job Stats',      path: '/reports/jobs/stats' },
          { label: 'Job Variation',  path: '/reports/jobs/variation' },
          { label: 'Job User',       path: '/reports/jobs/user' },
        ],
      },
      {
        heading: 'Finance',
        items: [
          { label: 'Invoice Summary',  path: '/reports/invoices/summary' },
          { label: 'Invoice Report',   path: '/reports/invoices/report' },
          { label: 'Invoice Payments', path: '/reports/invoices/payments' },
          { label: 'Purchase Orders',  path: '/reports/po' },
        ],
      },
      {
        heading: 'Users & Assets',
        items: [
          { label: 'User Diary',         path: '/reports/users/diary' },
          { label: 'User Jobs',          path: '/reports/users/jobs' },
          { label: 'User Profit',        path: '/reports/users/profit' },
          { label: 'User Timesheets',    path: '/reports/users/timesheets' },
          { label: 'Asset Job Report',   path: '/reports/assets/jobs' },
          { label: 'Asset Productivity', path: '/reports/assets/productivity' },
        ],
      },
    ],
  },
  {
    label: 'File Manager', icon: FolderOpen, color: 'text-gray-600',
    children: [
      { label: 'Attachments',              path: '/files/attachments' },
      { label: 'Digital Documents',        path: '/files/documents' },
      { label: 'Completed Questionnaires', path: '/files/questionnaires' },
    ],
  },
  {
    label: 'Settings', icon: Settings, color: 'text-gray-700',
    sections: [
      {
        heading: 'General',
        items: [
          { label: 'General Settings',  path: '/settings/general' },
          { label: 'Change Requests',   path: '/settings/change-requests' },
          { label: 'Digital Documents', path: '/settings/documents' },
          { label: 'Questionnaires',    path: '/settings/questionnaires' },
          { label: 'Template Editor',   path: '/settings/templates' },
          { label: 'Custom Fields',     path: '/settings/custom-fields' },
          { label: 'Triggers',          path: '/settings/triggers' },
        ],
      },
      {
        heading: 'Module Settings',
        items: [
          { label: 'Lead Settings',     path: '/settings/leads' },
          { label: 'Quote Settings',    path: '/settings/quotes' },
          { label: 'Job Settings',      path: '/settings/jobs' },
          { label: 'Invoice Settings',  path: '/settings/invoices' },
          { label: 'Customer Settings', path: '/settings/customers' },
          { label: 'User Settings',     path: '/settings/users' },
          { label: 'CRM Settings',      path: '/settings/crm' },
        ],
      },
    ],
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function allPaths(item) {
  if (item.children) return item.children.map(c => c.path)
  if (item.sections) return item.sections.flatMap(s => s.items.map(i => i.path))
  return []
}

// ─────────────────────────────────────────────────────────────────────────────
// Dropdown panel — fixed-position so it's never clipped by parent overflow
// ─────────────────────────────────────────────────────────────────────────────
function Dropdown({ item, pos, onClose }) {
  const isSectioned = !!item.sections
  const colCount    = isSectioned ? Math.min(item.sections.length, 2) : 1
  const width       = colCount === 1 ? 208 : 448
  const left        = Math.min(pos.left, window.innerWidth - width - 12)

  return (
    <div
      onPointerDown={e => e.stopPropagation()}
      style={{ position: 'fixed', top: pos.top, left, width, zIndex: 9999 }}
      className="bg-white border border-gray-200 rounded-xl shadow-xl py-2"
    >
      {isSectioned ? (
        <div className={`grid gap-x-1 px-2 ${colCount === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {item.sections.map(section => (
            <div key={section.heading} className="mb-1">
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-2 pt-2 pb-1">
                {section.heading}
              </div>
              {section.items.map(child => (
                <NavLink
                  key={child.path}
                  to={child.path}
                  onClick={onClose}
                  className={({ isActive }) =>
                    `block px-3 py-1.5 text-sm rounded-lg transition-colors
                     ${isActive ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'}`
                  }
                >
                  {child.label}
                </NavLink>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="px-1">
          {item.children.map(child => (
            <NavLink
              key={child.path}
              to={child.path}
              onClick={onClose}
              className={({ isActive }) =>
                `block px-3 py-2 text-sm rounded-lg transition-colors
                 ${isActive ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'}`
              }
            >
              {child.label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Layout
// ─────────────────────────────────────────────────────────────────────────────
export default function Layout() {
  const [openMenu,    setOpenMenu]    = useState(null)
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 })
  const [mobileOpen,  setMobileOpen]  = useState(false)
  const [userOpen,    setUserOpen]    = useState(false)
  const [userPos,     setUserPos]     = useState({ top: 0, left: 0 })

  const navigate = useNavigate()
  const location = useLocation()

  // Close everything on route change
  useEffect(() => {
    setOpenMenu(null)
    setMobileOpen(false)
    setUserOpen(false)
  }, [location.pathname])

  // Clicking anywhere outside closes all dropdowns
  useEffect(() => {
    function close() { setOpenMenu(null); setUserOpen(false) }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [])

  function openNavMenu(label, e) {
    e.stopPropagation()
    if (openMenu === label) { setOpenMenu(null); return }
    const rect = e.currentTarget.getBoundingClientRect()
    setDropdownPos({ top: rect.bottom + 4, left: rect.left })
    setOpenMenu(label)
    setUserOpen(false)
  }

  function openUserMenu(e) {
    e.stopPropagation()
    const rect = e.currentTarget.getBoundingClientRect()
    // right-align the 192px panel to the button's right edge
    setUserPos({ top: rect.bottom + 4, left: rect.right - 192 })
    setUserOpen(o => !o)
    setOpenMenu(null)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  const activeItem = openMenu ? NAV.find(n => n.label === openMenu) : null

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">

      {/* ══════════════════════════════════════════════════════════
          STICKY HEADER
      ══════════════════════════════════════════════════════════ */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">

        {/* Row 1 — brand + utility toolbar */}
        <div className="flex items-center h-14 px-4 gap-3">

          {/* Logo */}
          <NavLink to="/" className="flex items-center gap-2.5 flex-shrink-0 mr-3">
            <div style={{ width:40, height:40, background:'#CC2525', borderRadius:6, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <span style={{ color:'#fff', fontWeight:900, fontSize:20, fontFamily:'Arial,sans-serif', lineHeight:1 }}>S</span>
            </div>
            <div className="hidden md:block leading-tight">
              <div className="font-black text-sm text-gray-900 tracking-tight uppercase">Savvy Civils</div>
              <div className="text-[10px] text-gray-500 font-semibold tracking-widest uppercase">and Plumbing</div>
            </div>
          </NavLink>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen(o => !o)}
            className="lg:hidden p-1.5 rounded-md hover:bg-gray-100 text-gray-600 transition-colors"
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>

          {/* Right utility */}
          <div className="ml-auto flex items-center gap-1">
            <NavLink to="/diary" className={({ isActive }) =>
              `hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors
               ${isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100'}`}>
              <BookOpen size={14}/><span>My Diary</span>
            </NavLink>
            <NavLink to="/crm" className={({ isActive }) =>
              `hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors
               ${isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100'}`}>
              <Users size={14}/><span>CRM</span>
            </NavLink>
            <button className="p-2 rounded-md text-gray-500 hover:bg-gray-100 transition-colors"><MessageSquare size={16}/></button>
            <NotificationBell />
            <NavLink to="/partners" className={({ isActive }) =>
              `hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors
               ${isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100'}`}>
              <Handshake size={14}/><span>Partners</span>
            </NavLink>
            <div className="w-px h-6 bg-gray-200 mx-1"/>
            <button
              onPointerDown={e => e.stopPropagation()}
              onClick={openUserMenu}
              className="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-gray-600 hover:bg-gray-100 transition-colors"
            >
              <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-xs">A</div>
              <ChevronDown size={12} className={`transition-transform ${userOpen ? 'rotate-180' : ''}`}/>
            </button>
          </div>
        </div>

        {/* Row 2 — main nav (desktop only) */}
        <nav className="hidden lg:flex items-center px-4 border-t border-gray-100">
          <NavLink to="/" end className={({ isActive }) =>
            `flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold flex-shrink-0 border-b-2 transition-colors mr-1
             ${isActive ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'}`}>
            <LayoutDashboard size={13}/>Dashboard
          </NavLink>

          {NAV.map(item => {
            const Icon     = item.icon
            const isOpen   = openMenu === item.label
            const isActive = allPaths(item).some(p => location.pathname.startsWith(p))
            return (
              <button
                key={item.label}
                onPointerDown={e => e.stopPropagation()}
                onClick={e => openNavMenu(item.label, e)}
                className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold flex-shrink-0 border-b-2 transition-colors
                  ${isActive || isOpen
                    ? 'border-blue-600 text-blue-700'
                    : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'}`}
              >
                <Icon size={14} className={isActive || isOpen ? 'text-blue-600' : item.color}/>
                <span>{item.label}</span>
                <ChevronDown size={11} className={`transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`}/>
              </button>
            )
          })}
        </nav>

        {/* Mobile nav */}
        {mobileOpen && (
          <div className="lg:hidden border-t border-gray-100 bg-white px-4 py-4 max-h-[80vh] overflow-y-auto">
            <NavLink to="/" end className={({ isActive }) =>
              `flex items-center gap-2 px-3 py-2 rounded-lg text-sm mb-3 font-semibold
               ${isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'}`}>
              <LayoutDashboard size={15}/> Dashboard
            </NavLink>
            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
              {NAV.map(item => {
                const Icon = item.icon
                const all  = item.children ?? item.sections?.flatMap(s => s.items) ?? []
                return (
                  <div key={item.label}>
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 px-1">
                      <Icon size={11} className={item.color}/>{item.label}
                    </div>
                    {all.map(child => (
                      <NavLink key={child.path} to={child.path}
                        className={({ isActive }) =>
                          `block pl-3 pr-2 py-1.5 text-sm rounded-lg mb-0.5 transition-colors
                           ${isActive ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-50'}`
                        }>{child.label}</NavLink>
                    ))}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </header>

      {/* Page content */}
      <main className="flex-1 p-4 md:p-6 max-w-screen-2xl mx-auto w-full">
        <Outlet/>
      </main>

      {/* ══════════════════════════════════════════════════════════
          FIXED DROPDOWNS — outside header, z-9999, never clipped
      ══════════════════════════════════════════════════════════ */}
      {activeItem && (
        <Dropdown item={activeItem} pos={dropdownPos} onClose={() => setOpenMenu(null)}/>
      )}

      {userOpen && (
        <div
          onPointerDown={e => e.stopPropagation()}
          style={{ position:'fixed', top:userPos.top, left:userPos.left, width:192, zIndex:9999 }}
          className="bg-white border border-gray-200 rounded-xl shadow-xl py-1.5"
        >
          <NavLink to="/profile" onClick={() => setUserOpen(false)}
            className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-lg mx-1">
            <User size={14}/> My Profile
          </NavLink>
          <div className="my-1 border-t border-gray-100"/>
          <button onClick={handleLogout}
            className="flex items-center gap-2 w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg mx-1">
            <LogOut size={14}/> Log Out
          </button>
        </div>
      )}

      <ClockBubble />
    </div>
  )
}
