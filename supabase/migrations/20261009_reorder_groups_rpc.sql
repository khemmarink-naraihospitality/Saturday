-- reorderGroups (groupSlice.ts) has always called this RPC first and fallen back
-- to N individual `update()` calls when it fails — which it always has, since the
-- function never existed. The fallback does work (one call per group, each its
-- own round trip), but it means every drag-to-reorder a group logs a scary
-- "[reorderGroups] RPC failed" error and is slower than it needs to be. Mirrors
-- reorder_items/reorder_columns/reorder_boards exactly, including their lack of
-- any membership check beyond RLS on the underlying UPDATE — scoped to board_id
-- the same way reorder_items is.
create or replace function public.reorder_groups(_board_id uuid, _group_ids uuid[])
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  for i in 1 .. array_upper(_group_ids, 1) loop
    update groups
    set "order" = i
    where id = _group_ids[i] and board_id = _board_id;
  end loop;
end;
$$;
