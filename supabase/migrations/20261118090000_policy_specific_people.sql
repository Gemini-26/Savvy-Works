-- ──────────────────────────────────────────────────────────────
-- POLICIES — choose specific people, including team members
--
-- Until now a document was for "everyone", "admins" or "technicians". This adds
-- a fourth choice, "specific people": an admin ticks exactly which logged-in
-- people (technicians, admins…) and which team members have to sign it.
--
-- Team members (the helpers) have no login, so they cannot open the app and
-- sign for themselves. Two ways to get their signature, both stored as an
-- ordinary signature row (same frozen wording, fingerprint, drawn signature):
--
--   in person   an admin or technician opens the document on their own phone,
--               hands it over, the team member reads and signs with a finger.
--               The row says who handed the phone over (recorded_by).
--   by link     an admin creates a one-off link for that team member and sends
--               it (WhatsApp…). The link opens just that document, no login.
--
-- What changes:
--   policy_documents.audience               + 'specific'
--   policy_documents.audience_profile_ids   who (logins) when audience = 'specific'
--   policy_documents.audience_team_member_ids   who (team members), same
--   policy_signatures.team_member_id / signing_method / recorded_by(_name)
--   policy_sign_links                       the one-off links (token stored only as a hash)
--   sign_policy_document()                  understands 'specific'
--   sign_policy_for_team_member()           in-person signing (admin / technician)
--   create_policy_sign_link()               admin makes a link
--   get_policy_by_link() / sign_policy_by_link()   the link page, no login needed
--   team_policy_status()                    which team members still owe a signature
--   publish_policy_document()               takes the chosen people
-- ──────────────────────────────────────────────────────────────

-- ── 1. Who a document is for ─────────────────────────────────

alter table policy_documents drop constraint if exists policy_documents_audience_check;
alter table policy_documents add constraint policy_documents_audience_check
  check (audience in ('all', 'admin', 'technician', 'specific'));

alter table policy_documents add column if not exists audience_profile_ids     uuid[] not null default '{}';
alter table policy_documents add column if not exists audience_team_member_ids uuid[] not null default '{}';

-- "Specific" needs at least one person, and nobody is listed on any other audience.
alter table policy_documents drop constraint if exists policy_documents_specific_people;
alter table policy_documents add constraint policy_documents_specific_people check (
  (audience = 'specific') = (cardinality(audience_profile_ids) + cardinality(audience_team_member_ids) > 0)
);

-- Admins see every document; everyone else sees what applies to them. A document
-- for specific people is visible to the logins listed on it. Technicians can also
-- open documents that list team members, because they are the ones handing their
-- phone over to get a team member's signature.
drop policy if exists "policy_documents_select" on policy_documents;
create policy "policy_documents_select"
  on policy_documents for select
  using (
    company_id = get_my_company_id()
    and (
      get_my_role() = 'admin'
      or audience = 'all'
      or audience = get_my_role()
      or (
        audience = 'specific'
        and (
          get_my_profile_id() = any(audience_profile_ids)
          or (get_my_role() = 'technician' and cardinality(audience_team_member_ids) > 0)
        )
      )
    )
  );

-- ── 2. Signatures from team members ──────────────────────────

alter table policy_signatures add column if not exists team_member_id   uuid references team_members(id) on delete set null;
alter table policy_signatures add column if not exists signing_method   text not null default 'self';
alter table policy_signatures add column if not exists recorded_by      uuid references profiles(id) on delete set null;
alter table policy_signatures add column if not exists recorded_by_name text;

alter table policy_signatures drop constraint if exists policy_signatures_signing_method_check;
alter table policy_signatures add constraint policy_signatures_signing_method_check
  check (signing_method in ('self', 'in_person', 'link'));

-- A signature belongs to a login or to a team member, never both.
alter table policy_signatures drop constraint if exists policy_signatures_one_signer;
alter table policy_signatures add constraint policy_signatures_one_signer
  check (profile_id is null or team_member_id is null);

create unique index if not exists policy_signatures_document_team_member_key
  on policy_signatures (document_id, team_member_id) where team_member_id is not null;
create index if not exists policy_signatures_team_member_id_idx on policy_signatures (team_member_id);

-- ── 3. One-off signing links ─────────────────────────────────

