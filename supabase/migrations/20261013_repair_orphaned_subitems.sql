-- Re-attach sub-items that board duplication left pointing at the original
-- board's parents.
--
-- Duplicating a board copied every item with a new id but kept each sub-item's
-- parent_id as it was, so the copy's sub-items hung off items on the *source*
-- board. Rows are loaded per board, so a sub-item whose parent isn't on its own
-- board is shown nowhere: not in the copy (no parent there) and not in the
-- source (its board_id is the copy's). The client now remaps parent_id when it
-- duplicates (boardSlice duplicateBoard); this repairs what was already made.
--
-- A sub-item is only moved when its parent's copy can be found with certainty:
-- exactly one top-level item on the sub-item's own board and in the sub-item's
-- own group with the same title and the same position as the old parent. Of
-- 2,042 such sub-items, 1,671 qualify (the group mapping source→copy is
-- one-to-one in every case). The other 371 are not copies of anything on their
-- own board, so there is nothing to attach them to, and they are left as they
-- are: 92 hang off an archived (deleted) "Agoda" row, and 279 off two live
-- "Agoda" rows on other boards (one of them holds 273 children, 91 each from
-- three boards — the original and two later duplicates of it). Which board they
-- belong on can't be told from the data, and moving them would only guess.
--
-- The 20261002 column split ignored these rows too (their parent's group isn't
-- on their board), so their values still sit under the old shared, now item-
-- scope, columns. Each affected group gets a sub-item column for every such
-- column its re-attached sub-items have a value in — an existing sub-item
-- column of the same title and type if there is one, otherwise a copy that keeps
-- the original's options and ids — and the value is copied across. Copied, not
-- moved: nothing is removed from the old keys.
--
-- Before anything changes, the sub-items being touched and the columns table go
-- to the `backup` schema, which the API doesn't expose.

create schema if not exists backup;
revoke all on schema backup from public, anon, authenticated;

create temp table _fix on commit drop as
select c.id as child_id,
       c.board_id,
       c.group_id,
       c.parent_id as old_parent_id,
       m.id as new_parent_id
from public.items c
join public.items p on p.id = c.parent_id and p.board_id <> c.board_id
join lateral (
    select (array_agg(p2.id))[1] as id, count(*) as n
    from public.items p2
    where p2.board_id = c.board_id
      and p2.group_id = c.group_id
      and p2.parent_id is null
      and p2.title is not distinct from p.title
      and p2."order" is not distinct from p."order"
) m on m.n = 1;

create table backup.items_orphan_repair_20261013 as
select i.id, i.parent_id, i.group_id, i."values"
from public.items i
where i.id in (select child_id from _fix);
create table backup.columns_20261013 as select * from public.columns;

-- Same test as 20261002 / src/lib/columnScope.ts `hasValue`.
create function pg_temp.has_value(v jsonb) returns boolean
language sql immutable as $$
    select v is not null
       and jsonb_typeof(v) <> 'null'
       and not (jsonb_typeof(v) = 'string' and btrim(v #>> '{}') = '')
       and not (jsonb_typeof(v) = 'array' and jsonb_array_length(v) = 0)
       and not (jsonb_typeof(v) = 'boolean' and v = 'false'::jsonb)
       and not (jsonb_typeof(v) = 'object' and not exists (
               select 1 from jsonb_each(v) e
               where jsonb_typeof(e.value) <> 'null' and coalesce(e.value #>> '{}', '') <> ''))
$$;

update public.items i
set parent_id = f.new_parent_id
from _fix f
where i.id = f.child_id;

do $$
declare
    r record;
    target_id uuid;
    twin record;
begin
    -- (group, item column) pairs the re-attached sub-items have a value in
    for r in
        select distinct f.board_id, f.group_id, col.id as col_id, col.title, col.type, col."order",
               col.width, col.options, col.aggregation, col.number_format, col.currency_code, col.number_align
        from _fix f
        join public.items i on i.id = f.child_id and jsonb_typeof(i."values") = 'object'
        join public.columns col on col.board_id = f.board_id and col.scope = 'item'
        where pg_temp.has_value(i."values" -> col.id::text)
        order by f.board_id, f.group_id, col."order", col.id
    loop
        select * into twin
        from public.columns t
        where t.board_id = r.board_id and t.scope = 'subitem' and t.group_id = r.group_id
          and t.title is not distinct from r.title and t.type = r.type
        order by t."order"
        limit 1;

        if found then
            -- A status/dropdown whose option ids differ from the original's would
            -- need relabelling; leave those values where they are.
            if r.type in ('status', 'dropdown') and twin.options is distinct from r.options then
                continue;
            end if;
            target_id := twin.id;
        else
            target_id := gen_random_uuid();
            insert into public.columns
                (id, board_id, title, type, "order", width, options, aggregation,
                 number_format, currency_code, number_align, scope, group_id)
            values
                (target_id, r.board_id, r.title, r.type,
                 coalesce((select max(t."order") from public.columns t
                           where t.board_id = r.board_id and t.scope = 'subitem' and t.group_id = r.group_id), 0) + 1,
                 r.width, r.options, r.aggregation, r.number_format, r.currency_code, r.number_align,
                 'subitem', r.group_id);
        end if;

        update public.items i
        set "values" = i."values" || jsonb_build_object(target_id::text, i."values" -> r.col_id::text)
        from _fix f
        where i.id = f.child_id
          and f.board_id = r.board_id and f.group_id = r.group_id
          and jsonb_typeof(i."values") = 'object'
          and pg_temp.has_value(i."values" -> r.col_id::text)
          and not pg_temp.has_value(i."values" -> target_id::text);
    end loop;
end $$;
