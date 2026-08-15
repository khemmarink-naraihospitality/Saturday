-- Makes the due-date reminder schedule (previously hardcoded to "7 days
-- before" + "due today") configurable from Admin Console > Due Date
-- Reminders, stored in system_settings under 'due_date_reminder_offsets'
-- as a JSON array of non-negative day counts, e.g. [7, 3, 1, 0].
-- Falls back to [7, 0] if that setting is missing/empty so the job never
-- breaks if it hasn't been configured yet.
--
-- Replaces the function from 20260814_due_date_reminders.sql in place
-- (create or replace) — no need to touch the existing cron.job entry,
-- it keeps calling the same function name on the same schedule.

create or replace function public.notify_due_date_reminders()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  assignee_id uuid;
  offsets int[];
begin
  select coalesce(array_agg(elem::int), array[7, 0])
    into offsets
    from system_settings, jsonb_array_elements_text(value) as elem
    where key = 'due_date_reminder_offsets';

  for rec in
    select
      i.id as item_id,
      i.board_id,
      i.title as item_title,
      i.values as item_values,
      ((i.values ->> c.id::text)::date - current_date) as days_until_due
    from items i
    join columns c on c.board_id = i.board_id and c.type = 'due_date'
    where (i.values ->> c.id::text) ~ '^\d{4}-\d{2}-\d{2}$'
      and ((i.values ->> c.id::text)::date - current_date) = any(offsets)
  loop
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
          and (n.data ->> 'milestone') = rec.days_until_due::text
      ) then
        insert into notifications (user_id, type, content, entity_id, data, is_read)
        values (
          assignee_id,
          'due_date_reminder',
          case
            when rec.days_until_due = 0 then format('"%s" is due today', rec.item_title)
            else format('"%s" is due in %s day%s', rec.item_title, rec.days_until_due, case when rec.days_until_due = 1 then '' else 's' end)
          end,
          rec.item_id,
          jsonb_build_object('board_id', rec.board_id, 'milestone', rec.days_until_due::text, 'status', 'pending'),
          false
        );
      end if;
    end loop;
  end loop;
end;
$$;

select cron.schedule(
  'due-date-reminders-daily',
  '0 8 * * *',
  $$select public.notify_due_date_reminders();$$
);
