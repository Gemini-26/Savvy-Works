-- ============================================================
-- Deactivating a profile now locks that person's login.
--
-- Until now `is_active = false` only hid someone from the lists; their login
-- kept working. This trigger makes the flag real:
--   * deactivate -> the login is banned (sign-in is refused, existing sessions
--     cannot refresh) and every open session is revoked;
--   * reactivate -> the ban is lifted.
-- It lives on the table, so it applies however the flag is changed (the app,
-- the API, or the SQL editor).
--
-- It does NOT lock anyone out retroactively: profiles that are already
-- inactive keep their working login until they are reactivated and
-- deactivated again, or locked by hand. That is a deliberate, separate step.
-- ============================================================

create or replace function sync_profile_login_lock()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
begin
  if NEW.auth_user_id is null then
    return NEW;   -- nothing to lock
  end if;

  if not NEW.is_active then
    -- Two safety rails so deactivating can never lock the company out of itself.
    if v_uid is not null and NEW.auth_user_id = v_uid then
      raise exception 'You cannot deactivate your own account.';
    end if;

    if NEW.role = 'admin'
       and not exists (
         select 1 from profiles p
          where p.company_id is not distinct from NEW.company_id
            and p.role = 'admin'
            and p.is_active
            and p.id <> NEW.id
       ) then
      raise exception 'You cannot deactivate the last active admin.';
    end if;

    update auth.users
       set banned_until = now() + interval '100 years'
     where id = NEW.auth_user_id;

    -- Revoke open sessions; their refresh tokens go with them.
    delete from auth.sessions where user_id = NEW.auth_user_id;
  else
    update auth.users set banned_until = null where id = NEW.auth_user_id;
  end if;

  return NEW;
end;
$$;

drop trigger if exists profiles_sync_login_lock on profiles;
create trigger profiles_sync_login_lock
  after update of is_active on profiles
  for each row
  when (OLD.is_active is distinct from NEW.is_active)
  execute function sync_profile_login_lock();

-- A profile created already-inactive is locked from the start.
drop trigger if exists profiles_sync_login_lock_insert on profiles;
create trigger profiles_sync_login_lock_insert
  after insert on profiles
  for each row
  when (NEW.is_active is false)
  execute function sync_profile_login_lock();