create table if not exists policy_sign_links (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid references companies(id) on delete cascade,
  document_id    uuid not null references policy_documents(id) on delete cascade,
  team_member_id uuid not null references team_members(id) on delete cascade,
  -- SHA-256 of the secret in the link. The secret itself is never stored, so a
  -- copy of this table cannot be turned back into working links.
  token_hash     text not null unique,
  expires_at     timestamptz not null,
  used_at        timestamptz,
  created_by     uuid references profiles(id) on delete set null,
  created_at     timestamptz not null default now()
);

create index if not exists policy_sign_links_document_idx on policy_sign_links (document_id, team_member_id);

-- Nobody reads or writes this table directly: RLS is on and there are no
-- policies. Links are made and used only through the functions below.
alter table policy_sign_links enable row level security;
revoke all on policy_sign_links from anon, authenticated;

-- ── 4. Writing a signature (shared by every way of signing) ──

-- Internal: not callable from the API. Every public function below does its own
-- "who is allowed" checks, then hands over to this, so the checks on the
-- signature itself (agreed, drawn, size, answers) live in one place.
create or replace function policy_store_signature(
  p_doc              policy_documents,
  p_profile_id       uuid,
  p_team_member_id   uuid,
  p_signer_name      text,
  p_signer_role      text,
  p_signature        text,
  p_agreed           boolean,
  p_user_agent       text,
  p_answers          jsonb,
  p_method           text,
  p_recorded_by      uuid,
  p_recorded_by_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id      uuid;
  v_ip      text;
  v_answers jsonb;
begin
  if p_doc.status <> 'active' then
    raise exception 'This document is no longer open for signing. Go back and open the current version.';
  end if;
  if not coalesce(p_agreed, false) then
    raise exception 'Tick "I understand and agree" before signing.';
  end if;
  if p_signature is null
     or length(p_signature) < 500
     or length(p_signature) > 700000
     or p_signature !~ '^data:image/png;base64,[A-Za-z0-9+/=]+$' then
    raise exception 'Draw your signature before signing.';
  end if;

  -- What was typed on the blank lines. Only the shape and size are checked here
  -- (the app knows which lines a document has); each answer is trimmed and the
  -- result rebuilt so nothing else can ride along.
  if p_answers is not null and p_answers <> 'null'::jsonb then
    if jsonb_typeof(p_answers) <> 'array' or jsonb_array_length(p_answers) > 60 then
      raise exception 'Your answers could not be saved. Reload the page and try again.';
    end if;
    if exists (
      select 1 from jsonb_array_elements(p_answers) a
      where jsonb_typeof(a) <> 'object'
         or jsonb_typeof(a -> 'label') is distinct from 'string'
         or jsonb_typeof(a -> 'value') is distinct from 'string'
         or length(a ->> 'label') > 120
         or length(a ->> 'value') > 300
    ) then
      raise exception 'Your answers could not be saved. Reload the page and try again.';
    end if;
    select jsonb_agg(jsonb_build_object(
             'n',     case when (a ->> 'n') ~ '^[0-9]{1,3}$' then (a ->> 'n')::int end,
             'label', btrim(a ->> 'label'),
             'value', btrim(a ->> 'value')
           ) order by ord)
      into v_answers
      from jsonb_array_elements(p_answers) with ordinality as t(a, ord)
      where btrim(a ->> 'value') <> '';
  end if;

  -- Supabase's API passes the caller's address along in the request headers.
  begin
    v_ip := nullif(btrim(split_part(coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''), ',', 1)), '');
  exception when others then
    v_ip := null;
  end;

  begin
    insert into policy_signatures (
      company_id, document_id, profile_id, team_member_id, signer_name, signer_role, signature_image, statement,
      document_title, document_version, content_hash, ip_address, user_agent, field_answers,
      signing_method, recorded_by, recorded_by_name
    ) values (
      p_doc.company_id, p_doc.id, p_profile_id, p_team_member_id, p_signer_name, p_signer_role, p_signature,
      'I have read and understood this document and I agree to follow it.',
      p_doc.title, p_doc.version, p_doc.content_hash, v_ip, left(p_user_agent, 300), v_answers,
      p_method, p_recorded_by, p_recorded_by_name
    )
    returning id into v_id;
  exception when unique_violation then
    if p_team_member_id is null then
      raise exception 'You have already signed this document.';
    end if;
    raise exception 'This document has already been signed for %.', p_signer_name;
  end;

  return v_id;
end;
$$;

revoke all on function policy_store_signature(policy_documents, uuid, uuid, text, text, text, boolean, text, jsonb, text, uuid, text)
  from public, anon, authenticated;

-- ── 5. A logged-in person signs for themselves ───────────────

