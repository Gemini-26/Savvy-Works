-- ============================================================
-- 008 — Phase 5: Invoices module
--
-- Extends the bare-bones `invoices` table (id, customer_id, job_id,
-- invoice_number, status, total) with the fields NewInvoicePage /
-- InvoiceDetailPage need, and adds `invoice_items` — line items,
-- either typed manually or carried over from a completed job's quote.
--
-- SAFE TO RUN: only ALTERs `invoices` (adding columns) and CREATEs
-- `invoice_items`. Does not touch any other table.
--
-- HOW TO RUN: paste into Supabase Dashboard → SQL Editor → Run.
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 1. INVOICES — fields used by NewInvoicePage.jsx / InvoiceDetailPage.jsx
-- ──────────────────────────────────────────────────────────────
alter table invoices
  add column if not exists invoice_ref  text,
  add column if not exists title        text,
  add column if not exists site_address text,
  add column if not exists site_city    text,
  add column if not exists site_county  text,
  add column if not exists site_postcode text,
  add column if not exists issue_date   date default current_date,
  add column if not exists due_date     date,
  add column if not exists notes        text,
  add column if not exists terms        text,
  add column if not exists subtotal     numeric(12,2) default 0,
  add column if not exists tax_total    numeric(12,2) default 0;

create unique index if not exists invoices_invoice_ref_key on invoices (invoice_ref) where invoice_ref is not null;
create index if not exists invoices_customer_id_idx on invoices (customer_id);
create index if not exists invoices_job_id_idx      on invoices (job_id);

-- ──────────────────────────────────────────────────────────────
-- 2. INVOICE_ITEMS — line items, optionally carried over from quote_items
-- ──────────────────────────────────────────────────────────────
create table if not exists invoice_items (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid references companies(id) on delete cascade,
  invoice_id  uuid not null references invoices(id) on delete cascade,
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

create index if not exists invoice_items_invoice_id_idx on invoice_items (invoice_id);
create index if not exists invoice_items_company_id_idx on invoice_items (company_id);

alter table invoice_items enable row level security;

drop policy if exists "invoice_items_company_isolation" on invoice_items;
create policy "invoice_items_company_isolation"
  on invoice_items for all
  using  (company_id = get_my_company_id())
  with check (company_id = get_my_company_id());

create or replace trigger trg_invoice_items_company_id
  before insert on invoice_items
  for each row execute function set_company_id_on_insert();

-- ──────────────────────────────────────────────────────────────
-- DONE. invoices.company_id / RLS / trigger already exist (migration 003).
-- ──────────────────────────────────────────────────────────────
