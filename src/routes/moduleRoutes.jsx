import Soon from '../shared/components/Soon'
import CustomersPage from '../modules/customers/pages/CustomersPage'
import NewCustomerPage from '../modules/customers/pages/NewCustomerPage'
import CustomerDetailPage from '../modules/customers/pages/CustomerDetailPage'
import LeadsPage from '../modules/leads/pages/LeadsPage'
import NewLeadPage from '../modules/leads/pages/NewLeadPage'
import LeadDetailPage from '../modules/leads/pages/LeadDetailPage'
import JobsPage from '../modules/jobs/pages/JobsPage'
import NewJobPage from '../modules/jobs/pages/NewJobPage'
import JobDetailPage from '../modules/jobs/pages/JobDetailPage'
import UsersPage from '../modules/users/pages/UsersPage'
import NewUserPage from '../modules/users/pages/NewUserPage'
import UserDetailPage from '../modules/users/pages/UserDetailPage'
import UserLogsPage from '../modules/users/pages/UserLogsPage'
import UserActivityLogPage from '../modules/users/pages/UserActivityLogPage'
import TimePlannerPage from '../modules/planner/pages/TimePlannerPage'
import ItemsPage from '../modules/items/pages/ItemsPage'
import NewItemPage from '../modules/items/pages/NewItemPage'
import ItemDetailPage from '../modules/items/pages/ItemDetailPage'
import CategoriesPage from '../modules/items/pages/CategoriesPage'
import AssetsPage from '../modules/items/pages/AssetsPage'
import NewAssetPage from '../modules/items/pages/NewAssetPage'
import AssetCategoriesPage from '../modules/items/pages/AssetCategoriesPage'
import OverdueAssetsPage from '../modules/items/pages/OverdueAssetsPage'
import AssetListsPage from '../modules/items/pages/AssetListsPage'
import QuotesPage from '../modules/quotes/pages/QuotesPage'
import NewQuotePage from '../modules/quotes/pages/NewQuotePage'
import QuoteDetailPage from '../modules/quotes/pages/QuoteDetailPage'
import QuotesDashboardPage from '../modules/quotes/pages/QuotesDashboardPage'
import JobsDashboardPage from '../modules/jobs/pages/JobsDashboardPage'
import ArchivesPage from '../modules/jobs/pages/ArchivesPage'
import FinanceDashboardPage from '../modules/finance/pages/FinanceDashboardPage'
import NewInvoicePage from '../modules/finance/pages/NewInvoicePage'
import InvoiceDetailPage from '../modules/finance/pages/InvoiceDetailPage'
import InvoicesPage from '../modules/finance/pages/InvoicesPage'
import PurchaseOrdersPage from '../modules/finance/pages/PurchaseOrdersPage'
import NewPurchaseOrderPage from '../modules/finance/pages/NewPurchaseOrderPage'
import PurchaseOrderDetailPage from '../modules/finance/pages/PurchaseOrderDetailPage'
import UserTimesheetsReportPage from '../modules/reports/pages/UserTimesheetsReportPage'

