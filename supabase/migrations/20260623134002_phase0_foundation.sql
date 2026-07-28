-- ============================================================
-- 003 — Phase 0 Foundation: Multi-tenancy, RLS, Profile Link,
--       FK Constraints, Phone Cleanup, Document Sequences
--
-- HOW TO RUN:
--   Paste this entire file into Supabase Dashboard → SQL Editor → Run
--
-- AFTER RUNNING, do these 3 manual steps in Supabase Table Editor:
--   1. INSERT INTO companies (name, email) VALUES ('Savvy Civils and Plumbing', 'your@email.com');
--      Copy the UUID that was created.
--   2. UPDATE profiles
--        SET company_id   = '<company-uuid>',
--            auth_user_id = '<your-auth-user-uuid>'   -- find this in Authentication > Users
--        WHERE id = '<your-profile-id>';
--   3. UPDATE customers              SET company_id = '<company-uuid>';
--      UPDATE leads                  SET company_id = '<company-uuid>';
--      UPDATE jobs                   SET company_id = '<company-uuid>';
--      UPDATE quotes                 SET company_id = '<company-uuid>';
--      UPDATE invoices               SET company_id = '<company-uuid>';
--      UPDATE customer_sites         SET company_id = '<company-uuid>';
--      UPDATE appointments           SET company_id = '<company-uuid>';
--      UPDATE appointment_assignments SET company_id = '<company-uuid>';
-- ============================================================


-- ──────────────────────────────────────────────────────────────
-- 1. COMPANIES TABLE (no RLS policy yet — added after profiles)
-- ──────────────────────────────────────────────────────────────
create table if not exists companies (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  email        text,
  phone        text,
  address      text,
  city         text,
  postcode     text,
  country      text default 'South Africa',
  vat_no       text,
  company_reg  text,
  logo_url     text,
  currency     text default 'ZAR',
  created_at   timestamptz not null default now()
);

alter table companies enable row level security;


-- ──────────────────────────────────────────────────────────────
-- 2. ADD columns to PROFILES first (so the helper function
--    and all policies that read profiles.company_id will work)
-- ──────────────────────────────────────────────────────────────
alter table profiles
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null,
  add column if not exists email        text,
  add column if not exists company_id   uuid references companies(id)  on delete set null;

create unique index if not exists profiles_auth_user_id_key
  on profiles (auth_user_id) where auth_user_id is not null;

create index if not exists profiles_company_id_idx    on profiles (company_id);
create index if not exists profiles_auth_user_id_idx  on profiles (auth_user_id);


-- ──────────────────────────────────────────────────────────────
-- 3. HELPER FUNCTION — now safe because profiles.company_id exists
-- ──────────────────────────────────────────────────────────────
create or replace function get_my_company_id()
returns uuid
language sql
stable
security definer
as $$
  select company_id
  from   profiles
  where  auth_user_id = auth.uid()
  limit  1;
$$;


-- ──────────────────────────────────────────────────────────────
-- 4. NOW add the companies RLS policy (profiles.company_id exists)
-- ──────────────────────────────────────────────────────────────
create policy "company_self_access"
  on companies for all
  using  (id = get_my_company_id())
  with check (id = get_my_company_id());


-- ──────────────────────────────────────────────────────────────
-- 5. ADD company_id TO ALL OTHER TABLES
-- ──────────────────────────────────────────────────────────────

alter table customers
  add column if not exists company_id uuid references companies(id) on delete cascade;
create index if not exists customers_company_id_idx on customers (company_id);

alter table customer_sites
  add column if not exists company_id uuid references companies(id) on delete cascade;
create index if not exists customer_sites_company_id_idx on customer_sites (company_id);

alter table leads
  add column if not exists company_id uuid references companies(id) on delete cascade;
create index if not exists leads_company_id_idx on leads (company_id);

alter table quotes
  add column if not exists company_id uuid references companies(id) on delete cascade;
create index if not exists quotes_company_id_idx on quotes (company_id);

alter table jobs
  add column if not exists company_id uuid references companies(id) on delete cascade;
create index if not exists jobs_company_id_idx on jobs (company_id);

alter table invoices
  add column if not exists company_id uuid references companies(id) on delete cascade;
create index if not exists invoices_company_id_idx on invoices (company_id);

alter table appointments
  add column if not exists company_id uuid references companies(id) on delete cascade;
create index if not exists appointments_company_id_idx on appointments (company_id);

alter table appointment_assignments
  add column if not exists company_id uuid references companies(id) on delete cascade;
create index if not exists appt_assignments_company_id_idx on appointment_assignments (company_id);


-- ──────────────────────────────────────────────────────────────
-- 6. ENABLE RLS on tables that didn't have it yet
-- ──────────────────────────────────────────────────────────────
alter table customers           enable row level security;
alter table customer_sites      enable row level security;
alter table leads               enable row level security;
alter table quotes              enable row level security;
alter table jobs                enable row level security;
alter table invoices            enable row level security;


-- ──────────────────────────────────────────────────────────────
-- 7. DROP OLD WIDE-OPEN POLICIES, ADD COMPANY-SCOPED ONES
-- ──────────────────────────────────────────────────────────────
drop policy if exists "allow_all_profiles"              on profiles;
drop policy if exists "allow_all_appointments"          on appointments;
drop policy if exists "allow_all_appt_assignments"      on appointment_assignments;

