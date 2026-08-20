-- Task (Item) delete becomes recoverable, the same way Board and Group
-- delete already are: soft-delete via is_archived instead of a hard
-- DELETE, recoverable from a "Tasks" section in the Board's own
-- Archive/Trash modal.

alter table items add column if not exists is_archived boolean not null default false;

-- Re-declare sync_linked_group_items() (supabase/migrations/20260630_sync_linked_group_updates.sql)
-- unchanged except the UPDATE branch's mirrored write also syncs is_archived,
-- alongside the existing title/values/updates/is_hidden sync — otherwise
-- archiving a task in a linked group wouldn't reflect on the mirrored task
-- on the other board. The DELETE branch (hard-delete still cascades to
-- hard-delete the mirror) is left as-is; it's dead code for normal task
-- deletion now but stays as a safety net for any future permanent-purge path.
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
    insert into items (id, title, board_id, group_id, parent_id, values, updates, is_hidden, "order", mirror_item_id, created_at)
    values (v_new_mirror_id, new.title, v_target_board_id, v_target_group_id, v_target_parent_id, v_mirrored_values, coalesce(new.updates, '[]'::jsonb), coalesce(new.is_hidden, false), new."order", new.id, now());

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

    -- Updates (comments) aren't column-mapped like values — the client
    -- always writes the item's full updates array back on add/edit/delete,
    -- so mirroring new.updates wholesale onto the linked item keeps both
    -- sides' conversation threads identical, the same last-write-wins
    -- semantics already used for values/title. is_archived mirrors the same
    -- way so archiving/restoring a task on one side reflects on the other.
    update items set title = new.title, values = v_mirrored_values, updates = coalesce(new.updates, '[]'::jsonb), is_hidden = coalesce(new.is_hidden, false), is_archived = coalesce(new.is_archived, false)
    where id = new.mirror_item_id;
    return new;
  end if;

  return coalesce(new, old);
end;
$$;

comment on function sync_linked_group_items is 'Mirrors INSERT/UPDATE/DELETE on items between the two groups of a group_links pair, translating values through the per-link column_map (and, for status/dropdown columns, the nested optionMap), and mirroring updates, title and is_archived as-is. Guarded by pg_trigger_depth() to avoid mirroring its own writes.';
