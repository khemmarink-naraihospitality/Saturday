-- Accounts made through Microsoft sign-in wait for an admin's approval.
--
-- Company-domain accounts are approved the moment they are created
-- (20261011_auto_approve_company_domains.sql). Microsoft sign-in (Supabase's
-- Azure provider) is new, and for now an admin approves each account it
-- creates in Admin > User Management before the person gets in — whatever the
-- domain. Only the account's first sign-in method counts (raw_app_meta_data
-- 'provider'): someone who already has an account and signs in with Microsoft
-- later keeps the approval they have. App.tsx applies the same rule on the
-- client (first-sign-in approval and the Pending gate).
--
-- Also: Microsoft sends the person's name as "name", not "full_name".

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
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url',
    public.is_auto_approved_email(new.email)
      and coalesce(new.raw_app_meta_data->>'provider', '') <> 'azure'
  );
  return new;
end;
$function$;

-- The super admin hears about every account left waiting — a company-domain
-- one made through Microsoft now waits too.
create or replace function public.handle_new_unapproved_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
    if new.is_approved = false then
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
