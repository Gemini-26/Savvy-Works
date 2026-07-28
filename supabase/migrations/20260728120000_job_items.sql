-- ============================================================
-- 015 — Job Items
--
-- Jobs currently have no line items of their own — when a quote is
-- converted to a job, quote_items were never copied over, so there
-- was no persisted record of what materials/costs applied to the
-- job itself (invoicing had to reach back through job.quote_id to
-- the original quote_items, which breaks if the technician's actual
-- materials used differ from what was quoted, or if the job was
-- never quoted at all).
--
-- Adds `job_items`, mirroring quote_items / invoice_items exactly.
--
-- SAFE TO RUN: only CREATEs `job_items`. Does not touch any other table.
--
-- HOW TO RUN: paste into Supabase Dashboard → SQL Editor → Run.
-- ============================================================

create table if not exists job_items (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid references companies(id) on delete cascade,
  job_id      uuid not null references jobs(id) on delete cascade,
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

create index if not exists job_items_job_id_idx     on job_items (job_id);
create index if not exists job_items_company_id_idx on job_items (company_id);

alter table job_items enable row level security;

drop policy if exists "job_items_company_isolation" on job_items;
create policy "job_items_company_isolation"
  on job_items for all
  using  (company_id = get_my_company_id())
  with check (company_id = get_my_company_id());

create or replace trigger trg_job_items_company_id
  before insert on job_items
  for each row execute function set_company_id_on_insert();

-- ──────────────────────────────────────────────────────────────
-- Backfill: copy quote_items into job_items for jobs that were
-- already converted from a quote before this migration existed.
-- ──────────────────────────────────────────────────────────────
insert into job_items (company_id, job_id, item_id, sort_order, description, quantity, unit, unit_price, tax_rate, line_total)
select qi.company_id, j.id, qi.item_id, qi.sort_order, qi.description, qi.quantity, qi.unit, qi.unit_price, qi.tax_rate, qi.line_total
from jobs j
join quote_items qi on qi.quote_id = j.quote_id
where j.quote_id is not null
  and not exists (select 1 from job_items existing where existing.job_id = j.id);

-- ──────────────────────────────────────────────────────────────
-- DONE.
-- ──────────────────────────────────────────────────────────────
