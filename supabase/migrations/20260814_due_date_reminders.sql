-- Due Date reminders: notify every assignee on an item once when its
-- 'due_date'-type column value lands 7 days out, and again when it's due
-- today. No client-side trigger for this exists (it's not tied to a user
-- action), so it runs on a daily pg_cron schedule instead.
--
-- "Assignee" mirrors the same convention used elsewhere in the app (comment
-- notifications, WorkspaceDashboardPage's people stats): any 'people'-type
-- column's value on the item, not one hardcoded "Person" column.
--
-- Idempotent per (user, item, milestone): re-running the same day, or the
-- daily job simply firing again before the due date changes, never inserts
-- a second reminder for the same milestone.
--
-- REQUIRES: the "pg_cron" extension enabled first via the Supabase
-- Dashboard (Database > Extensions) — it needs a server-level config change
-- that plain SQL can't make on its own, so `create extension` alone is not
-- enough here. Enable it there, then run this migration.

create extension if not exists pg_cron with schema extensions;

create or replace function public.notify_due_date_reminders()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  assignee_id uuid;
begin
  for rec in
    select
      i.id as item_id,
      i.board_id,
      i.title as item_title,
      i.values as item_values,
      case
        when (i.values ->> c.id::text) = to_char(current_date, 'YYYY-MM-DD') then 'today'
        when (i.values ->> c.id::text) = to_char(current_date + 7, 'YYYY-MM-DD') then '7_days'
      end as milestone
    from items i
    join columns c on c.board_id = i.board_id and c.type = 'due_date'
    where (i.values ->> c.id::text) in (
      to_char(current_date, 'YYYY-MM-DD'),
      to_char(current_date + 7, 'YYYY-MM-DD')
    )
  loop
    -- People-column values are trusted to be user-id strings in normal use,
    -- but this runs unattended every night with no one to notice a bad row —
    -- filter to UUID-shaped strings before casting so one malformed/legacy
    -- value (e.g. a stray imported name string) can't abort the whole job.
    for assignee_id in
      select distinct elem::uuid
      from (
        select jsonb_array_elements_text(
          case jsonb_typeof(rec.item_values -> pc.id::text)
            when 'array' then rec.item_values -> pc.id::text
            when 'string' then jsonb_build_array(rec.item_values -> pc.id::text)
            else '[]'::jsonb
          end
        ) as elem
        from columns pc
        where pc.board_id = rec.board_id and pc.type = 'people'
      ) people_ids
      where elem ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    loop
      if not exists (
        select 1 from notifications n
        where n.user_id = assignee_id
          and n.entity_id = rec.item_id
          and n.type = 'due_date_reminder'
          and (n.data ->> 'milestone') = rec.milestone
      ) then
        insert into notifications (user_id, type, content, entity_id, data, is_read)
        values (
          assignee_id,
          'due_date_reminder',
          case rec.milestone
            when 'today' then format('"%s" is due today', rec.item_title)
            when '7_days' then format('"%s" is due in 7 days', rec.item_title)
          end,
          rec.item_id,
          jsonb_build_object('board_id', rec.board_id, 'milestone', rec.milestone, 'status', 'pending'),
          false
        );
      end if;
    end loop;
  end loop;
end;
$$;

select cron.schedule(
  'due-date-reminders-daily',
  '0 8 * * *', -- 08:00 UTC daily
  $$select public.notify_due_date_reminders();$$
);