create policy "profiles_company_isolation"
  on profiles for all
  using  (company_id = get_my_company_id())
  with check (company_id = get_my_company_id());

create policy "customers_company_isolation"
  on customers for all
  using  (company_id = get_my_company_id())
  with check (company_id = get_my_company_id());

create policy "customer_sites_company_isolation"
  on customer_sites for all
  using  (company_id = get_my_company_id())
  with check (company_id = get_my_company_id());

create policy "leads_company_isolation"
  on leads for all
  using  (company_id = get_my_company_id())
  with check (company_id = get_my_company_id());

create policy "quotes_company_isolation"
  on quotes for all
  using  (company_id = get_my_company_id())
  with check (company_id = get_my_company_id());

create policy "jobs_company_isolation"
  on jobs for all
  using  (company_id = get_my_company_id())
  with check (company_id = get_my_company_id());

create policy "invoices_company_isolation"
  on invoices for all
  using  (company_id = get_my_company_id())
  with check (company_id = get_my_company_id());

create policy "appointments_company_isolation"
  on appointments for all
  using  (company_id = get_my_company_id())
  with check (company_id = get_my_company_id());

create policy "appt_assignments_company_isolation"
  on appointment_assignments for all
  using  (company_id = get_my_company_id())
  with check (company_id = get_my_company_id());


-- ──────────────────────────────────────────────────────────────
-- 8. DROP REDUNDANT customers.phone COLUMN
-- ──────────────────────────────────────────────────────────────
alter table customers drop column if exists phone;


-- ──────────────────────────────────────────────────────────────
-- 9. FK CONSTRAINTS ON assigned_to
-- ──────────────────────────────────────────────────────────────

-- Clean up orphaned UUIDs before adding the constraint
update leads set assigned_to = null
  where assigned_to is not null
    and assigned_to not in (select id from profiles);

update jobs set assigned_to = null
  where assigned_to is not null
    and assigned_to not in (select id from profiles);

alter table leads
  drop constraint if exists leads_assigned_to_fk;
alter table leads
  add constraint leads_assigned_to_fk
    foreign key (assigned_to) references profiles(id) on delete set null;

alter table jobs
  drop constraint if exists jobs_assigned_to_fk;
alter table jobs
  add constraint jobs_assigned_to_fk
    foreign key (assigned_to) references profiles(id) on delete set null;


-- ──────────────────────────────────────────────────────────────
-- 10. DOCUMENT COUNTERS + GENERATOR FUNCTION
-- ──────────────────────────────────────────────────────────────
create table if not exists document_counters (
  company_id  uuid    not null references companies(id) on delete cascade,
  doc_type    text    not null,
  last_number integer not null default 0,
  primary key (company_id, doc_type)
);

alter table document_counters enable row level security;

create policy "doc_counters_company_isolation"
  on document_counters for all
  using  (company_id = get_my_company_id())
  with check (company_id = get_my_company_id());

create or replace function next_document_number(p_company_id uuid, p_doc_type text)
returns text
language plpgsql
security definer
as $$
declare
  v_next   integer;
  v_prefix text;
begin
  insert into document_counters (company_id, doc_type, last_number)
    values (p_company_id, p_doc_type, 1)
  on conflict (company_id, doc_type)
    do update set last_number = document_counters.last_number + 1
  returning last_number into v_next;

  v_prefix := case p_doc_type
    when 'quote'   then 'Q'
    when 'job'     then 'J'
    when 'invoice' then 'INV'
    when 'lead'    then 'LD'
    else upper(p_doc_type)
  end;

  return v_prefix || '-' || lpad(v_next::text, 5, '0');
end;
$$;


-- ──────────────────────────────────────────────────────────────
-- 11. AUTO-FILL company_id ON INSERT (trigger on all tables)
-- ──────────────────────────────────────────────────────────────
create or replace function set_company_id_on_insert()
returns trigger
language plpgsql
security definer
as $$
begin
  if new.company_id is null then
    new.company_id := get_my_company_id();
  end if;
  return new;
end;
$$;

create or replace trigger trg_customers_company_id
  before insert on customers
  for each row execute function set_company_id_on_insert();

create or replace trigger trg_customer_sites_company_id
  before insert on customer_sites
  for each row execute function set_company_id_on_insert();

create or replace trigger trg_leads_company_id
  before insert on leads
  for each row execute function set_company_id_on_insert();

create or replace trigger trg_quotes_company_id
  before insert on quotes
  for each row execute function set_company_id_on_insert();

create or replace trigger trg_jobs_company_id
  before insert on jobs
  for each row execute function set_company_id_on_insert();

create or replace trigger trg_invoices_company_id
  before insert on invoices
  for each row execute function set_company_id_on_insert();

create or replace trigger trg_profiles_company_id
  before insert on profiles
  for each row execute function set_company_id_on_insert();

create or replace trigger trg_appointments_company_id
  before insert on appointments
  for each row execute function set_company_id_on_insert();

create or replace trigger trg_appt_assignments_company_id
  before insert on appointment_assignments
  for each row execute function set_company_id_on_insert();


-- ──────────────────────────────────────────────────────────────
-- DONE. Now complete the 3 manual steps at the top of this file.
-- ──────────────────────────────────────────────────────────────
