// Appointment/dispatch status metadata — single source of truth for the
// Time Planner legend/colors and the technician status-update UI, so the
// two views can never drift out of sync on labels or colors.
export const APPOINTMENT_STATUS_META = {
  not_dispatched: { label: 'Not Dispatched', dot: '#44403c', bar: 'bg-stone-600'   },
  awaiting:       { label: 'Awaiting',        dot: '#06b6d4', bar: 'bg-cyan-500'   },
  received:       { label: 'Received',        dot: '#14b8a6', bar: 'bg-teal-500'  },
  accepted:       { label: 'Accepted',        dot: '#65a30d', bar: 'bg-lime-600'  },
  declined:       { label: 'Declined',        dot: '#ef4444', bar: 'bg-red-500'   },
  on_route:       { label: 'On Route',        dot: '#f97316', bar: 'bg-orange-500'},
  on_site:        { label: 'On Site',         dot: '#1e293b', bar: 'bg-slate-800' },
  completed:      { label: 'Completed',       dot: '#16a34a', bar: 'bg-green-600' },
  follow_on:      { label: 'Follow On',       dot: '#db2777', bar: 'bg-pink-600'  },
  abandoned:      { label: 'Abandoned',       dot: '#991b1b', bar: 'bg-red-800'   },
  no_access:      { label: 'No Access',       dot: '#b91c1c', bar: 'bg-red-700'   },
  cancelled:      { label: 'Cancelled',       dot: '#9ca3af', bar: 'bg-gray-400'  },
  on_hold:        { label: 'On Hold',         dot: '#dc2626', bar: 'bg-red-600'   },
  awaiting_auth:  { label: 'Awaiting Auth',   dot: '#22c55e', bar: 'bg-green-500' },
}

// Statuses a technician can set themselves once an appointment is accepted,
// covering everything that can happen on/around a visit. Accept/Decline are
// handled separately (respondToAppointment), and Completed goes through the
// sign-off flow (CompleteJobModal) — both excluded here.
export const TECH_UPDATABLE_STATUSES = [
  'on_route', 'on_site', 'no_access', 'on_hold',
  'awaiting_auth', 'follow_on', 'abandoned',
]

// Statuses that trigger a customer-facing notification when a technician sets them.
export const CUSTOMER_NOTIFIED_STATUSES = new Set(['on_route'])
