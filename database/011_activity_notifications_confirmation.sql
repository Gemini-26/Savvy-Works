-- ============================================================
-- 011 — Phase 6.5 cont'd: Job activity log, notifications,
-- admin job-completion confirmation, technician work shifts
--
-- SAFE TO RUN: only CREATEs new tables and ALTERs `jobs` (adding
-- columns). Does not touch existing data or other tables.
--
-- HOW TO RUN: paste into Supabase Dashboard → SQL Editor → Run.
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 1. JOB_ACTIVITY — append-only audit trail per job.
--    Every allocation, edit, technician response, clock event,
--    photo upload, and completion step writes a row here.
--    actor_name is denormalized (snapshot at time of action) so
--    the log still reads correctly if a profile is later renamed.
-- ──────────────────────────────────────────────────────────────
create table if not exists job_activity (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid references companies(id) on delete cascade,
  job_id      uuid not null references jobs(id) on delete cascade,
  actor_id    uuid references profiles(id) on delete set null,
  actor_name  text,
  action      text not null,
  detail      text,
  created_at  timestamptz not null default now()
);

create index if not exists job_activity_job_id_idx on job_activity (job_id);
create index if not exists job_activity_company_id_idx on job_activity (company_id);

alter table job_activity enable row level security;

drop policy if exists "job_activity_company_isolation" on job_activity;
create policy "job_activity_company_isolation"
  on job_activity for all
  using  (company_id = get_my_company_id())
  with check (company_id = get_my_company_id());

create or replace trigger trg_job_activity_company_id
  before insert on job_activity
  for each row execute function set_company_id_on_insert();

-- ──────────────────────────────────────────────────────────────
-- 2. NOTIFICATIONS — per-user inbox. Recipients are profiles
--    (admins get notified when a technician accepts/declines).
-- ──────────────────────────────────────────────────────────────
create table if not exists notifications (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid references companies(id) on delete cascade,
  user_id     uuid not null references profiles(id) on delete cascade,
  title       text not null,
  body        text,
  link        text,
  is_read     boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists notifications_user_id_idx on notifications (user_id);
create index if not exists notifications_company_id_idx on notifications (company_id);

alter table notifications enable row level security;

drop policy if exists "notifications_company_isolation" on notifications;
create policy "notifications_company_isolation"
  on notifications for all
  using  (company_id = get_my_company_id())
  with check (company_id = get_my_company_id());

create or replace trigger trg_notifications_company_id
  before insert on notifications
  for each row execute function set_company_id_on_insert();

-- ──────────────────────────────────────────────────────────────
-- 3. JOBS — split "technician marks complete" from "admin confirms
--    complete". Technician completion now lands on status
--    'pending_confirmation'; admin confirmation flips it to
--    'completed' (the status the rest of the app — invoicing —
--    already expects).
-- ──────────────────────────────────────────────────────────────
alter table jobs
  add column if not exists confirmed_at timestamptz,
  add column if not exists confirmed_by uuid references profiles(id);

-- ──────────────────────────────────────────────────────────────
-- 4. WORK_SHIFTS — technician "logged on for work" clock in/out,
--    separate from per-job clock in/out (appointment_assignments).
-- ──────────────────────────────────────────────────────────────
create table if not exists work_shifts (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid references companies(id) on delete cascade,
  technician_id uuid not null references profiles(id) on delete cascade,
  clock_in      timestamptz not null default now(),
  clock_out     timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists work_shifts_technician_id_idx on work_shifts (technician_id);
create index if not exists work_shifts_company_id_idx on work_shifts (company_id);

alter table work_shifts enable row level security;

drop policy if exists "work_shifts_company_isolation" on work_shifts;
create policy "work_shifts_company_isolation"
  on work_shifts for all
  using  (company_id = get_my_company_id())
  with check (company_id = get_my_company_id());

create or replace trigger trg_work_shifts_company_id
  before insert on work_shifts
  for each row execute function set_company_id_on_insert();

-- ──────────────────────────────────────────────────────────────
-- DONE.
-- ──────────────────────────────────────────────────────────────
