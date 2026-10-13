-- Where each workspace dashboard's widgets sit and how big they are, per user.
--
-- Kept in the browser's localStorage this only lasted on one machine in one
-- browser; keyed by workspace id here it follows the account. {workspaceId:
-- {order: [...], sizes: {widgetId: {span, height}}}}. A user already may update
-- their own profile row, and guard_profile_privileged_columns only watches role,
-- approval, active and email, so no policy change is needed.

alter table public.profiles
    add column if not exists dashboard_layouts jsonb not null default '{}'::jsonb;
