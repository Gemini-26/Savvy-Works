-- ──────────────────────────────────────────────────────────────
-- SYSTEM CHANGE REQUESTS — any user can submit a request describing
-- an important system/data change they want made (e.g. deploying a
-- fix, altering settings); an admin reviews and approves/rejects it
-- in-app. Mirrors the password_change_requests pattern.
-- ──────────────────────────────────────────────────────────────
create table if not exists system_change_requests (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid references companies(id) on delete cascade,
  requested_by  uuid not null references profiles(id) on delete cascade,
  title         text not null,
  description   text,
  status        text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  requested_at  timestamptz not null default now(),
  resolved_by   uuid references profiles(id),
  resolved_at   timestamptz,
  resolution_note text
);

create index if not exists system_change_requests_status_idx  on system_change_requests (status);
create index if not exists system_change_requests_company_idx on system_change_requests (company_id);

alter table system_change_requests enable row level security;

create or replace trigger trg_system_change_requests_company_id
  before insert on system_change_requests
  for each row execute function set_company_id_on_insert();

-- Admins see every request in their company; everyone else sees only their own.
drop policy if exists "system_change_requests_select" on system_change_requests;
create policy "system_change_requests_select"
  on system_change_requests for select
  using (
    company_id = get_my_company_id()
    and (
      get_my_role() = 'admin'
      or requested_by = (select id from profiles where auth_user_id = auth.uid())
    )
  );

-- Anyone can submit a request for themselves.
drop policy if exists "system_change_requests_insert_own" on system_change_requests;
create policy "system_change_requests_insert_own"
  on system_change_requests for insert
  with check (
    company_id = get_my_company_id()
    and requested_by = (select id from profiles where auth_user_id = auth.uid())
    and status = 'pending'
  );

-- Only admins resolve (approve/reject) requests.
drop policy if exists "system_change_requests_update_admin" on system_change_requests;
create policy "system_change_requests_update_admin"
  on system_change_requests for update
  using (company_id = get_my_company_id() and get_my_role() = 'admin')
  with check (company_id = get_my_company_id() and get_my_role() = 'admin');

-- ──────────────────────────────────────────────────────────────
-- DONE.
-- ──────────────────────────────────────────────────────────────
