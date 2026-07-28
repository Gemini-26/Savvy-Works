-- ============================================================
-- 006 — Phase 3: Quotes module
--
-- Extends the bare-bones `quotes` table (id, customer_id, lead_id,
-- quote_number, status, total) with the fields NewQuotePage /
-- QuoteDetailPage need, and adds `quote_items` — line items pulled
-- from the Phase 2 catalogue (`items`).
--
-- SAFE TO RUN: only ALTERs `quotes` (adding columns) and CREATEs
-- `quote_items`. Does not touch any other table.
--
-- HOW TO RUN: paste into Supabase Dashboard → SQL Editor → Run.
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 1. QUOTES — fields used by NewQuotePage.jsx / QuoteDetailPage.jsx
-- ──────────────────────────────────────────────────────────────
alter table quotes
  add column if not exists quote_ref     text,
  add column if not exists title         text,
  add column if not exists assigned_to   uuid,
  add column if not exists site_address  text,
  add column if not exists site_city     text,
  add column if not exists site_county   text,
  add column if not exists site_postcode text,
  add column if not exists issue_date    date default current_date,
  add column if not exists valid_until   date,
  add column if not exists notes         text,
  add column if not exists terms         text,
  add column if not exists subtotal      numeric(12,2) default 0,
  add column if not exists tax_total     numeric(12,2) default 0,
  add column if not exists job_id        uuid references jobs(id) on delete set null;

create unique index if not exists quotes_quote_ref_key on quotes (quote_ref) where quote_ref is not null;
create index if not exists quotes_customer_id_idx on quotes (customer_id);

-- Clean up orphaned assigned_to values before adding the FK
update quotes set assigned_to = null
  where assigned_to is not null
    and assigned_to not in (select id from profiles);

alter table quotes
  drop constraint if exists quotes_assigned_to_fk;
alter table quotes
  add constraint quotes_assigned_to_fk
    foreign key (assigned_to) references profiles(id) on delete set null;

-- ──────────────────────────────────────────────────────────────
-- 2. QUOTE_ITEMS — line items, optionally pulled from the catalogue
-- ──────────────────────────────────────────────────────────────
create table if not exists quote_items (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid references companies(id) on delete cascade,
  quote_id    uuid not null references quotes(id) on delete cascade,
  item_id     uuid references items(id) on delete set null,
  sort_order  integer not null default 0,
  description text not null,
  quantity    numeric(12,2) not null default 1,
  unit        text not null default 'each',
  unit_price  numeric(12,2) not null default 0,
  tax_rate    numeric(5,2)  not null default 15.00,
  line_total  numeric(12,2) not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists quote_items_quote_id_idx   on quote_items (quote_id);
create index if not exists quote_items_company_id_idx on quote_items (company_id);

alter table quote_items enable row level security;

drop policy if exists "quote_items_company_isolation" on quote_items;
create policy "quote_items_company_isolation"
  on quote_items for all
  using  (company_id = get_my_company_id())
  with check (company_id = get_my_company_id());

create or replace trigger trg_quote_items_company_id
  before insert on quote_items
  for each row execute function set_company_id_on_insert();

-- ──────────────────────────────────────────────────────────────
-- DONE.
-- ──────────────────────────────────────────────────────────────
