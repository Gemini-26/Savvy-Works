-- ──────────────────────────────────────────────────────────────
-- POLICIES — fill-in lines
--
-- Word policies are full of "Name: ________" lines. People signing can now
-- type into them (name, ID number, date…) before they draw their signature.
--
--   policy_documents.fill_fields     which blank lines people type into:
--                                    [{ n, label, kind }]. NULL = nobody chose
--                                    yet, the app uses its own guess (so documents
--                                    published before this keep working).
--   policy_signatures.field_answers  what the person typed: [{ n, label, value }],
--                                    saved with the signature like everything else
--                                    on it — nobody can edit it afterwards.
--
-- The document wording itself is untouched (it is fingerprinted); the lines are
-- worked out from it in the app.
-- ──────────────────────────────────────────────────────────────

alter table policy_documents  add column if not exists fill_fields   jsonb;
alter table policy_signatures add column if not exists field_answers jsonb;

-- Once anyone has signed, the lines they were asked to fill in are part of what
-- they signed — they can no longer change. (Wording was already frozen.)
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

    if new.fill_fields is distinct from old.fill_fields
       and exists (select 1 from policy_signatures where document_id = old.id) then
      raise exception 'Someone has already signed this document, so its fill-in lines can no longer be changed. Publish a new version instead.';
    end if;
  end if;
  return new;
end;
$$;

-- ── Signing, now with the typed-in answers ───────────────────

-- A new argument means a new function; the old one has to go or a call without
-- the argument would match both.
drop function if exists sign_policy_document(uuid, text, boolean, text);

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
  v_id      uuid;
  v_ip      text;
  v_answers jsonb;
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
      company_id, document_id, profile_id, signer_name, signer_role, signature_image, statement,
      document_title, document_version, content_hash, ip_address, user_agent, field_answers
    ) values (
      v_profile.company_id, v_doc.id, v_profile.id, v_profile.full_name, v_profile.role, p_signature,
      'I have read and understood this document and I agree to follow it.',
      v_doc.title, v_doc.version, v_doc.content_hash, v_ip, left(p_user_agent, 300), v_answers
    )
    returning id into v_id;
  exception when unique_violation then
    raise exception 'You have already signed this document.';
  end;

  return v_id;
end;
$$;

revoke all on function sign_policy_document(uuid, text, boolean, text, jsonb) from public, anon;
grant execute on function sign_policy_document(uuid, text, boolean, text, jsonb) to authenticated;

-- ──────────────────────────────────────────────────────────────
-- DONE.
-- ──────────────────────────────────────────────────────────────
