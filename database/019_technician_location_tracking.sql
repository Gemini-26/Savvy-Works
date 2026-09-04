-- ============================================================
-- 019 — Technician GPS location tracking for the Live Users page
--
-- Adds a "last known position" to each work shift, written from the
-- technician's browser (Geolocation API) while they're clocked in.
-- No separate ping-history table — we only need the latest fix per
-- shift, so a plain UPDATE on the open work_shifts row is enough and
-- keeps this consistent with how clock_in/clock_out already work.
--
-- RLS: work_shifts already has a permissive company-isolation policy
-- (see 011_activity_notifications_confirmation.sql) covering UPDATE,
-- so no new policy is needed for these columns.
--
-- HOW TO RUN: paste into Supabase Dashboard → SQL Editor → Run.
-- ============================================================

alter table work_shifts
  add column if not exists last_lat         double precision,
  add column if not exists last_lng         double precision,
  add column if not exists last_location_at timestamptz;