export const moduleRoutes = [

  // ── Contacts ──────────────────────────────────────────────────────────────
  // /contacts/customers is the canonical customers list route.
  // The dashboard stat card and the nav both link here.
  // No leading slash — these are nested children of the "/" layout route.
  { path: 'contacts/customers',           element: <CustomersPage statusFilter="active" />,   title: 'Active Customers' },
  { path: 'contacts/customers/active',   element: <CustomersPage statusFilter="active" />,   title: 'Active Customers' },
  { path: 'contacts/customers/inactive', element: <CustomersPage statusFilter="inactive" />, title: 'Inactive Customers' },
  { path: 'contacts/customers/new',      element: <NewCustomerPage />,    title: 'New Customer' },
  { path: 'contacts/customers/:id',      element: <CustomerDetailPage />, title: 'Customer' },
  { path: 'contacts/customers/logins',   title: 'Customer Logins' },

  { path: 'contacts/suppliers/new',      title: 'New Supplier' },
  { path: 'contacts/suppliers/active',   title: 'Active Suppliers' },
  { path: 'contacts/suppliers/inactive', title: 'Inactive Suppliers' },

  // ── Utility pages ─────────────────────────────────────────────────────────
  { path: 'diary',    title: 'My Diary' },
  { path: 'crm',      title: 'CRM' },
  { path: 'partners', title: 'Partners' },

  // ── Leads ─────────────────────────────────────────────────────────────────
  { path: 'leads/new',        element: <NewLeadPage />,                                    title: 'New Lead' },
  { path: 'leads/all',        element: <LeadsPage />,                                       title: 'All Leads' },
  { path: 'leads/:id',        element: <LeadDetailPage />,                                  title: 'Lead' },
  { path: 'leads/my',         title: 'My Leads' },
  { path: 'leads/unassigned', title: 'Unassigned Leads' },
  { path: 'leads/actioned',   element: <LeadsPage statusFilter="actioned" />,               title: 'Actioned Leads' },
  { path: 'leads/rejected',   element: <LeadsPage statusFilter="rejected" />,               title: 'Rejected Leads' },
  { path: 'leads/converted',  element: <LeadsPage statusFilter="converted" />,              title: 'Converted Leads' },
  { path: 'leads/search',     title: 'Search Leads' },
  { path: 'leads/tasks',      title: 'Lead Tasks' },
  { path: 'leads/authorisation', title: 'Lead Authorisation' },

  // ── Quotes ────────────────────────────────────────────────────────────────
  { path: 'quotes/dashboard', element: <QuotesDashboardPage />,                              title: 'Quotes Dashboard' },
  { path: 'quotes/new',       element: <NewQuotePage />,                                    title: 'New Quote' },
  { path: 'quotes/draft',     element: <QuotesPage statusFilter="draft" />,                 title: 'Draft Quotes' },
  { path: 'quotes/actioned',  element: <QuotesPage statusFilter="actioned" />,               title: 'Actioned Quotes' },
  { path: 'quotes/accepted',  element: <QuotesPage statusFilter="accepted" />,               title: 'Accepted Quotes' },
  { path: 'quotes/converted', element: <QuotesPage statusFilter="converted" />,              title: 'Converted Quotes' },
  { path: 'quotes/search',    element: <QuotesPage />,                                       title: 'Search Quotes' },
  { path: 'quotes/:id',       element: <QuoteDetailPage />,                                  title: 'Quote' },
  { path: 'quotes/callback',          title: 'Call Back Quotes' },
  { path: 'quotes/reminders',         title: 'Quote Reminders' },
  { path: 'quotes/appointments',      title: 'Quote Appointments' },
  { path: 'quotes/recurring/new',     title: 'New Recurring Quote' },
  { path: 'quotes/recurring',         title: 'Recurring Quotes' },

  // ── Jobs ──────────────────────────────────────────────────────────────────
  { path: 'jobs/dashboard',       element: <JobsDashboardPage />,                            title: 'Jobs Dashboard' },
  { path: 'jobs/new',             element: <NewJobPage />,                                   title: 'New Job' },
  { path: 'jobs/active',          element: <JobsPage statusFilter="active" />,               title: 'Active Jobs' },
  { path: 'jobs/unassigned',      element: <JobsPage statusFilter="unassigned" />,           title: 'Unassigned Jobs' },
  { path: 'jobs/on-hold',         element: <JobsPage statusFilter="on_hold" />,              title: 'On Hold' },
  { path: 'jobs/completed',       element: <JobsPage statusFilter="completed" />,            title: 'Completed Jobs' },
  { path: 'jobs/search',          element: <JobsPage />,                                     title: 'Search Jobs' },
  { path: 'jobs/:id',             element: <JobDetailPage />,                                title: 'Job' },
  { path: 'jobs/action-required', element: <JobsPage statusFilter="action_required" />,     title: 'Action Required' },
  { path: 'jobs/overdue',         element: <JobsPage statusFilter="overdue" />,              title: 'Overdue Jobs' },
  { path: 'jobs/authorisation',        title: 'Job Authorisation' },
  { path: 'jobs/appointments/user',    title: 'User Appointments' },
  { path: 'jobs/appointments/team',    title: 'Team Appointments' },
  { path: 'jobs/recurring/new',        title: 'New Recurring Job' },
  { path: 'jobs/recurring',            title: 'Recurring Jobs' },
  { path: 'jobs/archives',             element: <ArchivesPage />, title: 'Archives' },

  // ── Projects ──────────────────────────────────────────────────────────────
  { path: 'projects/new',       title: 'New Project' },
  { path: 'projects/active',    title: 'Active Projects' },
  { path: 'projects/inactive',  title: 'Inactive Projects' },
  { path: 'projects/completed', title: 'Completed Projects' },

  // ── Finance ───────────────────────────────────────────────────────────────
  { path: 'finance/invoices/dashboard', element: <FinanceDashboardPage />,                   title: 'Invoices Dashboard' },
  { path: 'finance/invoices/new',       element: <NewInvoicePage />,                         title: 'New Invoice' },
  { path: 'finance/invoices/draft',     element: <InvoicesPage statusFilter="draft" />,       title: 'Draft Invoices' },
  { path: 'finance/invoices/outstanding', element: <InvoicesPage statusFilter="outstanding" />, title: 'Outstanding Invoices' },
  { path: 'finance/invoices/overdue',   element: <InvoicesPage statusFilter="overdue" />,     title: 'Overdue Invoices' },
  { path: 'finance/invoices/paid',      element: <InvoicesPage statusFilter="paid" />,        title: 'Paid Invoices' },
  { path: 'finance/invoices/search',    element: <InvoicesPage />,                            title: 'Search Invoices' },
  { path: 'finance/invoices/:id',       element: <InvoiceDetailPage />,                       title: 'Invoice' },
  { path: 'finance/invoices/statements',     title: 'Account Statements' },
  { path: 'finance/invoices/reminders',      title: 'Invoice Reminders' },
  { path: 'finance/invoices/recurring/new',  title: 'New Recurring Invoice' },
  { path: 'finance/invoices/recurring',      title: 'Recurring Invoices' },

  { path: 'finance/po/new',       element: <NewPurchaseOrderPage />,                              title: 'New Purchase Order' },
  { path: 'finance/po/draft',     element: <PurchaseOrdersPage statusFilter="draft" />,             title: 'Draft POs' },
  { path: 'finance/po/awaiting',  element: <PurchaseOrdersPage statusFilter="awaiting_approval" />, title: 'Awaiting Approval' },
  { path: 'finance/po/approved',  element: <PurchaseOrdersPage statusFilter="approved" />,          title: 'Approved POs' },
  { path: 'finance/po/rejected',  element: <PurchaseOrdersPage statusFilter="rejected" />,          title: 'Rejected POs' },
  { path: 'finance/po/actioned',  element: <PurchaseOrdersPage statusFilter="actioned" />,          title: 'Actioned POs' },
  { path: 'finance/po/paid',      element: <PurchaseOrdersPage statusFilter="paid" />,              title: 'Paid POs' },
  { path: 'finance/po/search',    element: <PurchaseOrdersPage />,                                  title: 'Search POs' },
  { path: 'finance/po/:id',       element: <PurchaseOrderDetailPage />,                             title: 'Purchase Order' },
  { path: 'finance/po/dashboard',         title: 'PO Dashboard' },
  { path: 'finance/po/invoices-received', title: 'PO Invoices Received' },
  { path: 'finance/po/statements',        title: 'PO Statements' },
  { path: 'finance/po/recurring/new',     title: 'New Recurring PO' },
  { path: 'finance/po/recurring',         title: 'Recurring POs' },

  // ── Expenses ──────────────────────────────────────────────────────────────
  { path: 'expenses', title: 'Expenses' },

  // ── Users ─────────────────────────────────────────────────────────────────
  { path: 'users/new',           element: <NewUserPage />,                         title: 'New User' },
  { path: 'users/active',        element: <UsersPage activeOnly={true} />,         title: 'Active Users' },
  { path: 'users/inactive',      element: <UsersPage activeOnly={false} />,        title: 'Inactive Users' },
  { path: 'users/logs',          element: <UserLogsPage />,                        title: 'User Logs' },
  { path: 'users/logs/:id',      element: <UserActivityLogPage />,                 title: 'User Activity Log' },
  { path: 'users/:id',           element: <UserDetailPage />,                      title: 'User' },
  { path: 'users/team/active',   title: 'Active Team Members' },
  { path: 'users/team/inactive', title: 'Inactive Team Members' },
  { path: 'users/timeoff/awaiting',    title: 'Time Off Awaiting Approval' },
  { path: 'users/timeoff/approved',    title: 'Time Off Approved' },
  { path: 'users/timeoff/declined',    title: 'Time Off Declined' },
  { path: 'users/timeoff/all',         title: 'All Time Off' },
  { path: 'users/timeoff/lone-worker', title: 'Lone Worker Active' },

  // ── Planner ───────────────────────────────────────────────────────────────
  { path: 'planner/time',        element: <TimePlannerPage />,                     title: 'Time Planner' },
  { path: 'planner/project',     title: 'Project Planner' },
  { path: 'planner/geo',         title: 'Geo Planner' },
  { path: 'planner/vehicles',    title: 'Vehicle Tracking' },
  { path: 'planner/mobile',      title: 'Mobile Tracking' },

  // ── Items ─────────────────────────────────────────────────────────────────
  { path: 'items/products',     element: <ItemsPage activeOnly={true} />,  title: 'Products' },
  { path: 'items/products/new', element: <NewItemPage />,                  title: 'New Item' },
  { path: 'items/products/:id', element: <ItemDetailPage />,               title: 'Item' },
  { path: 'items/categories',   element: <CategoriesPage />,               title: 'Product Categories' },
  { path: 'items/groups',       title: 'Product Groups' },
  { path: 'items/catalogues',   title: 'Catalogues' },
  { path: 'items/assets/new',             element: <NewAssetPage />,                        title: 'New Asset' },
  { path: 'items/assets/active',          element: <AssetsPage activeOnly={true} />,        title: 'Active Assets' },
  { path: 'items/assets/action-required', element: <OverdueAssetsPage />,                    title: 'Assets — Action Required' },
  { path: 'items/assets/inactive',        element: <AssetsPage activeOnly={false} />,       title: 'Inactive Assets' },
  { path: 'items/assets/groups',          element: <AssetListsPage />,                        title: 'Asset Groups' },
  { path: 'items/assets/categories',      element: <AssetCategoriesPage />,                 title: 'Asset Categories' },
  { path: 'items/assets/types',           title: 'Asset Types' },
  { path: 'items/assets/tags',            title: 'Asset Tags' },
  { path: 'items/assets/manufacturers',   title: 'Asset Manufacturers' },
  { path: 'items/assets/models',          title: 'Asset Models' },

  // ── Reports ───────────────────────────────────────────────────────────────
  { path: 'reports/customers/profit',      title: 'Customer Profit Report' },
  { path: 'reports/customers/invoice',     title: 'Customer Invoice Report' },
  { path: 'reports/customers/complaints',  title: 'Customer Complaints Report' },
  { path: 'reports/customers/job',         title: 'Customer Job Report' },
  { path: 'reports/customers/sites',       title: 'Customer Sites Report' },
  { path: 'reports/jobs/summary',          title: 'Job Summary Report' },
  { path: 'reports/jobs/report',           title: 'Job Report' },
  { path: 'reports/jobs/recurring',        title: 'Recurring Jobs Report' },
  { path: 'reports/jobs/costing',          title: 'Job Costing Report' },
  { path: 'reports/jobs/completion',       title: 'Job Completion Report' },
  { path: 'reports/jobs/stats',            title: 'Job Stats Report' },
  { path: 'reports/jobs/variation',        title: 'Job Variation Report' },
  { path: 'reports/jobs/user',             title: 'Job User Report' },
  { path: 'reports/invoices/summary',      title: 'Invoice Summary Report' },
  { path: 'reports/invoices/report',       title: 'Invoice Report' },
  { path: 'reports/invoices/payments',     title: 'Invoice Payments Report' },
  { path: 'reports/po',                    title: 'Purchase Orders Report' },
  { path: 'reports/users/diary',           title: 'User Diary Report' },
  { path: 'reports/users/jobs',            title: 'User Jobs Report' },
  { path: 'reports/users/profit',          title: 'User Profit Report' },
  { path: 'reports/users/timesheets',      element: <UserTimesheetsReportPage />, title: 'User Timesheets Report' },
  { path: 'reports/assets/jobs',           title: 'Asset Job Report' },
  { path: 'reports/assets/productivity',   title: 'Asset Productivity Report' },

  // ── File Manager ──────────────────────────────────────────────────────────
  { path: 'files/attachments',    title: 'Attachments' },
  { path: 'files/documents',      title: 'Digital Documents' },
  { path: 'files/questionnaires', title: 'Completed Questionnaires' },

  // ── Settings ──────────────────────────────────────────────────────────────
  { path: 'settings/general',   title: 'General Settings' },
  { path: 'settings/jobs',      title: 'Job Settings' },
  { path: 'settings/quotes',    title: 'Quote Settings' },
  { path: 'settings/invoices',  title: 'Invoice Settings' },
  { path: 'settings/customers', title: 'Customer Settings' },
  { path: 'settings/documents',     title: 'Digital Document Settings' },
  { path: 'settings/questionnaires',title: 'Questionnaire Settings' },
  { path: 'settings/templates',     title: 'Template Editor' },
  { path: 'settings/custom-fields', title: 'Custom Fields' },
  { path: 'settings/triggers',      title: 'Triggers' },
  { path: 'settings/leads',         title: 'Lead Settings' },
  { path: 'settings/users',         title: 'User Settings' },
  { path: 'settings/crm',           title: 'CRM Settings' },
]

export const generateModuleRoutes = () => {
  return moduleRoutes.map((route) => ({
    ...route,
    element: route.element ??<Soon title={route.title} />,
  }))
}

