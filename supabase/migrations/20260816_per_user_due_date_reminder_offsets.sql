-- Per-user override for the due-date reminder schedule.
--
-- Until now the schedule was org-wide only: one array in
-- system_settings('due_date_reminder_offsets'), applied to everybody
-- (20260815_configurable_due_date_reminder_offsets.sql). This adds a
-- per-user override, edited from the profile dropdown > "Notification
-- Settings" modal in the app.
--
--   profiles.due_date_reminder_offsets IS NULL -> inherit the org default
--   profiles.due_date_reminder_offsets = [14,3,0] -> use exactly these
--   profiles.due_date_reminder_offsets = []       -> this user gets none
--
-- Because the offsets are now per-assignee, the item-level pre-filter in
-- the previous version ("only look at items whose due date is exactly N
-- days out, for the one global N list") is no longer sufficient on its
-- own. It is kept as a *superset* filter — the union of the org default
-- and every user's personal array — so the items scan stays cheap, and
-- the authoritative per-assignee match happens inside the loop.

alter table public.profiles
  add column if not exists due_date_reminder_offsets jsonb;

comment on column public.profiles.due_date_reminder_offsets is
  'Per-user due-date reminder day offsets (0 = due today). NULL = inherit '
  'system_settings.due_date_reminder_offsets. [] = no reminders for this user.';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_due_date_reminder_offsets_is_array'
  ) then
    alter table public.profiles
      add constraint profiles_due_date_reminder_offsets_is_array
      check (
        due_date_reminder_offsets is null
        or jsonb_typeof(due_date_reminder_offsets) = 'array'
      );
  end if;
end $$;

-- A user must be able to update their OWN row's new column through the
-- anon-key client. An equivalent self-update policy almost certainly
-- already exists (the app already self-updates profiles.is_approved),
-- but it was created outside this repo, so add a narrowly-named one of
-- our own — additive, cannot break a broader existing policy — plus an
-- explicit column-level grant in case UPDATE is column-restricted.
alter table public.profiles enable row level security;

drop policy if exists "Users can update their own due date reminder offsets" on public.profiles;
create policy "Users can update their own due date reminder offsets"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

grant update (due_date_reminder_offsets) on public.profiles to authenticated;

create or replace function public.notify_due_date_reminders()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  assignee_id uuid;
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
      ((i.values ->> c.id::text)::date - current_date) as days_until_due
    from items i
    join columns c on c.board_id = i.board_id and c.type = 'due_date'
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
      -- Resolve THIS assignee's schedule. No row (assignee id points at a
      -- deleted profile) leaves user_raw NULL -> org default.
      select p.due_date_reminder_offsets
        into user_raw
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

      -- Idempotent per (user, item, day-count): re-running today, or the
      -- daily job firing again before the due date changes, never inserts
      -- a duplicate.
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
            else format('"%s" is due in %s day%s', rec.item_title, rec.days_until_due,
                        case when rec.days_until_due = 1 then '' else 's' end)
          end,
          rec.item_id,
          jsonb_build_object('board_id', rec.board_id,
                             'milestone', rec.days_until_due::text,
                             'status', 'pending'),
          false
        );
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
