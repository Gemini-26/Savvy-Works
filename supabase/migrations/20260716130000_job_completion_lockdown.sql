-- ──────────────────────────────────────────────────────────────
-- JOB COMPLETION LOCKDOWN — the "jobs_company_isolation" policy
-- (003) allows ANY user in the company to update ANY job, which
-- meant a technician could complete/sign off a job they weren't
-- assigned to. Sign-off is meant to be a trustworthy record of who
-- actually did the work, so this closes that gap at the RLS layer
-- (the real enforcement boundary — the JS layer can't be trusted).
-- ──────────────────────────────────────────────────────────────

create or replace function get_my_role()
returns text
language sql
stable
security definer
as $$
  select role
  from   profiles
  where  auth_user_id = auth.uid()
  limit  1;
$$;

create or replace function is_assigned_to_job(p_job_id uuid)
returns boolean
language sql
stable
security definer
as $$
  select exists (
    select 1
    from appointment_assignments aa
    join appointments ap on ap.id = aa.appointment_id
    join profiles pr     on pr.id = aa.technician_id
    where ap.job_id = p_job_id
      and pr.auth_user_id = auth.uid()
  );
$$;

-- Split the old blanket "for all" policy so UPDATE gets a tighter check.
-- SELECT/INSERT/DELETE stay company-scoped exactly as before.
drop policy if exists "jobs_company_isolation" on jobs;

create policy "jobs_select_company"
  on jobs for select
  using (company_id = get_my_company_id());

create policy "jobs_insert_company"
  on jobs for insert
  with check (company_id = get_my_company_id());

create policy "jobs_delete_company"
  on jobs for delete
  using (company_id = get_my_company_id());

create policy "jobs_update_company"
  on jobs for update
  using (
    company_id = get_my_company_id()
    and (get_my_role() = 'admin' or is_assigned_to_job(id))
  )
  with check (
    company_id = get_my_company_id()
    and (get_my_role() = 'admin' or is_assigned_to_job(id))
  );

-- ──────────────────────────────────────────────────────────────
-- DONE.
-- ──────────────────────────────────────────────────────────────
