-- ──────────────────────────────────────────────────────────────
-- PASSWORD CHANGE REQUESTS — technicians can't change their own
-- password (only Supabase Auth admin API can, and that requires
-- the service-role key), so they log a request here for an admin
-- to action. Admins change passwords directly via the change-
-- password edge function, which also auto-resolves any pending
-- request for that profile.
-- ──────────────────────────────────────────────────────────────
create table if not exists password_change_requests (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid references companies(id) on delete cascade,
  profile_id    uuid not null references profiles(id) on delete cascade,
  status        text not null default 'pending' check (status in ('pending', 'completed', 'dismissed')),
  requested_at  timestamptz not null default now(),
  resolved_by   uuid references profiles(id),
  resolved_at   timestamptz
);

create index if not exists password_change_requests_profile_id_idx on password_change_requests (profile_id);
create index if not exists password_change_requests_status_idx     on password_change_requests (status);

alter table password_change_requests enable row level security;

create or replace trigger trg_password_change_requests_company_id
  before insert on password_change_requests
  for each row execute function set_company_id_on_insert();

-- Admins see every request in their company; a technician sees only
-- their own (so they can tell whether their request already went in).
drop policy if exists "password_change_requests_select" on password_change_requests;
create policy "password_change_requests_select"
  on password_change_requests for select
  using (
    company_id = get_my_company_id()
    and (
      get_my_role() = 'admin'
      or profile_id = (select id from profiles where auth_user_id = auth.uid())
    )
  );

-- Anyone can request a change for themselves — nothing else.
drop policy if exists "password_change_requests_insert_own" on password_change_requests;
create policy "password_change_requests_insert_own"
  on password_change_requests for insert
  with check (
    company_id = get_my_company_id()
    and profile_id = (select id from profiles where auth_user_id = auth.uid())
    and status = 'pending'
  );

-- Only admins resolve requests (dismiss/complete); the change-password
-- edge function uses the service-role key so it bypasses this anyway.
drop policy if exists "password_change_requests_update_admin" on password_change_requests;
create policy "password_change_requests_update_admin"
  on password_change_requests for update
  using (company_id = get_my_company_id() and get_my_role() = 'admin')
  with check (company_id = get_my_company_id() and get_my_role() = 'admin');

-- ──────────────────────────────────────────────────────────────
-- DONE.
-- ──────────────────────────────────────────────────────────────
