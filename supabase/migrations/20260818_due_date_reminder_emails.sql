-- Adds email delivery to due-date reminders, alongside the existing
-- in-app notification. Until now notify_due_date_reminders() only ever
-- did `insert into notifications (...)` — this makes it also call the
-- invite-user Edge Function via pg_net so assignees get an email too,
-- using a new 'due_date_reminder' action (same pattern as the
-- 'status_update' action added for status-change notifications, except
-- that one fires from client-side JS on a user action and this one fires
-- from an unattended nightly pg_cron job, so the SQL function itself has
-- to make the HTTP call).
--
-- REQUIRES: same as pg_cron before it, "pg_net" needs the extension
-- enabled — usually fine via `create extension` below, but if the
-- Supabase project restricts it, enable it from the Dashboard first
-- (Database > Extensions) then re-run this file.

create extension if not exists pg_net with schema extensions;

create or replace function public.notify_due_date_reminders()
returns void
language plpgsql
security definer
set search_path = public
as $$
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
    join columns c on c.board_id = i.board_id and c.type = 'due_date'
    join boards b on b.id = i.board_id
    where (i.values ->> c.id::text) ~ '^\d{4}-\d{2}-\d{2}$'
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
        where pc.board_id = rec.board_id and pc.type = 'people'
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
              'itemLink', 'https://saturdaycom.vercel.app'
            )
          );
        end if;
      end if;
    end loop;
  end loop;
end;
$$;

-- Same name, same signature, same schedule — cron.job needs no change.
-- Re-stated here (cron.schedule replaces a same-named job) so a fresh
-- database that runs only this file still ends up scheduled.
select cron.schedule(
  'due-date-reminders-daily',
  '0 8 * * *',
  $$select public.notify_due_date_reminders();$$
);
