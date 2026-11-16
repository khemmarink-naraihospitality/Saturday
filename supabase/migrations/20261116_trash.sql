-- Trash (user request 16-Nov-2026): everything deleted waits in one Trash,
-- reached from the profile menu, with where it lives and who deleted it when.
--
-- Until now boards, groups and items were soft-deleted (is_archived) with no
-- record of when or by whom, while workspaces and columns were deleted for good
-- (a workspace took every board under it along) and an update was cut out of
-- items.updates. Now:
--   * workspaces and columns are soft-deleted too (is_archived);
--   * every level records archived_at / archived_by, stamped by a trigger so
--     every client path (and the linked-group mirror) gets it without code;
--   * a deleted update keeps its thread (the update and its replies) in
--     trashed_updates until it is restored;
--   * trash_list() / trash_counts() read the whole Trash as the signed-in user
--     (security invoker: RLS decides what each person sees), with each entry's
--     folder path, board, group and parent, and whether any of them is itself
--     in the Trash;
--   * the due-date reminders skip anything in the Trash (they used to remind
--     people about deleted items).
-- Nothing is removed; existing archived rows are given their best-known
-- deletion time and person from activity_logs.

-- 1. Columns ------------------------------------------------------------------

alter table public.workspaces
    add column if not exists is_archived boolean not null default false,
    add column if not exists archived_at timestamptz,
    add column if not exists archived_by uuid references public.profiles(id) on delete set null;

alter table public.columns
    add column if not exists is_archived boolean not null default false,
    add column if not exists archived_at timestamptz,
    add column if not exists archived_by uuid references public.profiles(id) on delete set null;

alter table public.boards
    add column if not exists archived_at timestamptz,
    add column if not exists archived_by uuid references public.profiles(id) on delete set null;

alter table public.groups
    add column if not exists archived_at timestamptz,
    add column if not exists archived_by uuid references public.profiles(id) on delete set null;

alter table public.items
    add column if not exists archived_at timestamptz,
    add column if not exists archived_by uuid references public.profiles(id) on delete set null;

create index if not exists workspaces_archived_idx on public.workspaces (archived_at) where is_archived;
create index if not exists boards_archived_idx on public.boards (archived_at) where is_archived;
create index if not exists groups_archived_idx on public.groups (archived_at) where is_archived;
create index if not exists items_archived_idx on public.items (archived_at) where is_archived;
create index if not exists columns_archived_idx on public.columns (archived_at) where is_archived;

-- 2. Who deleted it, and when ----------------------------------------------------

create or replace function public.stamp_archived()
returns trigger
language plpgsql
set search_path = public
as $$
begin
    if new.is_archived is distinct from old.is_archived then
        if coalesce(new.is_archived, false) then
            new.archived_at := now();
            new.archived_by := auth.uid();
        else
            new.archived_at := null;
            new.archived_by := null;
        end if;
    end if;
    return new;
end;
$$;

drop trigger if exists stamp_archived on public.workspaces;
create trigger stamp_archived before update of is_archived on public.workspaces
    for each row execute function public.stamp_archived();
drop trigger if exists stamp_archived on public.boards;
create trigger stamp_archived before update of is_archived on public.boards
    for each row execute function public.stamp_archived();
drop trigger if exists stamp_archived on public.groups;
create trigger stamp_archived before update of is_archived on public.groups
    for each row execute function public.stamp_archived();
drop trigger if exists stamp_archived on public.items;
create trigger stamp_archived before update of is_archived on public.items
    for each row execute function public.stamp_archived();
drop trigger if exists stamp_archived on public.columns;
create trigger stamp_archived before update of is_archived on public.columns
    for each row execute function public.stamp_archived();

-- 3. Deleted updates ----------------------------------------------------------------