create or replace function sign_policy_document(
  p_document_id uuid,
  p_signature   text,
  p_agreed      boolean,
  p_user_agent  text default null,
  p_answers     jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile profiles%rowtype;
  v_doc     policy_documents%rowtype;
begin
  select * into v_profile from profiles where auth_user_id = auth.uid() and is_active;
  if not found then
    raise exception 'You need to be signed in to sign a document.';
  end if;

  select * into v_doc from policy_documents where id = p_document_id and company_id = v_profile.company_id;
  if not found then
    raise exception 'Document not found.';
  end if;
  if not (
       v_doc.audience = 'all'
    or v_doc.audience = v_profile.role
    or (v_doc.audience = 'specific' and v_profile.id = any(v_doc.audience_profile_ids))
  ) then
    raise exception 'This document is not assigned to you.';
  end if;

  return policy_store_signature(
    v_doc, v_profile.id, null, v_profile.full_name, v_profile.role,
    p_signature, p_agreed, p_user_agent, p_answers, 'self', null, null
  );
end;
$$;

revoke all on function sign_policy_document(uuid, text, boolean, text, jsonb) from public, anon;
grant execute on function sign_policy_document(uuid, text, boolean, text, jsonb) to authenticated;

-- ── 6. In person: an admin or technician hands their phone over ──

create or replace function sign_policy_for_team_member(
  p_document_id    uuid,
  p_team_member_id uuid,
  p_signature      text,
  p_agreed         boolean,
  p_user_agent     text default null,
  p_answers        jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me  profiles%rowtype;
  v_doc policy_documents%rowtype;
  v_tm  team_members%rowtype;
begin
  select * into v_me from profiles where auth_user_id = auth.uid() and is_active;
  if not found then
    raise exception 'You need to be signed in to record a signature.';
  end if;
  if v_me.role not in ('admin', 'technician') then
    raise exception 'Only an admin or a technician can record a signature for a team member.';
  end if;

  select * into v_doc from policy_documents where id = p_document_id and company_id = v_me.company_id;
  if not found then
    raise exception 'Document not found.';
  end if;
  select * into v_tm from team_members where id = p_team_member_id and company_id = v_me.company_id;
  if not found then
    raise exception 'Team member not found.';
  end if;
  if v_doc.audience <> 'specific' or not (v_tm.id = any(v_doc.audience_team_member_ids)) then
    raise exception 'This document is not assigned to %.', v_tm.full_name;
  end if;

  return policy_store_signature(
    v_doc, null, v_tm.id, v_tm.full_name, 'team member',
    p_signature, p_agreed, p_user_agent, p_answers, 'in_person', v_me.id, v_me.full_name
  );
end;
$$;

revoke all on function sign_policy_for_team_member(uuid, uuid, text, boolean, text, jsonb) from public, anon;
grant execute on function sign_policy_for_team_member(uuid, uuid, text, boolean, text, jsonb) to authenticated;

-- ── 7. By link ───────────────────────────────────────────────

-- Admin makes a link for one team member and one document. The secret is
-- returned once, here, and never stored. Making a new link for the same pair
-- cancels the one before it.
create or replace function create_policy_sign_link(
  p_document_id    uuid,
  p_team_member_id uuid,
  p_days           integer default 14
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me      profiles%rowtype;
  v_doc     policy_documents%rowtype;
  v_tm      team_members%rowtype;
  v_token   text;
  v_expires timestamptz;
begin
  select * into v_me from profiles where auth_user_id = auth.uid() and is_active;
  if not found or v_me.role <> 'admin' then
    raise exception 'Only an admin can create a signing link.';
  end if;

  select * into v_doc from policy_documents where id = p_document_id and company_id = v_me.company_id;
  if not found then
    raise exception 'Document not found.';
  end if;
  select * into v_tm from team_members where id = p_team_member_id and company_id = v_me.company_id;
  if not found then
    raise exception 'Team member not found.';
  end if;
  if v_doc.status <> 'active' then
    raise exception 'This document is not open for signing.';
  end if;
  if v_doc.audience <> 'specific' or not (v_tm.id = any(v_doc.audience_team_member_ids)) then
    raise exception 'This document is not assigned to %.', v_tm.full_name;
  end if;
  if exists (select 1 from policy_signatures where document_id = v_doc.id and team_member_id = v_tm.id) then
    raise exception '% has already signed this document.', v_tm.full_name;
  end if;

  delete from policy_sign_links
   where document_id = v_doc.id and team_member_id = v_tm.id and used_at is null;

  -- Two random UUIDs back to back: about 240 bits from the database's own
  -- strong random source. Not guessable.
  v_token   := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  v_expires := now() + make_interval(days => least(greatest(coalesce(p_days, 14), 1), 60));

  insert into policy_sign_links (company_id, document_id, team_member_id, token_hash, expires_at, created_by)
  values (v_me.company_id, v_doc.id, v_tm.id, encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), v_expires, v_me.id);

  return jsonb_build_object(
    'token', v_token,
    'expires_at', v_expires,
    'team_member_name', v_tm.full_name,
    'team_member_phone', v_tm.phone,
    'document_title', v_doc.title
  );
end;
$$;

revoke all on function create_policy_sign_link(uuid, uuid, integer) from public, anon;
grant execute on function create_policy_sign_link(uuid, uuid, integer) to authenticated;

-- The link page asks for the document. Callable without a login: the secret in
-- the link is the whole proof, so every failure gives the same few plain
-- messages and says nothing about which part was wrong.
create or replace function get_policy_by_link(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link   policy_sign_links%rowtype;
  v_doc    policy_documents%rowtype;
  v_tm     team_members%rowtype;
  v_signed timestamptz;
begin
  select * into v_link from policy_sign_links
   where token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex');
  if not found then
    raise exception 'This signing link is not valid. Ask the office to send you a new one.';
  end if;

  select * into v_doc from policy_documents where id = v_link.document_id;
  select * into v_tm  from team_members     where id = v_link.team_member_id;
  if v_doc.id is null or v_tm.id is null
     or v_doc.audience <> 'specific' or not (v_tm.id = any(v_doc.audience_team_member_ids)) then
    raise exception 'This signing link is not valid. Ask the office to send you a new one.';
  end if;

  select s.signed_at into v_signed from policy_signatures s
   where s.document_id = v_doc.id and s.team_member_id = v_tm.id;
  if v_signed is not null then
    return jsonb_build_object('state', 'signed', 'signer_name', v_tm.full_name, 'document_title', v_doc.title, 'signed_at', v_signed);
  end if;

  if v_link.expires_at < now() then
    raise exception 'This signing link has expired. Ask the office to send you a new one.';
  end if;
  if v_doc.status <> 'active' then
    raise exception 'This document is no longer open for signing. Ask the office to send you the current one.';
  end if;

  return jsonb_build_object(
    'state', 'open',
    'signer_name', v_tm.full_name,
    'expires_at', v_link.expires_at,
    'document', jsonb_build_object(
      'id', v_doc.id,
      'title', v_doc.title,
      'description', v_doc.description,
      'version', v_doc.version,
      'created_at', v_doc.created_at,
      'content_html', v_doc.content_html,
      'fill_fields', v_doc.fill_fields
    )
  );
end;
$$;

-- …and signs it.
create or replace function sign_policy_by_link(
  p_token      text,
  p_signature  text,
  p_agreed     boolean,
  p_user_agent text default null,
  p_answers    jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link policy_sign_links%rowtype;
  v_doc  policy_documents%rowtype;
  v_tm   team_members%rowtype;
  v_id   uuid;
begin
  select * into v_link from policy_sign_links
   where token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
   for update;
  if not found then
    raise exception 'This signing link is not valid. Ask the office to send you a new one.';
  end if;

  select * into v_doc from policy_documents where id = v_link.document_id;
  select * into v_tm  from team_members     where id = v_link.team_member_id;
  if v_doc.id is null or v_tm.id is null
     or v_doc.audience <> 'specific' or not (v_tm.id = any(v_doc.audience_team_member_ids)) then
    raise exception 'This signing link is not valid. Ask the office to send you a new one.';
  end if;
  if v_link.used_at is not null
     or exists (select 1 from policy_signatures where document_id = v_doc.id and team_member_id = v_tm.id) then
    raise exception 'This document has already been signed.';
  end if;
  if v_link.expires_at < now() then
    raise exception 'This signing link has expired. Ask the office to send you a new one.';
  end if;

  v_id := policy_store_signature(
    v_doc, null, v_tm.id, v_tm.full_name, 'team member',
    p_signature, p_agreed, p_user_agent, p_answers, 'link', null, null
  );
  update policy_sign_links set used_at = now() where id = v_link.id;
  return v_id;
end;
$$;

revoke all on function get_policy_by_link(text) from public;
grant execute on function get_policy_by_link(text) to anon, authenticated;
revoke all on function sign_policy_by_link(text, text, boolean, text, jsonb) from public;
grant execute on function sign_policy_by_link(text, text, boolean, text, jsonb) to anon, authenticated;

-- ── 8. Which team members still owe a signature ──────────────

-- For admins and technicians: every active document that lists team members,
-- one row per team member, with when they signed (null = still owes it). A
-- technician cannot read other people's signatures directly, so this hands back
-- only this, not the signatures themselves.
create or replace function team_policy_status()
returns table (document_id uuid, team_member_id uuid, signed_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me profiles%rowtype;
begin
  select * into v_me from profiles where auth_user_id = auth.uid() and is_active;
  if not found or v_me.role not in ('admin', 'technician') then
    return;
  end if;

  return query
    select d.id, t.tm_id, s.signed_at
      from policy_documents d
     cross join lateral unnest(d.audience_team_member_ids) as t(tm_id)
      join team_members m on m.id = t.tm_id and m.company_id = v_me.company_id and m.is_active
      left join policy_signatures s on s.document_id = d.id and s.team_member_id = t.tm_id
     where d.company_id = v_me.company_id
       and d.status = 'active'
       and d.audience = 'specific';
end;
$$;

revoke all on function team_policy_status() from public, anon;
grant execute on function team_policy_status() to authenticated;

-- ── 9. Publishing, now with the chosen people ────────────────

-- New arguments mean a new function; the old one has to go or a call without
-- them would match both.
drop function if exists publish_policy_document(text, text, text, text, text, uuid);

-- SECURITY INVOKER: the caller's own row level security applies, so only an
-- admin gets through. Doing it here makes "supersede the old version and add
-- the new one" a single all-or-nothing step.
create or replace function publish_policy_document(
  p_title                 text,
  p_description           text,
  p_audience              text,
  p_content_html          text,
  p_source_file_name      text default null,
  p_replaces              uuid default null,
  p_audience_profiles     uuid[] default '{}',
  p_audience_team_members uuid[] default '{}'
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_old      policy_documents%rowtype;
  v_version  integer := 1;
  v_new      uuid;
  v_audience text := coalesce(p_audience, 'all');
  v_profiles uuid[] := '{}';
  v_members  uuid[] := '{}';
begin
  if btrim(coalesce(p_title, '')) = '' then
    raise exception 'Give the document a title.';
  end if;
  if btrim(coalesce(p_content_html, '')) = '' then
    raise exception 'The document is empty.';
  end if;
  if v_audience not in ('all', 'admin', 'technician', 'specific') then
    raise exception 'Choose who has to sign this document.';
  end if;

  if v_audience = 'specific' then
    v_profiles := coalesce(array(select distinct x from unnest(p_audience_profiles) as x), '{}');
    v_members  := coalesce(array(select distinct x from unnest(p_audience_team_members) as x), '{}');
    if cardinality(v_profiles) + cardinality(v_members) = 0 then
      raise exception 'Choose at least one person who has to sign this document.';
    end if;
    if (select count(*) from profiles where id = any(v_profiles) and company_id = get_my_company_id() and is_active) <> cardinality(v_profiles)
       or (select count(*) from team_members where id = any(v_members) and company_id = get_my_company_id() and is_active) <> cardinality(v_members) then
      raise exception 'One of the people you chose could not be found. Reload the page and choose again.';
    end if;
  end if;

  if p_replaces is not null then
    select * into v_old from policy_documents where id = p_replaces for update;
    if not found then
      raise exception 'The document being replaced was not found.';
    end if;
    if v_old.status = 'superseded' then
      raise exception 'That version has already been replaced by a newer one.';
    end if;
    v_version := v_old.version + 1;
    update policy_documents set status = 'superseded' where id = p_replaces;
  end if;

  insert into policy_documents (
    title, description, audience, audience_profile_ids, audience_team_member_ids,
    version, replaces_id, content_html, source_file_name, created_by
  )
  values (
    btrim(p_title),
    nullif(btrim(coalesce(p_description, '')), ''),
    v_audience,
    v_profiles,
    v_members,
    v_version,
    p_replaces,
    p_content_html,
    p_source_file_name,
    (select id from profiles where auth_user_id = auth.uid())
  )
  returning id into v_new;

  return v_new;
end;
$$;

revoke all on function publish_policy_document(text, text, text, text, text, uuid, uuid[], uuid[]) from public, anon;
grant execute on function publish_policy_document(text, text, text, text, text, uuid, uuid[], uuid[]) to authenticated;

-- ──────────────────────────────────────────────────────────────
-- DONE.
-- ──────────────────────────────────────────────────────────────
