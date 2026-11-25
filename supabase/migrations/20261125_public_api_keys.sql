-- NHG WorkSpace API (user request 25-Nov-2026): other systems read Spaces,
-- tasks and comments through the `api` Edge Function with a key.
--
-- - Keys are made and revoked by admins (Admin › API Keys), each limited to
--   the folders (with every folder under them) and Spaces chosen for it.
-- - Only a SHA-256 of a key is kept: the key itself is shown once, when made.
-- - Read only. Private (PIN) Spaces and anything in the Trash are never served
--   (the function enforces both).
-- - Every request is logged (api_request_log, 90 days) and a key may make 120
--   a minute.

-- 1. The keys -------------------------------------------------------------------

create table if not exists public.api_keys (
    id uuid primary key default gen_random_uuid(),
    name text not null check (length(btrim(name)) between 1 and 80),
    key_prefix text not null,
    key_hash text not null unique,
    workspace_ids uuid[] not null default '{}',
    board_ids uuid[] not null default '{}',
    created_by uuid references public.profiles(id) on delete set null,
    created_at timestamptz not null default now(),
    expires_at timestamptz,
    last_used_at timestamptz,
    request_count bigint not null default 0,
    revoked_at timestamptz,
    revoked_by uuid references public.profiles(id) on delete set null,
    constraint api_keys_has_scope check (cardinality(workspace_ids) + cardinality(board_ids) > 0)
);

alter table public.api_keys enable row level security;

drop policy if exists "Admins read API keys" on public.api_keys;
create policy "Admins read API keys" on public.api_keys
    for select to authenticated using (public.is_admin());

-- Nobody writes from the browser (create / revoke go through the functions
-- below), and the hash is never sent there.
revoke all on public.api_keys from anon, authenticated;
grant select (id, name, key_prefix, workspace_ids, board_ids, created_by, created_at, expires_at, last_used_at, request_count, revoked_at, revoked_by)
    on public.api_keys to authenticated;

-- 2. What each key asked for ---------------------------------------------------------

create table if not exists public.api_request_log (
    id bigint generated always as identity primary key,
    key_id uuid not null references public.api_keys(id) on delete cascade,
    at timestamptz not null default now(),
    method text not null,
    path text not null,
    status smallint not null,
    ms integer,
    ip text
);

create index if not exists api_request_log_key_at on public.api_request_log (key_id, at desc);

alter table public.api_request_log enable row level security;

drop policy if exists "Admins read API requests" on public.api_request_log;
create policy "Admins read API requests" on public.api_request_log
    for select to authenticated using (public.is_admin());

revoke all on public.api_request_log from anon, authenticated;
grant select on public.api_request_log to authenticated;

-- 3. Making and revoking a key (admins) ----------------------------------------------

create or replace function public.create_api_key(
    p_name text,
    p_workspace_ids uuid[],
    p_board_ids uuid[],
    p_expires_at timestamptz default null
)
returns table (id uuid, api_key text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_key text;
    v_id uuid;
    v_folders uuid[] := coalesce(p_workspace_ids, '{}');
    v_spaces uuid[] := coalesce(p_board_ids, '{}');
begin
    if not public.is_admin() then
        raise exception 'Only an admin can create API keys' using errcode = '42501';
    end if;
    if coalesce(btrim(p_name), '') = '' then
        raise exception 'Give the key a name' using errcode = '22023';
    end if;
    if cardinality(v_folders) + cardinality(v_spaces) = 0 then
        raise exception 'Choose at least one folder or space for the key' using errcode = '22023';
    end if;
    if p_expires_at is not null and p_expires_at <= now() then
        raise exception 'The expiry date has to be in the future' using errcode = '22023';
    end if;

    -- 30 random bytes: 40 characters of URL-safe base64 after "nhg_".
    v_key := 'nhg_' || translate(encode(gen_random_bytes(30), 'base64'), '+/=', '-_');

    insert into public.api_keys (name, key_prefix, key_hash, workspace_ids, board_ids, created_by, expires_at)
    values (btrim(p_name), left(v_key, 12), encode(digest(v_key, 'sha256'), 'hex'), v_folders, v_spaces, auth.uid(), p_expires_at)
    returning api_keys.id into v_id;

    insert into public.activity_logs (actor_id, action_type, target_type, target_id, metadata)
    values (auth.uid(), 'api_key_created', 'api_key', v_id, jsonb_build_object(
        'name', btrim(p_name),
        'prefix', left(v_key, 12),
        'folder_count', cardinality(v_folders),
        'space_count', cardinality(v_spaces),
        'expires_at', p_expires_at
    ));

    return query select v_id, v_key;
end;
$$;

create or replace function public.revoke_api_key(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
    v_name text;
    v_prefix text;
begin
    if not public.is_admin() then
        raise exception 'Only an admin can revoke API keys' using errcode = '42501';
    end if;
    update public.api_keys
       set revoked_at = now(), revoked_by = auth.uid()
     where api_keys.id = p_id and revoked_at is null
    returning name, key_prefix into v_name, v_prefix;
    if not found then
        return false;
    end if;
    insert into public.activity_logs (actor_id, action_type, target_type, target_id, metadata)
    values (auth.uid(), 'api_key_revoked', 'api_key', p_id, jsonb_build_object('name', v_name, 'prefix', v_prefix));
    return true;
end;
$$;

revoke execute on function public.create_api_key(text, uuid[], uuid[], timestamptz) from public, anon;
revoke execute on function public.revoke_api_key(uuid) from public, anon;
grant execute on function public.create_api_key(text, uuid[], uuid[], timestamptz) to authenticated;
grant execute on function public.revoke_api_key(uuid) to authenticated;

-- 4. For the Edge Function only (service role) ----------------------------------------

-- The key a request carries, by its hash, with how many requests it made in
-- the last minute; nothing for a revoked key.
create or replace function public.api_authenticate(p_hash text)
returns table (id uuid, name text, workspace_ids uuid[], board_ids uuid[], expires_at timestamptz, recent integer)
language sql
stable
security definer
set search_path = public
as $$
    select k.id, k.name, k.workspace_ids, k.board_ids, k.expires_at,
           (select count(*)::int from public.api_request_log l where l.key_id = k.id and l.at > now() - interval '1 minute')
      from public.api_keys k
     where k.key_hash = p_hash and k.revoked_at is null;
$$;

create or replace function public.api_record_request(
    p_key_id uuid, p_method text, p_path text, p_status integer, p_ms integer, p_ip text
)
returns void
language sql
security definer
set search_path = public
as $$
    insert into public.api_request_log (key_id, method, path, status, ms, ip)
    values (p_key_id, left(p_method, 10), left(p_path, 500), p_status, p_ms, left(p_ip, 100));
    update public.api_keys set last_used_at = now(), request_count = request_count + 1 where id = p_key_id;
$$;

revoke execute on function public.api_authenticate(text) from public, anon, authenticated;
revoke execute on function public.api_record_request(uuid, text, text, integer, integer, text) from public, anon, authenticated;
grant execute on function public.api_authenticate(text) to service_role;
grant execute on function public.api_record_request(uuid, text, text, integer, integer, text) to service_role;

-- 5. Keep 90 days of requests -------------------------------------------------------

select cron.schedule(
    'api-request-log-cleanup',
    '17 3 * * *',
    $$delete from public.api_request_log where at < now() - interval '90 days'$$
);
