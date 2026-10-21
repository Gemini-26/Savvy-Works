-- ──────────────────────────────────────────────────────────────
-- DUPLICATE AN ASSET LIST IN ONE DATABASE CALL
--
-- The old duplicate ran from the browser: for every item it made one
-- request to clone the asset and a second to write the checkout log,
-- all in sequence, then a last one for the list. A 114-item inventory
-- list is ~230 round trips — close to two minutes of a spinner — and if
-- the admin navigated away, or one request failed, part-way, it left a
-- pile of cloned assets with a technician and no list to show for it.
-- The same slow loop also dropped each item's quantity (every clone
-- came out as 1).
--
-- This does the whole copy inside one transaction: all of it lands, or
-- none of it does. SECURITY INVOKER on purpose — the caller's own row
-- level security still applies, so only an admin can run it.
-- ──────────────────────────────────────────────────────────────

create or replace function duplicate_asset_list(
  p_list_id     uuid,
  p_name        text default null,
  p_assigned_to uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_src      asset_lists%rowtype;
  v_new_list uuid;
  v_new_asset uuid;
  r          record;
  v_now      timestamptz := now();
begin
  select * into v_src from asset_lists where id = p_list_id;
  if not found then
    raise exception 'List not found.';
  end if;

  insert into asset_lists (name, list_type, assigned_to)
  values (coalesce(nullif(btrim(p_name), ''), v_src.name || ' (copy)'), v_src.list_type, p_assigned_to)
  returning id into v_new_list;

  -- Deactivated assets stay behind: they can't be held by anyone and
  -- the list screens already hide them.
  for r in
    select i.quantity, a.*
    from asset_list_items i
    join assets a on a.id = i.asset_id
    where i.list_id = p_list_id
      and a.active is not false
    order by i.created_at, a.name
  loop
    -- A clone made for a technician is a fresh unit issued to them (their
    -- own kit, not a storeroom loan), so owner and holder are both them.
    insert into assets (
      name, item_kind, asset_group, category_id, value, condition,
      owner_id, holder_id, status, since
    ) values (
      r.name, r.item_kind, 'tool_inventory', r.category_id, r.value,
      coalesce(r.condition, 'Good'),
      p_assigned_to, p_assigned_to,
      case when p_assigned_to is null then 'warehouse' else 'with_owner' end,
      case when p_assigned_to is null then null else v_now end
    )
    returning id into v_new_asset;

    insert into asset_list_items (list_id, asset_id, quantity)
    values (v_new_list, v_new_asset, coalesce(r.quantity, 1));

    if p_assigned_to is not null then
      insert into asset_checkout_log (asset_id, action, to_id, condition_out, comment_out)
      values (v_new_asset, 'checked_out', p_assigned_to, coalesce(r.condition, 'Good'),
              'Cloned from "' || v_src.name || '" list duplication');
    end if;
  end loop;

  return v_new_list;
end;
$$;

grant execute on function duplicate_asset_list(uuid, text, uuid) to authenticated;

-- ──────────────────────────────────────────────────────────────
-- DONE.
-- ──────────────────────────────────────────────────────────────
