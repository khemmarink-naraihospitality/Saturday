-- Company-domain accounts are approved when they're created, not when they first
-- sign in.
--
-- Auto-approval for the company domains used to live only in the client
-- (App.tsx): on a user's own first sign-in it flipped profiles.is_approved. An
-- account made any other way — chiefly invite-user inviting someone who hasn't
-- signed in yet — got a profile with is_approved = false from handle_new_user,
-- showed as "Pending" in Admin > User Management, and sat there until an admin
-- approved it by hand, though nothing was waiting on that approval.
--
-- is_auto_approved_email() is now the server's list, kept in step with
-- ALLOWED_DOMAINS in src/App.tsx (change both together). handle_new_user sets
-- is_approved from it, and the "new user is waiting for approval" notification
-- uses it too — that trigger only skipped three of the six domains.

create or replace function public.is_auto_approved_email(_email text)
returns boolean
language sql
immutable
set search_path to 'public'
as $$
    select lower(split_part(coalesce(_email, ''), '@', 2)) in (
        'naraihospitality.com',
        'marasca.live',
        'lubd.com',
        'visitamanta.com',
        'riverineplace.com',
        'naraihotel.co.th'
    );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into public.profiles (id, email, full_name, avatar_url, is_approved)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url',
    public.is_auto_approved_email(new.email)
  );
  return new;
end;
$function$;

create or replace function public.handle_new_unapproved_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
    -- Only accounts that really are waiting on an admin.
    if new.is_approved = false and not public.is_auto_approved_email(new.email) then
        insert into public.notifications (
            user_id,
            actor_id,
            type,
            content,
            data,
            is_read
        ) values (
            '0bd65220-4756-4e2b-8f02-7cc360d072b2', -- Super Admin ID
            new.id,                                 -- The new user
            'user_pending_approval',
            'New user registration: ' || coalesce(new.full_name, new.email) || ' is waiting for approval.',
            jsonb_build_object(
                'email', new.email,
                'full_name', new.full_name,
                'status', 'pending'
            ),
            false
        );
    end if;
    return new;
end;
$function$;

-- Anyone already stuck: company-domain profiles still marked unapproved.
update public.profiles
set is_approved = true
where coalesce(is_approved, false) = false
  and public.is_auto_approved_email(email);
