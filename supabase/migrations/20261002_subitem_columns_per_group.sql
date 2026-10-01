-- Sub-item columns belong to one group, and are never shared with items.
--
-- 20261001_column_scope let a column be the items', the sub-items' or both
-- ('both', which every existing column became). Shared columns turned out to
-- be the problem rather than the fix: renaming, retyping or deleting one from
-- the sub-item header changed it for the items as well. And sub-items under
-- different groups often track different things, so one board-wide set of
-- sub-item columns was still one set too few.
--
-- Now an item column has scope 'item' and no group; a sub-item column has
-- scope 'subitem' and the group whose sub-items it heads (group_id). A
-- sub-item's group is its parent's: the parent is what the user sees it under,
-- and moving a parent never rewrote its sub-items' group_id.
--
-- Existing columns are split by what is actually in them:
--   * a 'both' column that no sub-item has a value in becomes the items';
--   * one that sub-items use gets a copy per group whose sub-items use it, and
--     those sub-items' values move to the copy; the original stays with the
--     items if any item uses it, otherwise it becomes the first group's copy;
--   * a 'subitem' column (added from a sub-item header since 20261001) goes
--     to every group that has sub-items, as that is where it was showing.
-- Copies keep the original's options with their ids, so status values need no
-- remapping. Before anything changes, columns and every item's values are
-- copied to the `backup` schema, which the API doesn't expose.

create schema if not exists backup;
revoke all on schema backup from public, anon, authenticated;
create table backup.columns_20261002 as select * from public.columns;
create table backup.items_values_20261002 as select id, "values" from public.items;

-- Whether a stored value counts as filled in: not null, not an empty string,
-- array or object, not an all-empty object (a timeline with no dates), not an
-- unticked checkbox. src/lib/columnScope.ts `hasValue` is the same test.
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

alter table public.groups add constraint groups_id_board_id_key unique (id, board_id);
alter table public.columns add column group_id uuid;
alter table public.columns add constraint columns_group_fkey
    foreign key (group_id, board_id) references public.groups (id, board_id)
    on delete cascade on update cascade;
create index columns_group_id_idx on public.columns (group_id) where group_id is not null;

do $$
declare
    c record;
    item_used boolean;
    target_groups uuid[];
    new_id uuid;
    i int;
begin
    for c in select * from public.columns where scope in ('both', 'subitem') order by board_id, "order" loop
        if c.scope = 'subitem' then
            -- every group that has live sub-items
            select array_agg(gid order by gorder, gid) into target_groups from (
                select distinct gr.id as gid, gr."order" as gorder
                from public.items s
                left join public.items p on p.id = s.parent_id
                join public.groups gr on gr.id = coalesce(p.group_id, s.group_id) and gr.board_id = c.board_id
                where s.board_id = c.board_id and s.parent_id is not null and not coalesce(s.is_archived, false)
            ) t;
            if target_groups is null then
                select array[id] into target_groups from public.groups
                where board_id = c.board_id order by coalesce(is_archived, false), "order" limit 1;
            end if;
            item_used := false;
        else
            select exists (
                select 1 from public.items it
                where it.board_id = c.board_id and it.parent_id is null and not coalesce(it.is_archived, false)
                  and pg_temp.has_value(it."values" -> (c.id::text))
            ) into item_used;
            -- the groups whose live sub-items have a value in it
            select array_agg(gid order by gorder, gid) into target_groups from (
                select distinct gr.id as gid, gr."order" as gorder
                from public.items s
                left join public.items p on p.id = s.parent_id
                join public.groups gr on gr.id = coalesce(p.group_id, s.group_id) and gr.board_id = c.board_id
                where s.board_id = c.board_id and s.parent_id is not null and not coalesce(s.is_archived, false)
                  and pg_temp.has_value(s."values" -> (c.id::text))
            ) t;
        end if;

        if target_groups is null then
            -- nothing for sub-items: it's the items'
            update public.columns set scope = 'item' where id = c.id;
            continue;
        end if;

        if item_used then
            update public.columns set scope = 'item' where id = c.id;
        end if;

        for i in 1 .. array_length(target_groups, 1) loop
            if i = 1 and not item_used then
                -- The column itself becomes this group's; its sub-items' values stay put.
                update public.columns set scope = 'subitem', group_id = target_groups[1] where id = c.id;
            else
                new_id := gen_random_uuid();
                insert into public.columns
                    (id, board_id, title, type, "order", width, options, aggregation,
                     number_format, currency_code, number_align, scope, group_id)
                values
                    (new_id, c.board_id, c.title, c.type, c."order", c.width, c.options, c.aggregation,
                     c.number_format, c.currency_code, c.number_align, 'subitem', target_groups[i]);
                -- Every sub-item under this group, archived ones too, so a restored
                -- sub-item finds its value where its group's column now is.
                update public.items s
                set "values" = (s."values" - c.id::text) || jsonb_build_object(new_id::text, s."values" -> c.id::text)
                where s.board_id = c.board_id
                  and s.parent_id is not null
                  and jsonb_typeof(s."values") = 'object'
                  and s."values" ? c.id::text
                  and coalesce((select p.group_id from public.items p where p.id = s.parent_id), s.group_id) = target_groups[i];
            end if;
        end loop;
    end loop;
end $$;

alter table public.columns drop constraint columns_scope_check;
alter table public.columns alter column scope set default 'item';
alter table public.columns add constraint columns_scope_check check (scope in ('item', 'subitem'));
alter table public.columns add constraint columns_subitem_group_check check ((scope = 'subitem') = (group_id is not null));