create table if not exists public.trashed_updates (
    id uuid primary key default gen_random_uuid(),
    item_id uuid not null references public.items(id) on delete cascade,
    board_id uuid not null references public.boards(id) on delete cascade,
    update_id text not null,
    -- The update first, then its replies, exactly as they were stored
    thread jsonb not null check (jsonb_typeof(thread) = 'array' and jsonb_array_length(thread) > 0),
    deleted_at timestamptz not null default now(),
    deleted_by uuid default auth.uid() references public.profiles(id) on delete set null
);
create index if not exists trashed_updates_item_idx on public.trashed_updates (item_id);
create index if not exists trashed_updates_board_idx on public.trashed_updates (board_id);

alter table public.trashed_updates enable row level security;

drop policy if exists "Read deleted updates where the item is readable" on public.trashed_updates;
create policy "Read deleted updates where the item is readable" on public.trashed_updates
    for select to authenticated
    using (exists (select 1 from public.items i where i.id = trashed_updates.item_id));

-- Only the update's author files it (the edit/delete buttons are theirs alone);
-- an old update stored without an author id has nothing to check against.
drop policy if exists "Authors put their own updates in the Trash" on public.trashed_updates;
create policy "Authors put their own updates in the Trash" on public.trashed_updates
    for insert to authenticated
    with check (
        deleted_by = auth.uid()
        and exists (select 1 from public.items i where i.id = trashed_updates.item_id and i.board_id = trashed_updates.board_id)
        and coalesce(thread -> 0 ->> 'userId', auth.uid()::text) = auth.uid()::text
    );

drop policy if exists "Whoever deleted it takes it back out" on public.trashed_updates;
create policy "Whoever deleted it takes it back out" on public.trashed_updates
    for delete to authenticated
    using (deleted_by = auth.uid() or public.is_admin());

revoke all on public.trashed_updates from anon;
grant select, insert, delete on public.trashed_updates to authenticated;

-- 4. Reading the Trash ------------------------------------------------------------
-- Security definer, with the read rules of the tables written out once: under
-- RLS every reference to items/groups/boards re-ran its policy (a pass over
-- every board with three membership checks each), and the per-row counts made
-- a regular member wait ~10 s. The rules below are the SELECT policies as they
-- stand: a board (and its groups, items and columns) is readable to an admin,
-- the owner of its workspace, a workspace member or a board member; a folder to
-- an admin, its owner, a member or a guest on one of its boards.

