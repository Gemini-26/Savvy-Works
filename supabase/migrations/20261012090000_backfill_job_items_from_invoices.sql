-- ============================================================
-- Backfill job Materials from invoices
--
-- A charge added on the spot by a technician ("Add Charge & Generate Link")
-- used to be written to the invoice only, so the job's Materials tab stayed
-- empty even though the invoice billed for it. The app now writes both; this
-- brings the jobs that were already in that state in line.
--
-- INSERT-ONLY and idempotent: it only touches jobs that have NO Materials at
-- all, copies the lines of that job's first invoice, and changes no invoice.
-- Re-running it does nothing once the jobs have Materials.
-- ============================================================

insert into job_items (company_id, job_id, item_id, sort_order, description, quantity, unit, unit_price, tax_rate, line_total)
select ii.company_id, i.job_id, ii.item_id, ii.sort_order, ii.description, ii.quantity, ii.unit, ii.unit_price, ii.tax_rate, ii.line_total
from invoices i
join invoice_items ii on ii.invoice_id = i.id
where i.job_id is not null
  and i.id = (select first_inv.id from invoices first_inv where first_inv.job_id = i.job_id order by first_inv.created_at asc limit 1)
  and not exists (select 1 from job_items existing where existing.job_id = i.job_id);
