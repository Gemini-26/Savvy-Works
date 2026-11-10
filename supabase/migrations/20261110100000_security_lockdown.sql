-- Security lockdown, 2026-11-10 (from the 2026-11-09 security audit)
--
-- Closes three holes that were live on production:
--   C1/C2  Leftover "let everyone through" rules on customers, jobs, leads,
--          customer_contacts and customer_activity_log. They let anybody on the
--          internet READ every customer, job and lead with no login, and let any
--          logged-in account (including a stranger who signed up) edit or delete
--          them. The company-scoped rules that already sit beside them are the
--          ones the app really uses, so the open ones simply go.
--   C3     profiles had one rule saying "anyone in the company may change any
--          profile", with nothing protecting the role column, so a technician
--          could make themselves an admin. Profiles are now readable by the
--          company, but only admins may add or delete them, and only admins may
--          change a role, company, email, login link or active status.
--   H4     next_document_number() could be called by anyone, for any company, and
--          would bump that company's invoice/quote/PO numbers. It now needs a
--          signed-in member of the same company.
--
-- Nothing here changes what admins or technicians can do in the app today
-- (apart from the bits above that were never meant to be possible).

-- ── 0. The one job with no company ───────────────────────────────────────────
-- JB-2026-80053 ("Geyser not working") has no company_id, so it is only visible
-- today because of the open read rule being removed below. Give it its
-- customer's company so it stays visible to staff.
update public.jobs j
   set company_id = c.company_id
  from public.customers c
 where j.company_id is null
   and c.id = j.customer_id
   and c.company_id is not null;

-- ── 1. Remove the open rules ─────────────────────────────────────────────────
drop policy if exists "Authenticated users can delete customers" on public.customers;
drop policy if exists "Allow authenticated insert"               on public.customers;
drop policy if exists "Authenticated users can insert customers" on public.customers;
drop policy if exists "Authenticated users can read customers"   on public.customers;
drop policy if exists "Enable read access for all users"         on public.customers;
drop policy if exists "Authenticated users can update customers" on public.customers;

drop policy if exists "Authenticated users can delete jobs"      on public.jobs;
drop policy if exists "Authenticated users can insert jobs"      on public.jobs;
drop policy if exists "Enable insert for authenticated users only" on public.jobs;
drop policy if exists "Enable read access for all users"         on public.jobs;
drop policy if exists "Authenticated users can update jobs"      on public.jobs;

drop policy if exists "Enable insert for authenticated users only" on public.leads;
drop policy if exists "Enable read access for all users"         on public.leads;

drop policy if exists "Authenticated write contacts"             on public.customer_contacts;
drop policy if exists "Authenticated read contacts"              on public.customer_contacts;

drop policy if exists "Authenticated write activity"             on public.customer_activity_log;
drop policy if exists "Authenticated read activity"              on public.customer_activity_log;

-- customer_activity_log has no company column and, unlike the other tables, no
-- company rule at all (only the open ones just removed). Scope it through the
-- customer it belongs to. It is empty and unused today; this keeps it usable.
create policy customer_activity_log_company_select on public.customer_activity_log
  for select to authenticated
  using (exists (
    select 1 from public.customers c
     where c.id = customer_activity_log.customer_id
       and c.company_id = get_my_company_id()
  ));

create policy customer_activity_log_company_insert on public.customer_activity_log
  for insert to authenticated
  with check (exists (
    select 1 from public.customers c
     where c.id = customer_activity_log.customer_id
       and c.company_id = get_my_company_id()
  ));

-- ── 2. profiles: no more promoting yourself ──────────────────────────────────
drop policy if exists profiles_company_isolation on public.profiles;

create policy profiles_select_company on public.profiles
  for select to authenticated
  using (company_id = get_my_company_id());

-- Profiles are created by the create-user edge function (service key, bypasses
-- these rules); nothing in the app inserts them directly.
create policy profiles_insert_admin on public.profiles
  for insert to authenticated
  with check (company_id = get_my_company_id() and get_my_role() = 'admin');

