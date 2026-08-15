-- Tracks how an admin-provisioned account is meant to log in.
--
-- 'google'   -> user signs in with "Continue with Google" using this email.
-- 'internal' -> alias/functional email with no real Google account behind
--               it; user signs in with email + a password they set
--               themselves via the invite-link setup flow.
--
-- Defaults to 'google' for all existing rows, since that already matches
-- how nearly everyone in the org signs in today.

alter table public.profiles
  add column if not exists auth_type text not null default 'google';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_auth_type_check'
  ) then
    alter table public.profiles
      add constraint profiles_auth_type_check check (auth_type in ('google', 'internal'));
  end if;
end $$;

comment on column public.profiles.auth_type is
  'How this account authenticates: google (OAuth) or internal (email + self-set password).';
