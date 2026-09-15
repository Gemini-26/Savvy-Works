-- ============================================================
-- 021 — Purchase order redesign: real supplier/customer linking
--
-- The "suppliers" and "customer_sites" tables already existed but had
-- zero rows and zero code referencing them — purchase_orders just stored
-- supplier_name as free text with no address/contact details at all.
-- This wires both tables up for real and adds the supporting PO columns:
-- cross-document links (quote/job/invoice), payment terms, delivery
-- details, and a 3-way notes split (supplier / delivery / internal).
--
-- HOW TO RUN: paste into Supabase Dashboard → SQL Editor → Run.
-- ============================================================

-- suppliers: had name/contact_name/email/phone only — add the address
-- fields the new Purchase Order form needs to show per supplier.
alter table suppliers add column if not exists mobile text;
alter table suppliers add column if not exists address text;
alter table suppliers add column if not exists city text;
alter table suppliers add column if not exists county text;
alter table suppliers add column if not exists postcode text;

-- purchase_orders: link to a real supplier (supplier_name is kept and
-- still auto-populated from it for backward compat with the PDF/list/
-- detail views that already read that column) and a customer + site for
-- "deliver to" — both nullable since most POs are stock restocks with no
-- customer involved. Also: cross-document refs, payment terms, and the
-- 3-way notes split from the new form.
alter table purchase_orders add column if not exists supplier_id uuid references suppliers(id);
alter table purchase_orders add column if not exists customer_id uuid references customers(id);
alter table purchase_orders add column if not exists site_id uuid references customer_sites(id);
alter table purchase_orders add column if not exists expected_delivery_date date;
alter table purchase_orders add column if not exists reference text;
alter table purchase_orders add column if not exists quote_id uuid references quotes(id);
alter table purchase_orders add column if not exists job_id uuid references jobs(id);
alter table purchase_orders add column if not exists invoice_id uuid references invoices(id);
alter table purchase_orders add column if not exists payment_terms_days integer default 30;
alter table purchase_orders add column if not exists supplier_notes text;
alter table purchase_orders add column if not exists delivery_notes text;

create index if not exists purchase_orders_supplier_id_idx on purchase_orders (supplier_id);
create index if not exists purchase_orders_customer_id_idx on purchase_orders (customer_id);
create index if not exists purchase_orders_site_id_idx    on purchase_orders (site_id);
create index if not exists purchase_orders_quote_id_idx   on purchase_orders (quote_id);
create index if not exists purchase_orders_job_id_idx     on purchase_orders (job_id);
create index if not exists purchase_orders_invoice_id_idx on purchase_orders (invoice_id);

-- ──────────────────────────────────────────────────────────────
-- DONE.
-- ──────────────────────────────────────────────────────────────
