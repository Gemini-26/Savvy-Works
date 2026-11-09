-- ============================================================
-- Profile audit log: who created, edited, deactivated or deleted a profile.
--
-- Before this, deleting or editing a profile left no record of who did it, and
-- a delete also cascaded away that person's own history. This table is written
-- by a trigger on `profiles`, so it catches every route: the app, a direct API
-- call, the edge function that creates users, or the Supabase SQL editor.
-- ============================================================

create table if not exists profile_audit_log (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid,
  action        text not null
                check (action in ('created', 'updated', 'deleted', 'deactivated', 'reactivated')),

  -- The profile that was touched. Deliberately NOT foreign keys: the whole
  -- point is that these rows survive after the profile is deleted.
  profile_id    uuid not null,
  profile_name  text,
  profile_email text,

  -- updated / deactivated / reactivated: { column: { "from": old, "to": new } }
  -- created / deleted: the full row as it was.
  changes       jsonb,

  -- Who did it (also not foreign keys, for the same reason).
  actor_id      uuid,
  actor_name    text,
  actor_email   text,
  -- user     = a signed-in person (through the app or the API)
  -- server   = our own server code, no person attached
  -- database = the SQL editor / a migration, no sign-in at all
  via           text not null default 'user' check (via in ('user', 'server', 'database')),

  created_at    timestamptz not null default now()
);

create index if not exists profile_audit_log_company_created_idx
  on profile_audit_log (company_id, created_at desc);
create index if not exists profile_audit_log_profile_idx
  on profile_audit_log (profile_id, created_at desc);

-- Admins of the company can read it. Nobody can write it from the app: with no
-- insert/update/delete policy the rows can only be added by the trigger below.
alter table profile_audit_log enable row level security;

drop policy if exists "profile_audit_log_admin_read" on profile_audit_log;
create policy "profile_audit_log_admin_read" on profile_audit_log
  for select to authenticated
  using (company_id = get_my_company_id() and get_my_role() = 'admin');

revoke insert, update, delete, truncate on profile_audit_log from anon, authenticated;


-- ------------------------------------------------------------
-- The trigger
-- ------------------------------------------------------------
create or replace function log_profile_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid        uuid := auth.uid();
  v_actor_auth uuid;
  v_via        text;
  v_hdr        text;
  v_actor_id   uuid;
  v_actor_name text;
  v_actor_mail text;
  v_subject    profiles;
  v_action     text;
  v_changes    jsonb;
begin
  -- The profile this change is about (OLD does not exist on an insert).
  if TG_OP = 'DELETE' then v_subject := OLD; else v_subject := NEW; end if;

  -- Who is acting. A signed-in person is identified by their own token. Our
  -- create-user edge function runs with the service key (no person), so it
  -- passes the admin's id in a header; that header is only believed when the
  -- request really carries the service key, so nobody can forge it.
  v_actor_auth := v_uid;
  if v_actor_auth is null and auth.role() = 'service_role' then
    begin
      v_hdr := nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-acting-user-id';
      v_actor_auth := v_hdr::uuid;
    exception when others then
      v_actor_auth := null;
    end;
  end if;

  v_via := case
    when v_actor_auth is not null then 'user'
    when auth.role() = 'service_role' then 'server'
    else 'database'
  end;

  if v_actor_auth is not null then
    select p.id, p.full_name, p.email
      into v_actor_id, v_actor_name, v_actor_mail
      from profiles p
     where p.auth_user_id = v_actor_auth
     limit 1;

    -- Deleting your own profile: it is already gone from the table by now.
    if v_actor_id is null and TG_OP = 'DELETE' and OLD.auth_user_id = v_actor_auth then
      v_actor_id := OLD.id; v_actor_name := OLD.full_name; v_actor_mail := OLD.email;
    end if;

    -- A login with no profile (these exist) is still worth naming.
    if v_actor_mail is null then
      select u.email into v_actor_mail from auth.users u where u.id = v_actor_auth;
    end if;
  end if;

  if TG_OP = 'INSERT' then
    v_action  := 'created';
    v_changes := to_jsonb(NEW);

  elsif TG_OP = 'DELETE' then
    v_action  := 'deleted';
    v_changes := to_jsonb(OLD);

  else
    select jsonb_object_agg(n.key, jsonb_build_object('from', o.value, 'to', n.value))
      into v_changes
      from jsonb_each(to_jsonb(NEW)) n
      join jsonb_each(to_jsonb(OLD)) o on o.key = n.key
     where n.value is distinct from o.value;

    -- Saving the edit form without changing anything is not worth a row.
    if v_changes is null then
      return v_subject;
    end if;

    v_action := case
      when (select count(*) from jsonb_object_keys(v_changes)) = 1 and v_changes ? 'is_active' then
        case when NEW.is_active then 'reactivated' else 'deactivated' end
      else 'updated'
    end;
  end if;

  insert into profile_audit_log
    (company_id, action, profile_id, profile_name, profile_email, changes,
     actor_id, actor_name, actor_email, via)
  values
    (v_subject.company_id, v_action, v_subject.id, v_subject.full_name, v_subject.email, v_changes,
     v_actor_id, v_actor_name, v_actor_mail, v_via);

  return v_subject;

exception when others then
  -- A problem writing the log must never stop someone being added or edited.
  raise warning 'profile_audit_log: could not record % on profile %: %', TG_OP, v_subject.id, sqlerrm;
  return v_subject;
end;
$$;

drop trigger if exists profiles_audit_log on profiles;
create trigger profiles_audit_log
  after insert or update or delete on profiles
  for each row execute function log_profile_change();
