-- ──────────────────────────────────────────────────────────────
-- SECURITY FIX: work_shifts was scoped only by company_id, so any
-- technician could read/update/delete any other technician's live
-- GPS pings and clock in/out records within the same company.
-- Lock writes to the shift's own technician (or an admin), keep
-- reads company-wide for the "Live Users" admin dashboard.
-- ──────────────────────────────────────────────────────────────
drop policy if exists "work_shifts_company_isolation" on work_shifts;

create policy "work_shifts_select_company"
  on work_shifts for select
  using (company_id = get_my_company_id());

create policy "work_shifts_insert_own"
  on work_shifts for insert
  with check (
    company_id = get_my_company_id()
    and technician_id = (select id from profiles where auth_user_id = auth.uid())
  );

create policy "work_shifts_update_own_or_admin"
  on work_shifts for update
  using (
    company_id = get_my_company_id()
    and (
      technician_id = (select id from profiles where auth_user_id = auth.uid())
      or get_my_role() = 'admin'
    )
  )
  with check (
    company_id = get_my_company_id()
    and (
      technician_id = (select id from profiles where auth_user_id = auth.uid())
      or get_my_role() = 'admin'
    )
  );

create policy "work_shifts_delete_admin"
  on work_shifts for delete
  using (
    company_id = get_my_company_id()
    and get_my_role() = 'admin'
  );
