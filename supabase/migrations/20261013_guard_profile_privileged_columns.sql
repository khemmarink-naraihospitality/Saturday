-- Users can no longer give themselves a role, approval or reactivation.
--
-- profiles' "Users update own" policy is `using (auth.uid() = id)` with nothing
-- about which columns change, and authenticated holds UPDATE on every column. So
-- any signed-in user could run, from the browser console,
--   supabase.from('profiles').update({ system_role: 'super_admin' }).eq('id', me)
-- and be a super admin — or approve themselves without an admin, or undo their
-- own deactivation, or put someone else's address in profiles.email (which
-- invitations and person lookups match on). "Admins can update all profiles"
-- had the same gap one level up: an it_admin could make themselves (or anyone)
-- super_admin, though the Admin console and admin-create-user only let an
-- it_admin hand out roles below their own.
--
-- Column grants can't fix this — the Admin console writes the same columns as
-- the same `authenticated` role — so a trigger checks who is asking:
--   * no auth.uid(): the server (auth's own triggers, service-role edge
--     functions, migrations) — allowed;
--   * super_admin: allowed;
--   * it_admin: may change system_role / is_approved / is_active / email only on
--     a row whose role stays below theirs, i.e. ordinary users;
--   * anyone on their own row: email only to their sign-in address, and
--     is_approved only to true when that address is a company domain
--     (App.tsx does this on first sign-in; is_auto_approved_email() is the list).
-- Everything else — name, avatar, reminder settings — is untouched by this.
--
-- INSERT is coerced rather than refused: loadUserData upserts the user's own
-- profile on every load, and the insert half of an upsert is only a proposal
-- (it conflicts, and the UPDATE half runs through the check above), so a
-- self-inserted row just gets the values the user already has, or a new user's
-- defaults.

create or replace function public.guard_profile_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
    caller uuid := auth.uid();
    caller_role text;
    caller_level int;
    auth_email text;
    mine public.profiles%rowtype;
begin
    if caller is null then
        return new;
    end if;

    select system_role into caller_role from public.profiles where id = caller;
    if caller_role = 'super_admin' then
        return new;
    end if;

    select email into auth_email from auth.users where id = caller;

    if tg_op = 'INSERT' then
        select * into mine from public.profiles where id = caller;
        new.system_role := coalesce(mine.system_role, 'user');
        new.is_active   := coalesce(mine.is_active, true);
        new.is_approved := coalesce(mine.is_approved, false) or public.is_auto_approved_email(auth_email);
        new.email       := auth_email;
        return new;
    end if;

    if new.system_role is not distinct from old.system_role
       and new.is_approved is not distinct from old.is_approved
       and new.is_active is not distinct from old.is_active
       and new.email is not distinct from old.email then
        return new;
    end if;

    caller_level := case caller_role when 'it_admin' then 2 else 1 end;
    if caller_level >= 2
       and (case old.system_role when 'super_admin' then 3 when 'it_admin' then 2 else 1 end) < caller_level
       and (case new.system_role when 'super_admin' then 3 when 'it_admin' then 2 else 1 end) < caller_level then
        return new;
    end if;

    if old.id = caller
       and new.system_role is not distinct from old.system_role
       and new.is_active is not distinct from old.is_active
       and (new.email is not distinct from old.email
            or lower(new.email) = lower(auth_email))
       and (new.is_approved is not distinct from old.is_approved
            or (new.is_approved and public.is_auto_approved_email(auth_email))) then
        return new;
    end if;

    raise exception 'Not allowed to change role, approval, active status or email on this profile'
        using errcode = '42501';
end;
$fn$;

revoke all on function public.guard_profile_privileged_columns() from public, anon, authenticated;

drop trigger if exists guard_profile_privileged_columns on public.profiles;
create trigger guard_profile_privileged_columns
    before insert or update on public.profiles
    for each row execute function public.guard_profile_privileged_columns();
