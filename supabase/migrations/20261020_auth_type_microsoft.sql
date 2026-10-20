-- profiles.auth_type learns about Microsoft sign-in.
--
-- The column only knew 'google' and 'internal', and defaulted to 'google', so an
-- account created through Microsoft sign-in (Supabase's Azure provider,
-- 20261019_microsoft_signins_need_approval.sql) showed up in Admin > User
-- Management as "Google". 'microsoft' is now a value of its own:
--   * the handle_new_user trigger sets it when the account's first sign-in is
--     Microsoft (raw_app_meta_data provider 'azure'); everything else keeps the
--     'google' default it had;
--   * the two existing accounts whose only identity is Microsoft are corrected.
--     Accounts that also have a Google or email identity are left as they are.

alter table public.profiles
    drop constraint if exists profiles_auth_type_check;

alter table public.profiles
    add constraint profiles_auth_type_check check (auth_type in ('google', 'internal', 'microsoft'));

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into public.profiles (id, email, full_name, avatar_url, is_approved, auth_type)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url',
    public.is_auto_approved_email(new.email)
      and coalesce(new.raw_app_meta_data->>'provider', '') <> 'azure',
    case when coalesce(new.raw_app_meta_data->>'provider', '') = 'azure' then 'microsoft' else 'google' end
  );
  return new;
end;
$function$;

update public.profiles p
set auth_type = 'microsoft'
where p.auth_type = 'google'
  and exists (select 1 from auth.identities i where i.user_id = p.id and i.provider = 'azure')
  and not exists (select 1 from auth.identities i2 where i2.user_id = p.id and i2.provider in ('google', 'email'));
