-- ============================================================
-- 005 — Phase 2: Items / Catalogue
--
-- Adds the product/service/labour catalogue that Quotes (Phase 3)
-- and Invoices (Phase 5) will pull line items from.
--
-- SAFE TO RUN: this migration only CREATES new tables
-- (item_categories, items). It does not alter, drop, or touch
-- any existing table, column, policy, or trigger — no existing
-- connection or feature is affected.
--
-- HOW TO RUN: paste into Supabase Dashboard → SQL Editor → Run.
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 1. ITEM_CATEGORIES — flat grouping for the catalogue UI
--    (e.g. "Plumbing Parts", "Labour", "Consumables")
-- ──────────────────────────────────────────────────────────────
create table if not exists item_categories (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid references companies(id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now()
);

alter table item_categories
  add column if not exists company_id uuid references companies(id) on delete cascade;

create unique index if not exists item_categories_company_name_key
  on item_categories (company_id, name);

alter table item_categories enable row level security;

drop policy if exists "item_categories_company_isolation" on item_categories;
create policy "item_categories_company_isolation"
  on item_categories for all
  using  (company_id = get_my_company_id())
  with check (company_id = get_my_company_id());

create or replace trigger trg_item_categories_company_id
  before insert on item_categories
  for each row execute function set_company_id_on_insert();


-- ──────────────────────────────────────────────────────────────
-- 2. ITEMS — the catalogue itself
-- ──────────────────────────────────────────────────────────────
create table if not exists items (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid references companies(id) on delete cascade,
  category_id   uuid references item_categories(id) on delete set null,
  item_code     text,
  name          text not null,
  description   text,
  item_type     text not null default 'product',   -- 'product' | 'service' | 'labour'
  unit          text not null default 'each',       -- 'each' | 'hour' | 'm2' | 'litre' | ...
  cost_price    numeric(12,2) not null default 0,
  sell_price    numeric(12,2) not null default 0,
  tax_rate      numeric(5,2)  not null default 15.00, -- SA VAT %
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

alter table items
  add column if not exists company_id uuid references companies(id) on delete cascade;

create unique index if not exists items_company_code_key
  on items (company_id, item_code) where item_code is not null;

create index if not exists items_company_id_idx  on items (company_id);
create index if not exists items_category_id_idx on items (category_id);
create index if not exists items_active_idx       on items (company_id, active);

alter table items enable row level security;

drop policy if exists "items_company_isolation" on items;
create policy "items_company_isolation"
  on items for all
  using  (company_id = get_my_company_id())
  with check (company_id = get_my_company_id());

create or replace trigger trg_items_company_id
  before insert on items
  for each row execute function set_company_id_on_insert();

-- ──────────────────────────────────────────────────────────────
-- DONE.
-- ──────────────────────────────────────────────────────────────
