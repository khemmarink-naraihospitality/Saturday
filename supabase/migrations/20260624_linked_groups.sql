-- Linked Groups feature
-- See plan: group-workspace-async-volcano.md

create table if not exists group_links (
  id uuid primary key default uuid_generate_v4(),
  board_a_id uuid not null references boards(id) on delete cascade,
  group_a_id uuid not null references groups(id) on delete cascade,
  board_b_id uuid not null references boards(id) on delete cascade,
  group_b_id uuid not null references groups(id) on delete cascade,
  -- shape: { [columnIdSideA]: { targetColumnId: columnIdSideB, optionMap?: { [optionIdA]: optionIdB } } }
  column_map_a_to_b jsonb not null default '{}'::jsonb,
  column_map_b_to_a jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  constraint group_links_group_a_unique unique (group_a_id),
  constraint group_links_group_b_unique unique (group_b_id),
  constraint group_links_no_self_link check (group_a_id <> group_b_id)
);

create index if not exists idx_group_links_board_a on group_links(board_a_id);
create index if not exists idx_group_links_board_b on group_links(board_b_id);

alter table group_links enable row level security;

drop policy if exists "Users can view links for boards they access" on group_links;
create policy "Users can view links for boards they access" on group_links
for select using (
  board_a_id in (select b.id from boards b where b.workspace_id in (select w.id from workspaces w where w.owner_id = auth.uid()) or is_workspace_member(b.workspace_id) or is_board_member(b.id))
  or board_b_id in (select b.id from boards b where b.workspace_id in (select w.id from workspaces w where w.owner_id = auth.uid()) or is_workspace_member(b.workspace_id) or is_board_member(b.id))
);

drop policy if exists "Users can create links for boards they can write to" on group_links;
create policy "Users can create links for boards they can write to" on group_links
for insert with check (
  board_a_id in (select b.id from boards b where b.workspace_id in (select w.id from workspaces w where w.owner_id = auth.uid()) or is_workspace_member(b.workspace_id) or is_board_member(b.id))
  and board_b_id in (select b.id from boards b where b.workspace_id in (select w.id from workspaces w where w.owner_id = auth.uid()) or is_workspace_member(b.workspace_id) or is_board_member(b.id))
);

drop policy if exists "Users can delete links for boards they can write to" on group_links;
create policy "Users can delete links for boards they can write to" on group_links
for delete using (
  board_a_id in (select b.id from boards b where b.workspace_id in (select w.id from workspaces w where w.owner_id = auth.uid()) or is_workspace_member(b.workspace_id) or is_board_member(b.id))
  or board_b_id in (select b.id from boards b where b.workspace_id in (select w.id from workspaces w where w.owner_id = auth.uid()) or is_workspace_member(b.workspace_id) or is_board_member(b.id))
);

alter table items add column if not exists mirror_item_id uuid references items(id) on delete set null;
create index if not exists idx_items_mirror_item_id on items(mirror_item_id) where mirror_item_id is not null;

create or replace function sync_linked_group_items()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link group_links;
  v_is_side_a boolean;
  v_column_map jsonb;
  v_target_group_id uuid;
  v_target_board_id uuid;
  v_target_parent_id uuid;
  v_mirrored_values jsonb;
  v_col_key text;
  v_col_mapping jsonb;
  v_target_col_id text;
  v_source_val jsonb;
  v_option_map jsonb;
  v_mapped_val jsonb;
  v_new_mirror_id uuid;
