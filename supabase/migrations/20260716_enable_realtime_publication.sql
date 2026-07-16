-- The client subscribes to postgres_changes on items/groups/columns/boards/
-- workspaces/notifications (memberSlice.subscribeToRealtime), but the
-- supabase_realtime publication only contained `profiles` — so no realtime
-- event for those tables was ever delivered. All perceived sync came from
-- reloads and the polling fallback. Add the tables the app listens to.
-- Idempotent: skips tables already in the publication.

do $$
declare
  t text;
begin
  foreach t in array array['items', 'groups', 'columns', 'boards', 'workspaces', 'notifications']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;
