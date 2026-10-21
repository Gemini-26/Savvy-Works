-- ──────────────────────────────────────────────────────────────
-- POLICIES & PROCEDURES — read, agree and sign
--
-- An admin publishes a policy (a Word file converted to HTML in the
-- browser). Every person it applies to reads it, ticks "I understand
-- and agree", and signs. The admin sees who has and hasn't signed.
--
--   policy_documents   one row per VERSION of a policy. Content is frozen
--                      the moment it is published: fixing a typo means
--                      publishing a new version, which everyone signs again.
--   policy_signatures  one row per person per version. Written only by
--                      sign_policy_document() — never directly — so the name,
--                      time, content fingerprint and IP address are stamped by
--                      the database, not trusted from the browser. Nobody
--                      (admins included) can edit or delete a signature.
-- ──────────────────────────────────────────────────────────────

create table if not exists policy_documents (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid references companies(id) on delete cascade,
  title            text not null,
  description      text,
  -- Who has to sign it: everyone, only admins, or only technicians.
  audience         text not null default 'all' check (audience in ('all', 'admin', 'technician')),
  version          integer not null default 1,
  replaces_id      uuid references policy_documents(id) on delete set null,
  -- active: people must sign it. superseded: a newer version replaced it.
  -- archived: withdrawn by an admin, nobody is asked to sign it.
  status           text not null default 'active' check (status in ('active', 'superseded', 'archived')),
  content_html     text not null,
  -- SHA-256 of content_html, set by the database. A signature carries a copy,
  -- so it can always be shown to refer to exactly this wording.
  content_hash     text not null,
  source_file_name text,
  created_by       uuid references profiles(id) on delete set null,
  created_at       timestamptz not null default now()
);

create index if not exists policy_documents_company_id_idx on policy_documents (company_id);
create index if not exists policy_documents_status_idx     on policy_documents (company_id, status);

create table if not exists policy_signatures (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid references companies(id) on delete cascade,
  -- restrict: a document that has been signed can never be deleted.
  document_id       uuid not null references policy_documents(id) on delete restrict,
  -- set null: if a person is removed their signature stays as evidence.
  profile_id        uuid references profiles(id) on delete set null,
  signer_name       text not null,
  signer_role       text,
  signature_image   text not null,
  statement         text not null,
  document_title    text not null,
  document_version  integer not null,
  content_hash      text not null,
  signed_at         timestamptz not null default now(),
  ip_address        text,
  user_agent        text,
  unique (document_id, profile_id)
);

create index if not exists policy_signatures_document_id_idx on policy_signatures (document_id);
create index if not exists policy_signatures_profile_id_idx  on policy_signatures (profile_id);
create index if not exists policy_signatures_company_id_idx  on policy_signatures (company_id);

create or replace trigger trg_policy_documents_company_id
  before insert on policy_documents
  for each row execute function set_company_id_on_insert();

create or replace trigger trg_policy_signatures_company_id
  before insert on policy_signatures
  for each row execute function set_company_id_on_insert();

-- ── Fingerprint + freeze ─────────────────────────────────────

create or replace function policy_documents_stamp()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.content_hash := encode(sha256(convert_to(new.content_html, 'UTF8')), 'hex');
  else
    if new.content_html     is distinct from old.content_html
       or new.content_hash  is distinct from old.content_hash
       or new.version       is distinct from old.version
       or new.company_id    is distinct from old.company_id
       or new.replaces_id   is distinct from old.replaces_id then
      raise exception 'A published document cannot be edited. Publish a new version instead.';
    end if;
  end if;
  return new;
end;
$$;

create or replace trigger trg_policy_documents_stamp
  before insert or update on policy_documents
  for each row execute function policy_documents_stamp();

-- ── Row level security ───────────────────────────────────────

alter table policy_documents  enable row level security;
alter table policy_signatures enable row level security;

-- Admins see every document; everyone else sees what applies to them.
drop policy if exists "policy_documents_select" on policy_documents;
create policy "policy_documents_select"
  on policy_documents for select
  using (
    company_id = get_my_company_id()
    and (get_my_role() = 'admin' or audience = 'all' or audience = get_my_role())
  );

