-- ============================================================
-- 010 — Phase 5: Purchase Orders module
--
-- Creates `purchase_orders` (approval workflow: draft/awaiting_approval/
-- approved/rejected/actioned/paid) with a free-text supplier_name field
-- (no suppliers table yet), and `purchase_order_items` — line items,
-- same shape as invoice_items/quote_items.
--
-- SAFE TO RUN: only CREATEs new tables. Does not touch any other table.
--
-- HOW TO RUN: paste into Supabase Dashboard → SQL Editor → Run.
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 1. PURCHASE_ORDERS
-- ──────────────────────────────────────────────────────────────
create table if not exists purchase_orders (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid references companies(id) on delete cascade,
  po_ref         text,
  title          text,
  supplier_name  text,
  status         text not null default 'draft'
                 check (status in ('draft','awaiting_approval','approved','rejected','actioned','paid')),
  issue_date     date default current_date,
  due_date       date,
  notes          text,
  terms          text,
  subtotal       numeric(12,2) default 0,
  tax_total      numeric(12,2) default 0,
  total          numeric(12,2) default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create unique index if not exists purchase_orders_po_ref_key on purchase_orders (po_ref) where po_ref is not null;
create index if not exists purchase_orders_company_id_idx on purchase_orders (company_id);

alter table purchase_orders enable row level security;

drop policy if exists "purchase_orders_company_isolation" on purchase_orders;
create policy "purchase_orders_company_isolation"
  on purchase_orders for all
  using  (company_id = get_my_company_id())
  with check (company_id = get_my_company_id());

create or replace trigger trg_purchase_orders_company_id
  before insert on purchase_orders
  for each row execute function set_company_id_on_insert();

-- ──────────────────────────────────────────────────────────────
-- 2. PURCHASE_ORDER_ITEMS
-- ──────────────────────────────────────────────────────────────
create table if not exists purchase_order_items (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid references companies(id) on delete cascade,
  purchase_order_id   uuid not null references purchase_orders(id) on delete cascade,
  item_id             uuid references items(id) on delete set null,
  sort_order          integer not null default 0,
  description         text not null,
  quantity            numeric(12,2) not null default 1,
  unit                text not null default 'each',
  unit_price          numeric(12,2) not null default 0,
  tax_rate            numeric(5,2)  not null default 15.00,
  line_total          numeric(12,2) not null default 0,
  created_at          timestamptz not null default now()
);

create index if not exists purchase_order_items_po_id_idx on purchase_order_items (purchase_order_id);
create index if not exists purchase_order_items_company_id_idx on purchase_order_items (company_id);

alter table purchase_order_items enable row level security;

drop policy if exists "purchase_order_items_company_isolation" on purchase_order_items;
create policy "purchase_order_items_company_isolation"
  on purchase_order_items for all
  using  (company_id = get_my_company_id())
  with check (company_id = get_my_company_id());

create or replace trigger trg_purchase_order_items_company_id
  before insert on purchase_order_items
  for each row execute function set_company_id_on_insert();

-- ──────────────────────────────────────────────────────────────
-- DONE.
-- ──────────────────────────────────────────────────────────────
