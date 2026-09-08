-- The main table and Kanban only ever show two things about an item's comment
-- thread: how many there are, and how recent the newest one is. They were
-- getting that by loading `updates` in full — every comment body, as rich HTML —
-- for every item on the board. That column is 72MB across the live items
-- against 19MB for all the actual cell values, and one single item carries
-- 5.6MB of it, so opening a 22-item board could pull 8.4MB to render a handful
-- of number badges.
--
-- These are PostgREST computed fields: read-only functions over an `items` row,
-- selectable as if they were columns (`select=id,title,updates_count`). Nothing
-- about the table, its data, or its RLS changes — the row still has to be
-- visible under the existing items policy for either to be reachable.

create or replace function public.updates_count(items)
returns integer
language sql
stable
as $$
    select case
        when jsonb_typeof($1.updates) = 'array' then jsonb_array_length($1.updates)
        else 0
    end;
$$;

-- Returns the raw createdAt string rather than a timestamptz on purpose: these
-- are client-written ISO strings, and one malformed value would fail the cast
-- for the whole query. ISO-8601 sorts correctly as text, so max() is still the
-- newest, and the client parses it exactly as it already parses the ones inside
-- `updates` itself.
create or replace function public.last_update_at(items)
returns text
language sql
stable
as $$
    select max(u ->> 'createdAt')
    from jsonb_array_elements(
        case when jsonb_typeof($1.updates) = 'array' then $1.updates else '[]'::jsonb end
    ) u;
$$;

grant execute on function public.updates_count(items) to authenticated, anon;
grant execute on function public.last_update_at(items) to authenticated, anon;
