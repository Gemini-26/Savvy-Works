-- ============================================================
-- 022 — Appointment status extras: On Hold, Awaiting Auth
--
-- The Time Planner legend already showed these two statuses but
-- the appointments.status check constraint never allowed them,
-- so they could never actually be set. Widening the constraint
-- is additive/backwards compatible — every existing row's status
-- is still valid under the new list.
-- ============================================================

alter table appointments drop constraint if exists appointments_status_check;

alter table appointments add constraint appointments_status_check
  check (status in (
    'not_dispatched','awaiting','received','accepted',
    'declined','on_route','on_site','completed',
    'follow_on','abandoned','no_access','cancelled',
    'on_hold','awaiting_auth'
  ));
