-- Finish-to-Start (FS) task dependencies.
--
-- One row = one edge: predecessor -> successor, within a single board. When the
-- predecessor's timeline moves, the client shifts every downstream successor by
-- the same number of days (MS Project auto-schedule), preserving the gaps.
--
-- board_id is denormalised onto the row so RLS can gate on board membership the
-- same way group_links does, without a join per policy check.

create table if not exists item_dependencies (
  id uuid primary key default uuid_generate_v4(),
  board_id uuid not null references boards(id) on delete cascade,
  predecessor_item_id uuid not null references items(id) on delete cascade,
  successor_item_id uuid not null references items(id) on delete cascade,
  -- Only FS today. The column exists so SS/FF/SF can be added without a rewrite.
  type text not null default 'FS' check (type in ('FS')),
  -- Reserved: v1 keeps whatever gap the dates already express rather than
  -- enforcing an explicit lag.
  lag_days integer not null default 0,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  constraint item_dependencies_unique_edge unique (predecessor_item_id, successor_item_id),
  constraint item_dependencies_no_self check (predecessor_item_id <> successor_item_id)
);

create index if not exists idx_item_dependencies_board on item_dependencies(board_id);
create index if not exists idx_item_dependencies_pred on item_dependencies(predecessor_item_id);
create index if not exists idx_item_dependencies_succ on item_dependencies(successor_item_id);

-- Same-board enforcement. This reads another table, so it cannot be a CHECK.
create or replace function validate_item_dependency()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pred_board uuid;
  v_succ_board uuid;
begin
  select board_id into v_pred_board from items where id = new.predecessor_item_id;
  select board_id into v_succ_board from items where id = new.successor_item_id;

  if v_pred_board is null or v_succ_board is null then
    raise exception 'item_dependencies: both items must exist';
  end if;

  if v_pred_board is distinct from new.board_id or v_succ_board is distinct from new.board_id then
    raise exception 'item_dependencies: both items must belong to board %', new.board_id;
  end if;

  return new;
end;
$$;

drop trigger if exists on_item_dependencies_validate on item_dependencies;
create trigger on_item_dependencies_validate
  before insert on item_dependencies
  for each row
  execute function validate_item_dependency();

alter table item_dependencies enable row level security;

drop policy if exists "Users can view dependencies for boards they access" on item_dependencies;
create policy "Users can view dependencies for boards they access" on item_dependencies
for select using (
  board_id in (select b.id from boards b where b.workspace_id in (select w.id from workspaces w where w.owner_id = auth.uid()) or is_workspace_member(b.workspace_id) or is_board_member(b.id))
);

drop policy if exists "Users can create dependencies for boards they can write to" on item_dependencies;
create policy "Users can create dependencies for boards they can write to" on item_dependencies
for insert with check (
  board_id in (select b.id from boards b where b.workspace_id in (select w.id from workspaces w where w.owner_id = auth.uid()) or is_workspace_member(b.workspace_id) or is_board_member(b.id))
);

drop policy if exists "Users can delete dependencies for boards they can write to" on item_dependencies;
create policy "Users can delete dependencies for boards they can write to" on item_dependencies
for delete using (
  board_id in (select b.id from boards b where b.workspace_id in (select w.id from workspaces w where w.owner_id = auth.uid()) or is_workspace_member(b.workspace_id) or is_board_member(b.id))
);

-- Realtime publication membership is managed by hand in this project.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'item_dependencies'
  ) then
    alter publication supabase_realtime add table public.item_dependencies;
  end if;
end $$;

comment on table item_dependencies is 'Finish-to-Start dependencies between items on the same board. Moving a predecessor shifts its successors by the same delta, cascading downstream.';
comment on function validate_item_dependency is 'Rejects an item_dependencies row whose two items do not both live on board_id.';
