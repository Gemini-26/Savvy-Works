-- ============================================================
-- Profile pictures.
--
-- `profiles.avatar_url` has existed since the planner schema but nothing ever
-- filled it in. This adds the place the pictures live and the rules around it:
--
--   * A public storage bucket `avatars`, path  {company_id}/{profile_id}/{file}.
--     Public so the little circles that appear all over the app (lists, the
--     planner, the header) are plain image links with no signing step. File
--     names are random, so a link can't be guessed, and nothing but a picture of
--     at most 2 MB can be stored.
--   * Only the person themself (or an admin) can add or remove files in their
--     folder.
--   * A guard on `profiles.avatar_url`: you can only change your own picture
--     (admins: anyone's), and it must point at a file in that profile's own
--     folder, so the column can't be used to display some other URL or someone
--     else's photo.
--
-- Changes to the column are picked up by the existing profile audit trigger.
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 1. BUCKET
-- ──────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public             = true,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Public links are served without these. They are what lets the app list and
-- delete a person's old pictures (a delete has to be able to see the row).
drop policy if exists "avatars_storage_select" on storage.objects;
create policy "avatars_storage_select"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = get_my_company_id()::text
  );

drop policy if exists "avatars_storage_insert" on storage.objects;
create policy "avatars_storage_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = get_my_company_id()::text
    and (
      get_my_role() = 'admin'
      or (storage.foldername(name))[2] = get_my_profile_id()::text
    )
  );

drop policy if exists "avatars_storage_delete" on storage.objects;
create policy "avatars_storage_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = get_my_company_id()::text
    and (
      get_my_role() = 'admin'
      or (storage.foldername(name))[2] = get_my_profile_id()::text
    )
  );


-- ──────────────────────────────────────────────────────────────
-- 2. GUARD ON profiles.avatar_url
-- ──────────────────────────────────────────────────────────────
create or replace function guard_profile_avatar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Saving a form that leaves the picture alone is none of our business.
  if new.avatar_url is not distinct from old.avatar_url then
    return new;
  end if;

  -- No signed-in person (the SQL editor, a migration, our own server code).
  if auth.uid() is null then
    return new;
  end if;

  -- Written so a missing role or a profile with no login attached counts as
  -- "no", rather than as NULL (which an IF would silently treat as "go ahead").
  if not (
    coalesce(get_my_role(), '') = 'admin'
    or old.auth_user_id is not distinct from auth.uid()
  ) then
    raise exception 'You can only change your own profile picture.'
      using errcode = '42501';
  end if;

  -- A picture is either cleared or one of this profile's own uploaded files.
  if new.avatar_url is not null
     and position(('/avatars/' || new.company_id::text || '/' || new.id::text || '/') in new.avatar_url) = 0 then
    raise exception 'That is not a picture uploaded for this profile.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_guard_avatar on profiles;
create trigger profiles_guard_avatar
  before update of avatar_url on profiles
  for each row execute function guard_profile_avatar();
