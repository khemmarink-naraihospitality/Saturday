-- Fix: sync_linked_group_items() was falling back to the SOURCE item's raw
-- option uuid when a specific status/dropdown option had no label match on
-- the destination column (the column itself matched, but not that value).
-- That raw foreign option id doesn't exist in the destination column's
-- options list, so it rendered as a garbled raw string instead of a status
-- pill or being left blank. Now it's skipped (left unset) instead.
-- Re-running this CREATE OR REPLACE updates the existing trigger's behavior
-- without needing to drop/recreate the trigger itself.

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
  if pg_trigger_depth() > 1 then
    return coalesce(new, old);
  end if;

  select * into v_link from group_links
    where group_a_id = coalesce(new.group_id, old.group_id)
       or group_b_id = coalesce(new.group_id, old.group_id)
    limit 1;

  if v_link.id is null then
    return coalesce(new, old);
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
      return new;
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

comment on function sync_linked_group_items is 'Mirrors INSERT/UPDATE/DELETE on items between the two groups of a group_links pair, translating values through the per-link column_map (and, for status/dropdown columns, the nested optionMap). Guarded by pg_trigger_depth() to avoid mirroring its own writes. Options with no label match on the destination are left unset, not written through as a foreign raw id.';