-- A folder counts as in the Trash when it or any folder above it is.
create or replace function public.workspace_is_trashed(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    with recursive chain as (
        select w.id, w.parent_id, w.is_archived, 1 as depth from public.workspaces w where w.id = p_id
        union all
        select w.id, w.parent_id, w.is_archived, c.depth + 1
        from public.workspaces w join chain c on w.id = c.parent_id
        where c.depth < 20
    )
    select coalesce(bool_or(is_archived), false) from chain;
$$;

-- "Parent folder › Sub-folder", top first, naming only folders the caller may see
create or replace function public.trash_folder_path(p_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
    with recursive chain as (
        select w.id, w.parent_id, w.title, w.owner_id, 1 as depth from public.workspaces w where w.id = p_id
        union all
        select w.id, w.parent_id, w.title, w.owner_id, c.depth + 1
        from public.workspaces w join chain c on w.id = c.parent_id
        where c.depth < 20
    )
    select string_agg(title, ' › ' order by depth desc) from chain
    where public.is_admin() or owner_id = auth.uid() or public.is_workspace_member(id) or public.is_board_guest_of_workspace(id);
$$;

create or replace function public.trash_entries()
returns table (
    kind text, id text, title text, inner_count int,
    folder_id uuid, board_id uuid, group_id uuid, parent_id uuid, item_id uuid,
    column_scope text, deleted_at timestamptz, deleted_by uuid
)
language sql
stable
security definer
set search_path = public
as $$
    with me as materialized (
        select auth.uid() as uid, public.is_admin() as adm
    ), ws as materialized (
        select w.id from public.workspaces w, me
        where me.uid is not null
          and (me.adm or w.owner_id = me.uid or public.is_workspace_member(w.id) or public.is_board_guest_of_workspace(w.id))
    ), bd as materialized (
        select b.id from public.boards b, me
        where me.uid is not null
          and (me.adm
               or b.workspace_id in (select w.id from public.workspaces w where w.owner_id = me.uid)
               or public.is_workspace_member(b.workspace_id)
               or public.is_board_member(b.id))
    ), live_items as materialized (
        -- Top-level items still on their boards, counted once for the board and group rows
        select i.board_id, i.group_id from public.items i
        where not i.is_archived and i.parent_id is null and i.board_id in (select id from bd)
    )
    select 'workspace', w.id::text, w.title,
           (select count(*)::int from public.boards b2 where b2.workspace_id = w.id and b2.is_archived is not true),
           w.parent_id, null::uuid, null::uuid, null::uuid, null::uuid, null::text, w.archived_at, w.archived_by
    from public.workspaces w where w.is_archived and w.id in (select id from ws)
    union all
    select 'board', b.id::text, b.title,
           (select count(*)::int from live_items l where l.board_id = b.id),
           b.workspace_id, b.id, null, null, null, null, b.archived_at, b.archived_by
    from public.boards b where b.is_archived and b.id in (select id from bd)
    union all
    select 'group', g.id::text, g.title,
           (select count(*)::int from live_items l where l.group_id = g.id),
           null, g.board_id, g.id, null, null, null, g.archived_at, g.archived_by
    from public.groups g where g.is_archived and g.board_id in (select id from bd)
    union all
    -- A sub-item deleted together with its parent is listed under the parent
    select case when i.parent_id is null then 'item' else 'subitem' end, i.id::text, i.title,
           (select count(*)::int from public.items c2 where c2.parent_id = i.id and c2.is_archived),
           null, i.board_id, coalesce(p.group_id, i.group_id), i.parent_id, null, null, i.archived_at, i.archived_by
    from public.items i
    left join public.items p on p.id = i.parent_id
    where i.is_archived and p.is_archived is not true and i.board_id in (select id from bd)
    union all
    select 'column', c.id::text, c.title, null::int,
           null, c.board_id, c.group_id, null, null, c.scope, c.archived_at, c.archived_by
    from public.columns c where c.is_archived and c.board_id in (select id from bd)
    union all
    select 'update', t.id::text,
           coalesce(nullif(btrim(regexp_replace(regexp_replace(regexp_replace(t.thread -> 0 ->> 'content', '<[^>]*>', ' ', 'g'), '&nbsp;|&#160;', ' ', 'g'), '\s+', ' ', 'g')), ''), '(image or attachment)'),
           jsonb_array_length(t.thread) - 1,
           null, t.board_id, coalesce(p.group_id, it.group_id), it.parent_id, t.item_id, null, t.deleted_at, t.deleted_by
    from public.trashed_updates t
    join public.items it on it.id = t.item_id
    left join public.items p on p.id = it.parent_id
    where t.board_id in (select id from bd);
$$;

create or replace function public.trash_list(
    p_kind text default null,
    p_search text default null,
    p_mine boolean default false,
    p_limit int default 50,
    p_offset int default 0
)
returns table (
    kind text, id text, title text, inner_count int,
    folder_id uuid, folder_title text, folder_path text, folder_trashed boolean,
    board_id uuid, board_title text, board_trashed boolean,
    group_id uuid, group_title text, group_color text, group_trashed boolean,
    parent_id uuid, parent_title text, parent_trashed boolean,
    item_id uuid, item_title text, item_trashed boolean,
    column_scope text, deleted_at timestamptz, deleted_by uuid, deleted_by_name text,
    total bigint
)
language sql
stable
security definer
set search_path = public
as $$
    with e as (
        select * from public.trash_entries() t
        where (p_kind is null or t.kind = p_kind or (p_kind = 'item' and t.kind = 'subitem'))
          and (coalesce(p_search, '') = '' or t.title ilike '%' || p_search || '%')
          and (not coalesce(p_mine, false) or t.deleted_by = auth.uid())
    ), page as (
        select e.*, count(*) over () as total from e
        order by e.deleted_at desc nulls last, e.title
        limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0)
    )
    -- Every row of page is one the caller may read, and so are its board,
    -- group, parent and item (same board); its folder path names only folders
    -- the caller may see.
    select e.kind, e.id, e.title, e.inner_count,
           f.id, f.title, public.trash_folder_path(f.id), coalesce(public.workspace_is_trashed(f.id), false),
           b.id, b.title, coalesce(b.is_archived, false),
           g.id, g.title, g.color, coalesce(g.is_archived, false),
           p.id, p.title, coalesce(p.is_archived, false),
           it.id, it.title, coalesce(it.is_archived, false),
           e.column_scope, e.deleted_at, e.deleted_by, pr.full_name,
           e.total
    from page e
    left join public.boards b on b.id = e.board_id
    left join public.workspaces f on f.id = coalesce(e.folder_id, b.workspace_id)
    left join public.groups g on g.id = e.group_id
    left join public.items p on p.id = e.parent_id
    left join public.items it on it.id = e.item_id
    left join public.profiles pr on pr.id = e.deleted_by
    order by e.deleted_at desc nulls last, e.title;
$$;

create or replace function public.trash_counts(p_search text default null, p_mine boolean default false)
returns table (kind text, n bigint)
language sql
stable
security definer
set search_path = public
as $$
    select case when t.kind = 'subitem' then 'item' else t.kind end, count(*)
    from public.trash_entries() t
    where (coalesce(p_search, '') = '' or t.title ilike '%' || p_search || '%')
      and (not coalesce(p_mine, false) or t.deleted_by = auth.uid())
    group by 1;
$$;

revoke execute on function public.workspace_is_trashed(uuid) from public, anon;
revoke execute on function public.trash_folder_path(uuid) from public, anon;
revoke execute on function public.trash_entries() from public, anon;
revoke execute on function public.trash_list(text, text, boolean, int, int) from public, anon;
revoke execute on function public.trash_counts(text, boolean) from public, anon;
grant execute on function public.workspace_is_trashed(uuid) to authenticated;
grant execute on function public.trash_folder_path(uuid) to authenticated;
grant execute on function public.trash_entries() to authenticated;
grant execute on function public.trash_list(text, text, boolean, int, int) to authenticated;
grant execute on function public.trash_counts(text, boolean) to authenticated;

-- 5. Best-known time and person for what is already in the Trash ---------------------
-- From the activity log where it names the row (title, board, within a few
-- seconds); otherwise the row's own updated_at, which the archive set. The
-- updated_at and linked-group triggers are off for this part only, so the rows
-- keep their times and nothing is mirrored; an actor whose profile is gone is
-- left out.

alter table public.boards disable trigger update_boards_updated_at;
alter table public.items disable trigger update_items_updated_at;
alter table public.items disable trigger on_items_sync_linked_group;

with m as (
    select b.id, b.updated_at,
           (select l from public.activity_logs l
             where l.action_type = 'board_deleted'
               and l.metadata ->> 'workspace_id' = b.workspace_id::text
               and l.metadata ->> 'board_title' = b.title
             order by abs(extract(epoch from (l.created_at - b.updated_at)))
             limit 1) as log
    from public.boards b
    where b.is_archived and b.archived_at is null
)
update public.boards b
set archived_at = coalesce((m.log).created_at, m.updated_at),
    archived_by = (select pr.id from public.profiles pr where pr.id = (m.log).actor_id)
from m where m.id = b.id;

with m as (
    select g.id,
           (select l from public.activity_logs l
             where l.action_type = 'group_deleted'
               and coalesce(l.metadata ->> 'board_id', l.target_id::text) = g.board_id::text
               and l.metadata ->> 'group_title' = g.title
             order by l.created_at desc
             limit 1) as log
    from public.groups g
    where g.is_archived and g.archived_at is null
)
update public.groups g
set archived_at = (m.log).created_at,
    archived_by = (select pr.id from public.profiles pr where pr.id = (m.log).actor_id)
from m where m.id = g.id;

with m as (
    select i.id, i.updated_at,
           (select l from public.activity_logs l
             where l.action_type = 'item_deleted'
               and l.target_id = i.board_id
               and l.created_at between i.updated_at - interval '30 seconds' and i.updated_at + interval '30 seconds'
             order by (l.metadata ->> 'item_title' = i.title) desc nulls last,
                      abs(extract(epoch from (l.created_at - i.updated_at)))
             limit 1) as log
    from public.items i
    where i.is_archived and i.archived_at is null
)
update public.items i
set archived_at = coalesce((m.log).created_at, m.updated_at),
    archived_by = (select pr.id from public.profiles pr where pr.id = (m.log).actor_id)
from m where m.id = i.id;

alter table public.boards enable trigger update_boards_updated_at;
alter table public.items enable trigger update_items_updated_at;
alter table public.items enable trigger on_items_sync_linked_group;

-- 6. No reminders about anything in the Trash -----------------------------------------
CREATE OR REPLACE FUNCTION public.notify_due_date_reminders()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  rec record;
  assignee_id uuid;
  assignee_email text;
  due_label text;
  org_offsets int[];
  all_offsets int[];
  user_raw jsonb;
  user_offsets int[];
begin
  -- Org-wide default (Admin Console > Due Date Reminders). Missing row or
  -- empty array -> [7, 0], same as before.
  select coalesce(array_agg(elem::int), array[7, 0])
    into org_offsets
    from (
      select case when jsonb_typeof(value) = 'array' then value else '[]'::jsonb end as v
        from system_settings
       where key = 'due_date_reminder_offsets'
    ) s,
    lateral jsonb_array_elements_text(s.v) as elem
   where elem ~ '^\d+$';

  -- Superset of every day-count anyone could care about: the org default
  -- plus every personal array. Used only to narrow the items scan; the
  -- real decision is per-assignee, below.
  select coalesce(array_agg(distinct v), array[]::int[])
    into all_offsets
    from (
      select unnest(org_offsets) as v
      union
      select elem::int as v
        from profiles p,
        lateral jsonb_array_elements_text(
          case when jsonb_typeof(p.due_date_reminder_offsets) = 'array'
               then p.due_date_reminder_offsets
               else '[]'::jsonb
          end
        ) as elem
       where elem ~ '^\d+$'
    ) u;

  for rec in
    select
      i.id       as item_id,
      i.board_id,
      i.title    as item_title,
      i.values   as item_values,
      b.title    as board_title,
      ((i.values ->> c.id::text)::date - current_date) as days_until_due
    from items i
    join columns c on c.board_id = i.board_id and c.type = 'due_date' and not c.is_archived
    join boards b on b.id = i.board_id
    left join groups g on g.id = i.group_id
    left join items parent on parent.id = i.parent_id
    where (i.values ->> c.id::text) ~ '^\d{4}-\d{2}-\d{2}$'
      -- Nothing in the Trash sends reminders: the item, its parent, its group,
      -- its board and every folder above it must all be live.
      and not i.is_archived
      and parent.is_archived is not true
      and g.is_archived is not true
      and b.is_archived is not true
      and not public.workspace_is_trashed(b.workspace_id)
      and ((i.values ->> c.id::text)::date - current_date) = any(all_offsets)
  loop
    -- People-column values are trusted to be user-id strings in normal
    -- use, but this runs unattended with no one to notice a bad row —
    -- filter to UUID-shaped strings before casting so one malformed or
    -- legacy value can't abort the whole job.
    for assignee_id in
      select distinct elem::uuid
      from (
        select jsonb_array_elements_text(
          case jsonb_typeof(rec.item_values -> pc.id::text)
            when 'array'  then rec.item_values -> pc.id::text
            when 'string' then jsonb_build_array(rec.item_values -> pc.id::text)
            else '[]'::jsonb
          end
        ) as elem
        from columns pc
        where pc.board_id = rec.board_id and pc.type = 'people' and not pc.is_archived
      ) people_ids
      where elem ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    loop
      -- Resolve THIS assignee's schedule + email. No row (assignee id
      -- points at a deleted profile) leaves user_raw/assignee_email NULL
      -- -> org default schedule, no email sent.
      select p.due_date_reminder_offsets, p.email
        into user_raw, assignee_email
        from profiles p
       where p.id = assignee_id;

      if user_raw is null or jsonb_typeof(user_raw) <> 'array' then
        user_offsets := org_offsets;
      else
        -- An explicitly empty array stays empty here (opt-out); it must
        -- NOT fall back to the org default.
        select coalesce(array_agg(elem::int), array[]::int[])
          into user_offsets
          from jsonb_array_elements_text(user_raw) as elem
         where elem ~ '^\d+$';
      end if;

      continue when not (rec.days_until_due = any(user_offsets));

      due_label := case
        when rec.days_until_due = 0 then 'due today'
        else format('due in %s day%s', rec.days_until_due,
                    case when rec.days_until_due = 1 then '' else 's' end)
      end;

      -- Idempotent per (user, item, day-count): re-running today, or the
      -- daily job firing again before the due date changes, never inserts
      -- a duplicate notification or sends a duplicate email — both are
      -- gated by the same check.
      if not exists (
        select 1 from notifications n
        where n.user_id = assignee_id
          and n.entity_id = rec.item_id
          and n.type = 'due_date_reminder'
          and (n.data ->> 'milestone') = rec.days_until_due::text
      ) then
        insert into notifications (user_id, type, content, entity_id, data, is_read)
        values (
          assignee_id,
          'due_date_reminder',
          format('"%s" is %s', rec.item_title, due_label),
          rec.item_id,
          jsonb_build_object('board_id', rec.board_id,
                             'milestone', rec.days_until_due::text,
                             'status', 'pending'),
          false
        );

        if assignee_email is not null then
          perform net.http_post(
            url := 'https://susgfswicrxdxaioegps.supabase.co/functions/v1/invite-user',
            headers := jsonb_build_object(
              'Content-Type', 'application/json',
              'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN1c2dmc3dpY3J4ZHhhaW9lZ3BzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0MjQyNTgsImV4cCI6MjA4ODAwMDI1OH0.ePyt2c2_OPYXaRz9iLWy65D2Gp2I3rrGxEn1ltwmRsM'
            ),
            body := jsonb_build_object(
              'action', 'due_date_reminder',
              'email', assignee_email,
              'itemName', rec.item_title,
              'boardName', rec.board_title,
              'dueLabel', due_label,
              'itemLink', 'https://saturdaycom.vercel.app/?boardId=' || rec.board_id || '&itemId=' || rec.item_id
            )
          );
        end if;
      end if;
    end loop;
  end loop;
