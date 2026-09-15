-- ============================================================
-- 020 — Payment method tracking on invoices and purchase orders
--
-- Neither table had any record of *how* something was paid — only
-- whether it was. `invoices.payfast_payment_id` proved PayFast, but
-- Cash/EFT/Account settlements left no trace at all, and there was no
-- way to filter either list by payment method.
--
-- HOW TO RUN: paste into Supabase Dashboard → SQL Editor → Run.
-- ============================================================

alter table invoices
  add column if not exists payment_method text;

alter table purchase_orders
  add column if not exists payment_method text;

create index if not exists invoices_payment_method_idx on invoices (payment_method);
create index if not exists purchase_orders_payment_method_idx on purchase_orders (payment_method);

-- Backfill is safe (not a guess) only for the PayFast case: any invoice
-- that already carries a real pf_payment_id was, as a matter of fact,
-- paid via PayFast. Everything else that's already marked paid predates
-- this column and there's no way to recover how it was actually
-- settled, so it's left blank rather than assumed.
update invoices
  set payment_method = 'PayFast'
  where payfast_payment_id is not null
    and payment_method is null;

-- ──────────────────────────────────────────────────────────────
-- DONE.
-- ──────────────────────────────────────────────────────────────
