-- ============================================================
-- 017 — PayFast payment integration
--
-- Adds payment-gateway tracking fields to `invoices` so a "Pay Now"
-- link can be generated and PayFast's ITN webhook can mark the
-- invoice paid once the customer completes checkout.
--
-- SAFE TO RUN: only ALTERs `invoices` (adding columns).
--
-- HOW TO RUN: paste into Supabase Dashboard → SQL Editor → Run.
-- ============================================================

alter table invoices
  add column if not exists payment_status     text default 'unpaid',
  add column if not exists payfast_payment_id text,
  add column if not exists payfast_m_payment_id text,
  add column if not exists paid_at            timestamptz;

create index if not exists invoices_payfast_m_payment_id_idx
  on invoices (payfast_m_payment_id) where payfast_m_payment_id is not null;

-- ──────────────────────────────────────────────────────────────
-- DONE.
-- ──────────────────────────────────────────────────────────────