end;
$function$;

-- 7. Which folders are out of sight ---------------------------------------------------
-- Every folder in the Trash and every folder under one, as ids only. The app
-- hides these and their boards; it cannot work the descendants out itself when
-- the trashed folder is one the person was never a member of.
create or replace function public.trashed_workspace_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
    with recursive t as (
        select w.id, 1 as depth from public.workspaces w where w.is_archived
        union all
        select w.id, t.depth + 1 from public.workspaces w join t on w.parent_id = t.id
        where t.depth < 20
    )
    select distinct id from t where auth.uid() is not null;
$$;
revoke execute on function public.trashed_workspace_ids() from public, anon;
grant execute on function public.trashed_workspace_ids() to authenticated;

-- 8. Bringing a folder back -----------------------------------------------------------
-- A folder's row can only be written by its owner (RLS), which left an admin
-- unable to restore a folder someone else had put in the Trash. Owner or admin.
create or replace function public.restore_workspace(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
    if auth.uid() is null or not exists (
        select 1 from public.workspaces w
        where w.id = p_id and (w.owner_id = auth.uid() or public.is_admin())
    ) then
        return false;
    end if;
    update public.workspaces set is_archived = false where id = p_id and is_archived;
    return true;
end;
$$;
revoke execute on function public.restore_workspace(uuid) from public, anon;
grant execute on function public.restore_workspace(uuid) to authenticated;
