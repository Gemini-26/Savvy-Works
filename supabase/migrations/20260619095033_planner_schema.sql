-- ============================================================
-- 002 — Planner Schema
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor)
-- ============================================================

-- 1. PROFILES — standalone staff/technician directory
--    Not linked to auth.users yet; can be wired up later without
--    changing any downstream tables.
-- ------------------------------------------------------------
create table if not exists profiles (
  id         uuid primary key default gen_random_uuid(),
  full_name  text not null,
  role       text not null default 'technician'
             check (role in ('admin', 'technician', 'viewer')),
  phone      text,
  avatar_url text,
  color      text default '#3B82F6',
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);


-- 2. APPOINTMENTS — one scheduling record per tech visit
--    Decouples "the work order" (jobs) from "the actual visit".
--    A single job can have many appointments (return visits, follow-ups).
-- ------------------------------------------------------------
create table if not exists appointments (
  id               uuid primary key default gen_random_uuid(),
  job_id           uuid references jobs(id) on delete cascade,
  scheduled_start  timestamptz not null,
  scheduled_end    timestamptz not null,
  status           text not null default 'not_dispatched'
                   check (status in (
                     'not_dispatched','awaiting','received','accepted',
                     'declined','on_route','on_site','completed',
                     'follow_on','abandoned','no_access','cancelled'
                   )),
  notes            text,
  created_at       timestamptz not null default now(),
  constraint chk_appt_times check (scheduled_end > scheduled_start)
);


-- 3. APPOINTMENT_ASSIGNMENTS — many-to-many: appointment → technicians
--    Allows multiple techs per appointment (lead + apprentice, etc.)
--    Each technician row appears as a separate block on the planner grid.
-- ------------------------------------------------------------
create table if not exists appointment_assignments (
  id              uuid primary key default gen_random_uuid(),
  appointment_id  uuid not null references appointments(id) on delete cascade,
  technician_id   uuid not null references profiles(id)     on delete cascade,
  unique (appointment_id, technician_id)
);


-- 4. INDEXES — for planner day-query performance
-- ------------------------------------------------------------
create index if not exists idx_appointments_start
  on appointments (scheduled_start);

create index if not exists idx_appt_assignments_appt
  on appointment_assignments (appointment_id);

create index if not exists idx_appt_assignments_tech
  on appointment_assignments (technician_id);


-- 5. ROW LEVEL SECURITY
--    Enable RLS and add a permissive policy so the app can read/write.
--    Tighten these policies once you add auth-based access control.
-- ------------------------------------------------------------
alter table profiles               enable row level security;
alter table appointments           enable row level security;
alter table appointment_assignments enable row level security;

create policy "allow_all_profiles"
  on profiles for all using (true) with check (true);

create policy "allow_all_appointments"
  on appointments for all using (true) with check (true);

create policy "allow_all_appt_assignments"
  on appointment_assignments for all using (true) with check (true);


-- ============================================================
-- NOTE on jobs.assigned_to
-- The existing jobs.assigned_to column (uuid, no FK) is left
-- unchanged. The new appointment_assignments table is now the
-- authoritative source for technician assignment.
-- Do NOT add a FK on jobs.assigned_to until you have cleaned
-- existing rows (many contain NULL or placeholder values).
-- ============================================================