drop policy if exists "policy_documents_admin_write" on policy_documents;
create policy "policy_documents_admin_write"
  on policy_documents for all
  using (company_id = get_my_company_id() and get_my_role() = 'admin')
  with check (company_id = get_my_company_id() and get_my_role() = 'admin');

-- Admins read every signature; a person reads only their own. There are
-- deliberately NO insert / update / delete policies on this table.
drop policy if exists "policy_signatures_select" on policy_signatures;
create policy "policy_signatures_select"
  on policy_signatures for select
  using (
    company_id = get_my_company_id()
    and (
      get_my_role() = 'admin'
      or profile_id = (select id from profiles where auth_user_id = auth.uid())
    )
  );

revoke insert, update, delete on policy_signatures from anon, authenticated;

-- ── Publishing a document (or a new version of one) ──────────

-- SECURITY INVOKER: the caller's own row level security applies, so only an
-- admin gets through. Doing it here makes "supersede the old version and add
-- the new one" a single all-or-nothing step.
create or replace function publish_policy_document(
  p_title            text,
  p_description      text,
  p_audience         text,
  p_content_html     text,
  p_source_file_name text default null,
  p_replaces         uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_old     policy_documents%rowtype;
  v_version integer := 1;
  v_new     uuid;
begin
  if btrim(coalesce(p_title, '')) = '' then
    raise exception 'Give the document a title.';
  end if;
  if btrim(coalesce(p_content_html, '')) = '' then
    raise exception 'The document is empty.';
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

  insert into policy_documents (title, description, audience, version, replaces_id, content_html, source_file_name, created_by)
  values (
    btrim(p_title),
    nullif(btrim(coalesce(p_description, '')), ''),
    coalesce(p_audience, 'all'),
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

-- ── Signing ──────────────────────────────────────────────────

-- SECURITY DEFINER because people have no insert right on the table. Every
-- value that matters is taken from the database here, not from the caller.
create or replace function sign_policy_document(
  p_document_id uuid,
  p_signature   text,
  p_agreed      boolean,
  p_user_agent  text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile profiles%rowtype;
  v_doc     policy_documents%rowtype;
  v_id      uuid;
  v_ip      text;
begin
  select * into v_profile from profiles where auth_user_id = auth.uid() and is_active;
  if not found then
    raise exception 'You need to be signed in to sign a document.';
  end if;

  select * into v_doc from policy_documents where id = p_document_id and company_id = v_profile.company_id;
  if not found then
    raise exception 'Document not found.';
  end if;
  if v_doc.status <> 'active' then
    raise exception 'This document is no longer open for signing. Go back and open the current version.';
  end if;
  if v_doc.audience <> 'all' and v_doc.audience <> v_profile.role then
    raise exception 'This document is not assigned to you.';
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

  -- Supabase's API passes the caller's address along in the request headers.
  begin
    v_ip := nullif(btrim(split_part(coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''), ',', 1)), '');
  exception when others then
    v_ip := null;
  end;

  begin
    insert into policy_signatures (
      company_id, document_id, profile_id, signer_name, signer_role, signature_image, statement,
      document_title, document_version, content_hash, ip_address, user_agent
    ) values (
      v_profile.company_id, v_doc.id, v_profile.id, v_profile.full_name, v_profile.role, p_signature,
      'I have read and understood this document and I agree to follow it.',
      v_doc.title, v_doc.version, v_doc.content_hash, v_ip, left(p_user_agent, 300)
    )
    returning id into v_id;
  exception when unique_violation then
    raise exception 'You have already signed this document.';
  end;

  return v_id;
end;
$$;

revoke all on function sign_policy_document(uuid, text, boolean, text) from public, anon;
grant execute on function sign_policy_document(uuid, text, boolean, text) to authenticated;
revoke all on function publish_policy_document(text, text, text, text, text, uuid) from public, anon;
grant execute on function publish_policy_document(text, text, text, text, text, uuid) to authenticated;

-- ──────────────────────────────────────────────────────────────
-- DONE.
-- ──────────────────────────────────────────────────────────────
