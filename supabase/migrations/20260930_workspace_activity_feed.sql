-- Workspace activity feed (the dashboard's "Board Updates" widget).
--
-- Measured before this migration, fetching the 30 newest entries for one
-- workspace (Business Tech, 21 boards, 2,832 of 39,106 logs):
--   super admin      1,085 ms
--   regular member   6,428 ms
--
-- Two separate causes:
--
-- 1. No usable index. The activity_logs indexes in scripts/ were never applied
--    here — production had only the primary key and actor_id — so every
--    "newest first" query sorted the whole table.
--
-- 2. RLS ordering. For anyone who isn't an admin, Postgres evaluates the RLS
--    policy on each row *before* the query's own filter, because that filter
--    uses the jsonb ->> operator, which isn't leakproof. The policy is the
--    expensive part (board-membership lookups per row), so a member's query
--    paid it for every one of the 39k rows, and indexes alone only brought that
--    down to ~2.3 s.
--
-- The function below narrows to the workspace's rows through the indexes
-- first, then applies the policy's own predicate, copied verbatim, to just
-- those rows. It returns exactly the rows the RLS policy would: checked against
-- the live policy for a super admin, an IT admin and a regular member across
-- two workspaces, and identical in every case. After:
--   super admin         93 ms
--   regular member     192 ms

create index if not exists idx_activity_logs_created_at
  on activity_logs (created_at desc);

create index if not exists idx_activity_logs_target_id
  on activity_logs (target_id);

create index if not exists idx_activity_logs_meta_board_id
  on activity_logs ((metadata->>'board_id'));

create or replace function public.get_workspace_activity(p_workspace_id uuid, p_limit int default 30)
returns table (
  id uuid,
  created_at timestamptz,
  actor_id uuid,
  action_type text,
  target_type text,
  target_id uuid,
  metadata jsonb,
  actor_name text,
  actor_email text,
  actor_avatar text
)
language sql
stable
security definer
set search_path = public
as $fn$
  -- Archived boards are left out, like everywhere else on the dashboard.
  -- Narrowing only ever hides rows, so it can't loosen the RLS rule below.
  with ws_boards as (
    select b.id from boards b
    where b.workspace_id = p_workspace_id and coalesce(b.is_archived, false) = false
  ),
  -- The same three ways the dashboard matched before: the board as target,
  -- the board named in metadata (item-level events), or the workspace itself.
  -- Three separate selects so each can use its own index.
  candidates as (
    select l.* from activity_logs l where l.target_id in (select wb.id from ws_boards wb)
    union
    select l.* from activity_logs l where (l.metadata->>'board_id') in (select wb.id::text from ws_boards wb)
    union
    select l.* from activity_logs l where l.target_id = p_workspace_id
  )
  select c.id, c.created_at, c.actor_id, c.action_type, c.target_type, c.target_id, c.metadata,
         p.full_name, p.email, p.avatar_url
  from candidates c
  left join profiles p on p.id = c.actor_id
  -- Verbatim from the "Users can view relevant logs" policy on activity_logs.
  -- Security definer skips RLS, so this is what keeps the function from showing
  -- anyone more than a direct select would. Keep the two in step.
  where is_admin() or c.actor_id = auth.uid() or
    case
      when c.target_type = 'workspace' and c.target_id is not null then is_workspace_member(c.target_id)
      when c.target_type = 'board' and c.target_id is not null then is_board_member(c.target_id)
      when c.target_type = 'item' and c.target_id is not null then exists (
        select 1 from items i where i.id = c.target_id and is_board_member(i.board_id))
      when (c.metadata->>'board_id') is not null
           and (c.metadata->>'board_id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then is_board_member((c.metadata->>'board_id')::uuid)
      when (c.metadata->>'workspace_id') is not null
           and (c.metadata->>'workspace_id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then is_workspace_member((c.metadata->>'workspace_id')::uuid)
      else false
    end
  order by c.created_at desc
  limit least(greatest(p_limit, 1), 100);
$fn$;

-- Signed-in users only. It would return nothing to anon anyway (every branch
-- above keys off auth.uid()), but a security definer function shouldn't be
-- reachable by the public key at all.
revoke execute on function public.get_workspace_activity(uuid, int) from public, anon;
grant execute on function public.get_workspace_activity(uuid, int) to authenticated;

comment on function public.get_workspace_activity(uuid, int) is
  'Newest activity for a workspace, visible to the caller exactly as the activity_logs RLS policy allows. Backs the dashboard Board Updates widget.';
