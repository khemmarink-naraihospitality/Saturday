-- profiles.auth_type was added with `default 'google'` (20260815_add_profile_auth_type.sql),
-- so every profile that existed before that migration ran — including
-- accounts that actually signed up with email+password, like
-- businesstech@lubd.com — got silently defaulted to 'google', which is
-- wrong. Backfill from the real signup method recorded in auth.identities:
-- a profile whose only identity is the 'email' provider (password-based)
-- should be 'internal'; anything with a 'google' identity is left as-is.
update public.profiles p
set auth_type = 'internal'
where exists (
  select 1 from auth.identities i
  where i.user_id = p.id and i.provider = 'email'
)
and not exists (
  select 1 from auth.identities i2
  where i2.user_id = p.id and i2.provider = 'google'
);
