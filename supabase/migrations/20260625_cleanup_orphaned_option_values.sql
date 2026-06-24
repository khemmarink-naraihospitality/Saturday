-- One-time cleanup: remove status/dropdown cell values that reference an
-- option id which doesn't actually exist on that item's own column. These
-- are leftovers from the linked-groups option-fallback bug (now fixed in
-- sync_linked_group_items()) — a status/dropdown value that doesn't match
-- any option on its own column is never valid, regardless of how it got
-- there, so this is safe to run board-wide.

do $$
declare
  r record;
  v_col record;
  v_val jsonb;
  v_options jsonb;
  v_new_values jsonb;
  v_changed boolean;
begin
  for r in select i.id, i.values, i.board_id from items i where i.values is not null loop
    v_new_values := r.values;
    v_changed := false;
    for v_col in
      select c.id, c.options from columns c where c.board_id = r.board_id and c.type in ('status', 'dropdown')
    loop
      v_val := r.values -> v_col.id::text;
      if v_val is not null and jsonb_typeof(v_val) = 'string' then
        -- options is normally a native jsonb array, but some rows have it
        -- stored as a JSON-encoded string instead (the client already works
        -- around this elsewhere) — normalize before treating it as an array.
        v_options := '[]'::jsonb;
        begin
          if v_col.options is not null then
            if jsonb_typeof(v_col.options) = 'array' then
              v_options := v_col.options;
            elsif jsonb_typeof(v_col.options) = 'string' then
              v_options := (v_col.options #>> '{}')::jsonb;
            end if;
          end if;
        exception when others then
          v_options := '[]'::jsonb;
        end;

        if jsonb_typeof(v_options) = 'array' and not exists (
          select 1 from jsonb_array_elements(v_options) opt
          where opt->>'id' = (v_val #>> '{}')
        ) then
          v_new_values := v_new_values - v_col.id::text;
          v_changed := true;
        end if;
      end if;
    end loop;
    if v_changed then
      update items set values = v_new_values where id = r.id;
    end if;
  end loop;
end $$;
