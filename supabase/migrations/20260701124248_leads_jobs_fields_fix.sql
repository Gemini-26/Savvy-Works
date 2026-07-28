-- ============================================================
-- 004 — Fix Leads & Jobs schema drift
--
-- PROBLEM: NewLeadPage/LeadDetailPage and NewJobPage/JobDetailPage
-- read/write dozens of columns (job_ref, title, contact_name,
-- site_address, preferred_call_date, etc.) that were never added
-- to the `leads` / `jobs` tables in 001_foundation_schema.sql.
-- Creating a Lead or a Job currently fails with a Postgres
-- "column does not exist" error. This migration adds every column
-- the front-end already depends on, plus the `customer_contacts`
-- table used by the job/lead contact-picker.
--
-- HOW TO RUN: paste into Supabase Dashboard → SQL Editor → Run.
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 1. LEADS — fields used by NewLeadPage.jsx / LeadDetailPage.jsx
-- ──────────────────────────────────────────────────────────────
alter table leads
  add column if not exists lead_ref            text,
  add column if not exists full_name           text,
  add column if not exists company_name        text,
  add column if not exists email               text,
  add column if not exists telephone           text,
  add column if not exists mobile              text,
  add column if not exists website             text,
  add column if not exists address             text,
  add column if not exists city                text,
  add column if not exists county              text,
  add column if not exists postcode            text,
  add column if not exists title               text,
  add column if not exists preferred_call_date date,
  add column if not exists preferred_call_time text;

create unique index if not exists leads_lead_ref_key on leads (lead_ref) where lead_ref is not null;

-- ──────────────────────────────────────────────────────────────
-- 2. JOBS — fields used by NewJobPage.jsx / JobDetailPage.jsx
-- ──────────────────────────────────────────────────────────────
alter table jobs
  add column if not exists job_ref            text,
  add column if not exists job_type           text,
  add column if not exists priority           text default 'medium',
  add column if not exists customer_ref       text,
  add column if not exists customer_job_ref   text,
  add column if not exists po_ref             text,
  add column if not exists alert_by_email     boolean default false,
  add column if not exists sms_alert          boolean default false,
  add column if not exists start_date         date,
  add column if not exists complete_by        date,
  add column if not exists title              text,
  add column if not exists description        text,
  add column if not exists notes              text,
  add column if not exists customer_type      text,
  add column if not exists contact_name       text,
  add column if not exists contact_email      text,
  add column if not exists contact_telephone  text,
  add column if not exists contact_mobile     text,
  add column if not exists site_company       text,
  add column if not exists site_contact_name  text,
  add column if not exists site_contact_email text,
  add column if not exists site_telephone     text,
  add column if not exists site_mobile        text,
  add column if not exists site_address       text,
  add column if not exists site_city          text,
  add column if not exists site_county        text,
  add column if not exists site_postcode      text,
  add column if not exists site_country       text default 'South Africa',
  add column if not exists site_notes         text;

create unique index if not exists jobs_job_ref_key on jobs (job_ref) where job_ref is not null;

-- ──────────────────────────────────────────────────────────────
-- 3. CUSTOMER_CONTACTS — referenced by NewJobPage.jsx contact
--    picker but never created in any prior migration.
-- ──────────────────────────────────────────────────────────────
create table if not exists customer_contacts (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  first_name  text,
  last_name   text,
  email       text,
  telephone   text,
  mobile      text,
  role        text,
  created_at  timestamptz not null default now()
);

-- Defensive: in case this table was already created by a prior partial run
-- before company_id existed on it.
alter table customer_contacts
  add column if not exists company_id uuid references companies(id) on delete cascade;

create index if not exists customer_contacts_customer_id_idx on customer_contacts (customer_id);
create index if not exists customer_contacts_company_id_idx  on customer_contacts (company_id);

alter table customer_contacts enable row level security;

drop policy if exists "customer_contacts_company_isolation" on customer_contacts;
create policy "customer_contacts_company_isolation"
  on customer_contacts for all
  using  (company_id = get_my_company_id())
  with check (company_id = get_my_company_id());

create or replace trigger trg_customer_contacts_company_id
  before insert on customer_contacts
  for each row execute function set_company_id_on_insert();

-- ──────────────────────────────────────────────────────────────
-- 4. SUPPLIERS — referenced by Dashboard.jsx stat card but never
--    created. Minimal table so the dashboard query stops erroring;
--    the full Suppliers module is still a future phase.
-- ──────────────────────────────────────────────────────────────
create table if not exists suppliers (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  contact_name text,
  email        text,
  phone        text,
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

-- Defensive: in case this table was already created by a prior partial run
-- before company_id existed on it.
alter table suppliers
  add column if not exists company_id uuid references companies(id) on delete cascade;

create index if not exists suppliers_company_id_idx on suppliers (company_id);

alter table suppliers enable row level security;

drop policy if exists "suppliers_company_isolation" on suppliers;
create policy "suppliers_company_isolation"
  on suppliers for all
  using  (company_id = get_my_company_id())
  with check (company_id = get_my_company_id());

create or replace trigger trg_suppliers_company_id
  before insert on suppliers
  for each row execute function set_company_id_on_insert();

-- ──────────────────────────────────────────────────────────────
-- DONE.
-- ──────────────────────────────────────────────────────────────
