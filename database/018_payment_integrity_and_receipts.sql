-- ============================================================
-- 018 — Payment integrity hardening
--
-- Fixes identified in a pre-launch security/workflow review of the
-- PayFast integration (017):
--
--   1. Cross-tenant payment link forgery — no fix here; enforced in
--      the create-payfast-payment Edge Function via company_id check.
--   2. Payment link overwrite orphans in-flight payments — fixed by
--      invoice_payment_attempts (one row per link generated, instead
--      of overwriting a single column).
--   3/4. ITN amount / merchant_id checks — no schema change needed;
--      enforced in the payfast-itn Edge Function.
--   7. Payment failure invisible — payment_status already exists,
--      this migration just adds refund/dispute states to it.
--   8. No audit trail on payment links — invoice_events table.
--   9. Race condition on job completion — find_or_create_draft_invoice()
--      RPC using an advisory lock so two concurrent "Complete Job"
--      submissions can't create two invoices for the same job.
--   11. No refund/dispute path — refunded_at / refund_reason columns
--      + a "refunded"/"disputed" payment_status value (no CHECK
--      constraint existed before, so no migration needed for the
--      values themselves — application code now writes them).
--
-- HOW TO RUN: paste into Supabase Dashboard → SQL Editor → Run.
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 1. INVOICE_PAYMENT_ATTEMPTS — every payment link ever generated for
--    an invoice, instead of overwriting invoices.payfast_m_payment_id.
--    The ITN handler matches against this table, so an earlier link
--    that a customer still has open keeps working even after a newer
--    one is generated.
-- ──────────────────────────────────────────────────────────────
create table if not exists invoice_payment_attempts (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid references companies(id) on delete cascade,
  invoice_id    uuid not null references invoices(id) on delete cascade,
  m_payment_id  text not null unique,
  amount        numeric(12,2) not null,
  status        text not null default 'pending', -- pending | completed | failed
  created_by    uuid references profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  resolved_at   timestamptz
);

create index if not exists invoice_payment_attempts_invoice_id_idx on invoice_payment_attempts (invoice_id);
create index if not exists invoice_payment_attempts_m_payment_id_idx on invoice_payment_attempts (m_payment_id);

alter table invoice_payment_attempts enable row level security;

drop policy if exists "invoice_payment_attempts_company_isolation" on invoice_payment_attempts;
create policy "invoice_payment_attempts_company_isolation"
  on invoice_payment_attempts for select
  using (company_id = get_my_company_id());

-- ──────────────────────────────────────────────────────────────
-- 2. INVOICE_EVENTS — audit trail: who generated/sent a payment link,
--    and what happened to it (paid / failed / refunded), for dispute
--    resolution and accountability.
-- ──────────────────────────────────────────────────────────────
create table if not exists invoice_events (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid references companies(id) on delete cascade,
  invoice_id  uuid not null references invoices(id) on delete cascade,
  event_type  text not null, -- link_generated | link_sent_whatsapp | payment_completed | payment_failed | refunded | disputed
  actor_id    uuid references profiles(id) on delete set null,
  actor_name  text,
  detail      text,
  created_at  timestamptz not null default now()
);

create index if not exists invoice_events_invoice_id_idx on invoice_events (invoice_id);

alter table invoice_events enable row level security;

drop policy if exists "invoice_events_company_isolation" on invoice_events;
create policy "invoice_events_company_isolation"
  on invoice_events for select
  using (company_id = get_my_company_id());

drop policy if exists "invoice_events_company_insert" on invoice_events;
create policy "invoice_events_company_insert"
  on invoice_events for insert
  with check (company_id = get_my_company_id());

-- Lets client-side code insert events (e.g. "sent via WhatsApp") without
-- needing company_id passed in explicitly — same auto-fill pattern used
-- across the rest of the schema.
create or replace trigger trg_invoice_events_company_id
  before insert on invoice_events
  for each row execute function set_company_id_on_insert();

-- ──────────────────────────────────────────────────────────────
-- 3. Refund / dispute tracking on invoices
-- ──────────────────────────────────────────────────────────────
alter table invoices
  add column if not exists refunded_at   timestamptz,
  add column if not exists refund_reason text;

-- ──────────────────────────────────────────────────────────────
-- 4. find_or_create_draft_invoice() — atomic find-or-create so two
--    concurrent "Complete Job" submissions for the same job can't
--    both pass the "no invoice yet" check and insert two invoices.
--    Uses a transaction-scoped advisory lock keyed on the job id.
-- ──────────────────────────────────────────────────────────────
create or replace function find_or_create_draft_invoice(
  p_job_id        uuid,
  p_company_id    uuid,
  p_customer_id   uuid,
  p_title         text,
  p_invoice_ref   text,
  p_invoice_number text,
  p_issue_date    date,
  p_site_address  text,
  p_site_city     text,
  p_site_county   text,
  p_site_postcode text
) returns invoices
language plpgsql
as $$
declare
  v_invoice invoices;
begin
  -- Serializes concurrent callers for the same job; released automatically
  -- at transaction end, so a second caller waits, then sees the first
  -- caller's row via the select below instead of inserting a duplicate.
  perform pg_advisory_xact_lock(hashtext(p_job_id::text));

  select * into v_invoice from invoices where job_id = p_job_id order by created_at asc limit 1;
  if found then
    return v_invoice;
  end if;

  insert into invoices (
    company_id, customer_id, job_id, title, status,
    invoice_ref, invoice_number, issue_date,
    site_address, site_city, site_county, site_postcode,
    subtotal, tax_total, total
  ) values (
    p_company_id, p_customer_id, p_job_id, p_title, 'draft',
    p_invoice_ref, p_invoice_number, p_issue_date,
    p_site_address, p_site_city, p_site_county, p_site_postcode,
    0, 0, 0
  )
  returning * into v_invoice;

  return v_invoice;
end;
$$;

-- ──────────────────────────────────────────────────────────────
-- DONE.
-- ──────────────────────────────────────────────────────────────
