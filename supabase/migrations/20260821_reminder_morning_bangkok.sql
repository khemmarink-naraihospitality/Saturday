-- Move the daily due-date reminder from 08:00 UTC to 01:00 UTC.
--
-- 08:00 UTC lands at 3:00 PM in Bangkok (UTC+7), so what was meant as a
-- morning heads-up was arriving mid-afternoon — too late in the day to be
-- useful for something due that same day. 01:00 UTC is 08:00 in Bangkok.
--
-- Same calendar day on both sides of the conversion (01:00 UTC + 7h = 08:00
-- the same date), so the `current_date` comparisons inside
-- notify_due_date_reminders() — including the "due today" offset of 0 —
-- keep meaning exactly what they meant before. Only the clock time changes.
--
-- cron.schedule() replaces a job that already has this name, so re-running
-- this file is safe and no unschedule step is needed.

select cron.schedule(
  'due-date-reminders-daily',
  '0 1 * * *',
  $$select public.notify_due_date_reminders();$$
);