-- Admins edit anyone in the company; everyone else only their own row (their
-- picture, phone etc.). The trigger below stops them touching the sensitive columns.
create policy profiles_update_admin_or_self on public.profiles
  for update to authenticated
  using      (company_id = get_my_company_id() and (get_my_role() = 'admin' or auth_user_id = auth.uid()))
  with check (company_id = get_my_company_id() and (get_my_role() = 'admin' or auth_user_id = auth.uid()));

create policy profiles_delete_admin on public.profiles
  for delete to authenticated
  using (company_id = get_my_company_id() and get_my_role() = 'admin');

create or replace function public.guard_profile_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- No signed-in person (SQL editor, migrations, our own server code).
  if auth.uid() is null then
    return new;
  end if;

  -- Admins may change anything. (Deactivating someone, and the "last admin"
  -- safety, are handled by sync_profile_login_lock.)
  if coalesce(get_my_role(), '') = 'admin' then
    return new;
  end if;

  if new.role         is distinct from old.role
  or new.company_id   is distinct from old.company_id
  or new.is_active    is distinct from old.is_active
  or new.auth_user_id is distinct from old.auth_user_id
  or new.email        is distinct from old.email then
    raise exception 'Only an admin can change a role, company, email, login link or active status.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_guard_privileged on public.profiles;
create trigger profiles_guard_privileged
  before update on public.profiles
  for each row execute function public.guard_profile_privileged_columns();

-- ── 3. next_document_number: signed-in, own company only ─────────────────────
create or replace function public.next_document_number(p_company_id uuid, p_doc_type text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next   integer;
  v_prefix text;
begin
  -- A signed-in person can only take numbers for their own company. (Server
  -- code and the SQL editor have no signed-in person and are not restricted.)
  if auth.uid() is not null and p_company_id is distinct from get_my_company_id() then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;

  -- Known kinds are short lowercase words (invoice, quote, job, po, lead...).
  if p_doc_type is null or p_doc_type !~ '^[a-z_]{1,30}$' then
    raise exception 'Unknown document type.' using errcode = '22023';
  end if;

  insert into document_counters (company_id, doc_type, last_number)
    values (p_company_id, p_doc_type, 1)
  on conflict (company_id, doc_type)
    do update set last_number = document_counters.last_number + 1
  returning last_number into v_next;

  v_prefix := case p_doc_type
    when 'quote'   then 'Q'
    when 'job'     then 'J'
    when 'invoice' then 'INV'
    when 'lead'    then 'LD'
    else upper(p_doc_type)
  end;

  return v_prefix || '-' || lpad(v_next::text, 5, '0');
end;
$$;

revoke execute on function public.next_document_number(uuid, text) from public, anon;
grant  execute on function public.next_document_number(uuid, text) to authenticated, service_role;

-- ── 4. Self-check: if anything above did not land, undo the whole migration ──
do $$
declare
  v_open int;
  v_prof int;
begin
  select count(*) into v_open
    from pg_policies
   where schemaname = 'public'
     and tablename in ('customers', 'jobs', 'leads', 'customer_contacts', 'customer_activity_log')
     and (
          trim(both '()' from coalesce(qual, ''))       in ('true', 'auth.role() = ''authenticated''::text')
       or trim(both '()' from coalesce(with_check, '')) in ('true', 'auth.role() = ''authenticated''::text')
     );
  if v_open > 0 then
    raise exception 'Security lockdown incomplete: % open policies still exist', v_open;
  end if;

  select count(*) into v_prof from pg_policies where schemaname = 'public' and tablename = 'profiles';
  if v_prof <> 4 then
    raise exception 'Security lockdown incomplete: profiles should have 4 policies, found %', v_prof;
  end if;

  if has_function_privilege('anon', 'public.next_document_number(uuid, text)', 'EXECUTE') then
    raise exception 'Security lockdown incomplete: anon can still run next_document_number';
  end if;

  if exists (select 1 from public.jobs where company_id is null) then
    raise exception 'Security lockdown incomplete: a job still has no company';
  end if;
end;
$$;