begin
  -- Recursion guard: depth 1 = the original user-driven statement. Any write
  -- this function itself issues (the mirror insert/update) re-enters at depth
  -- 2+. Bailing out above depth 1 means "don't mirror the mirror."
  if pg_trigger_depth() > 1 then
    return coalesce(new, old);
  end if;

  select * into v_link from group_links
    where group_a_id = coalesce(new.group_id, old.group_id)
       or group_b_id = coalesce(new.group_id, old.group_id)
    limit 1;

  if v_link.id is null then
    return coalesce(new, old); -- not a linked group, nothing to do
  end if;

  v_is_side_a := (v_link.group_a_id = coalesce(new.group_id, old.group_id));
  if v_is_side_a then
    v_target_group_id := v_link.group_b_id;
    v_target_board_id := v_link.board_b_id;
    v_column_map := v_link.column_map_a_to_b;
  else
    v_target_group_id := v_link.group_a_id;
    v_target_board_id := v_link.board_a_id;
    v_column_map := v_link.column_map_b_to_a;
  end if;

  if tg_op = 'DELETE' then
    if old.mirror_item_id is not null then
      delete from items where id = old.mirror_item_id;
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    -- Sub-items: point the mirror's parent_id at the PARENT'S mirror, not the
    -- original parent. If the parent's mirror doesn't exist yet (only
    -- reachable via a future batched bulk-insert; this codebase's addItem
    -- always inserts parent then child as two separate awaited calls), fall
    -- back to a top-level mirror rather than failing the write.
    if new.parent_id is not null then
      select mirror_item_id into v_target_parent_id from items where id = new.parent_id;
    else
      v_target_parent_id := null;
    end if;

    v_mirrored_values := '{}'::jsonb;
    for v_col_key, v_col_mapping in select * from jsonb_each(v_column_map)
    loop
      if new.values ? v_col_key then
        v_target_col_id := v_col_mapping->>'targetColumnId';
        v_source_val := new.values -> v_col_key;
        v_option_map := v_col_mapping -> 'optionMap';
        if v_option_map is not null and v_source_val is not null and jsonb_typeof(v_source_val) = 'string' then
          v_mapped_val := v_option_map -> (v_source_val #>> '{}');
          if v_mapped_val is null then
            -- This specific option has no label match on the destination
            -- column (the column itself matched, but not this value). Skip
            -- it rather than writing the source's raw option id through —
            -- that id means nothing on the destination column and would
            -- render as a garbled raw string instead of a status pill.
            continue;
          end if;
        else
          v_mapped_val := v_source_val;
        end if;
        if v_target_col_id is not null then
          v_mirrored_values := jsonb_set(v_mirrored_values, array[v_target_col_id], v_mapped_val);
        end if;
      end if;
    end loop;

    v_new_mirror_id := uuid_generate_v4();
    insert into items (id, title, board_id, group_id, parent_id, values, is_hidden, "order", mirror_item_id, created_at)
    values (v_new_mirror_id, new.title, v_target_board_id, v_target_group_id, v_target_parent_id, v_mirrored_values, coalesce(new.is_hidden, false), new."order", new.id, now());

    update items set mirror_item_id = v_new_mirror_id where id = new.id;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.mirror_item_id is null then
      return new; -- defensive; should not happen for a linked item
    end if;

    v_mirrored_values := '{}'::jsonb;
    for v_col_key, v_col_mapping in select * from jsonb_each(v_column_map)
    loop
      if new.values ? v_col_key then
        v_target_col_id := v_col_mapping->>'targetColumnId';
        v_source_val := new.values -> v_col_key;
        v_option_map := v_col_mapping -> 'optionMap';
        if v_option_map is not null and v_source_val is not null and jsonb_typeof(v_source_val) = 'string' then
          v_mapped_val := v_option_map -> (v_source_val #>> '{}');
          if v_mapped_val is null then
            -- This specific option has no label match on the destination
            -- column (the column itself matched, but not this value). Skip
            -- it rather than writing the source's raw option id through —
            -- that id means nothing on the destination column and would
            -- render as a garbled raw string instead of a status pill.
            continue;
          end if;
        else
          v_mapped_val := v_source_val;
        end if;
        if v_target_col_id is not null then
          v_mirrored_values := jsonb_set(v_mirrored_values, array[v_target_col_id], v_mapped_val);
        end if;
      end if;
    end loop;

    update items set title = new.title, values = v_mirrored_values, is_hidden = coalesce(new.is_hidden, false)
    where id = new.mirror_item_id;
    return new;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists on_items_sync_linked_group on items;
create trigger on_items_sync_linked_group
  after insert or update or delete on items
  for each row
  execute function sync_linked_group_items();

comment on function sync_linked_group_items is 'Mirrors INSERT/UPDATE/DELETE on items between the two groups of a group_links pair, translating values through the per-link column_map (and, for status/dropdown columns, the nested optionMap). Guarded by pg_trigger_depth() to avoid mirroring its own writes.';
comment on trigger on_items_sync_linked_group on items is 'Linked Groups feature: keeps items in linked groups in sync across boards.';
