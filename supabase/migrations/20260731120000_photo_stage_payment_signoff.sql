-- ──────────────────────────────────────────────────────────────
-- PHOTO STAGE + PAYMENT TYPE + CUSTOMER SIGN-OFF NAME
--
-- 1. job_photos.stage — tags every photo as 'before' or 'after' so
--    the before/after tabs on a job can group correctly, and so
--    completion can be gated on having at least one of each.
-- 2. jobs.payment_type — customer's chosen payment method, captured
--    right after sign-off.
-- 3. jobs.sign_off_customer_name — the customer's own typed name/
--    surname at sign-off (distinct from sign_off_name, which is the
--    technician who completed the job).
-- ──────────────────────────────────────────────────────────────

alter table job_photos
  add column if not exists stage text not null default 'before'
  check (stage in ('before', 'after'));

alter table jobs
  add column if not exists payment_type          text,
  add column if not exists sign_off_customer_name text;

-- ──────────────────────────────────────────────────────────────
-- DONE.
-- ──────────────────────────────────────────────────────────────
