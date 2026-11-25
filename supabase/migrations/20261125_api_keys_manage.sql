-- API keys, managed after they are made (user request 25-Nov-2026):
-- - Manage: change a key's name, what it may read and its expiry
--   (update_api_key), or give it a new key in place (rotate_api_key).
-- - Copy: an admin can copy a key again to send on. The key is kept encrypted
--   in Supabase Vault and only reveal_api_key (admins, logged) reads it back.
--   api_keys.key_hash is still what a request is checked against. Keys made
--   before this have nothing in the Vault (copyable = false): Regenerate gives
--   them a new key that can be copied.
-- A revoked key's Vault copy is deleted.

-- 1. Where a key's copy lives ---------------------------------------------------------

alter table public.api_keys add column if not exists secret_id uuid;
alter table public.api_keys add column if not exists copyable boolean generated always as (secret_id is not null) stored;
grant select (copyable) on public.api_keys to authenticated;

-- 2. Making a key keeps a copy in the Vault ---------------------------------------------

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

    v_key := 'nhg_' || translate(encode(gen_random_bytes(30), 'base64'), '+/=', '-_');

    insert into public.api_keys (name, key_prefix, key_hash, workspace_ids, board_ids, created_by, expires_at)
    values (btrim(p_name), left(v_key, 12), encode(digest(v_key, 'sha256'), 'hex'), v_folders, v_spaces, auth.uid(), p_expires_at)
    returning api_keys.id into v_id;

    update public.api_keys
       set secret_id = vault.create_secret(v_key, 'nhg_api_key:' || v_id, 'NHG WorkSpace API key "' || btrim(p_name) || '"')
     where api_keys.id = v_id;

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

-- 3. Manage: name, what it reads, expiry ----------------------------------------------------

create or replace function public.update_api_key(
    p_id uuid,
    p_name text,
    p_workspace_ids uuid[],
    p_board_ids uuid[],
    p_expires_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
    v_before public.api_keys%rowtype;
    v_folders uuid[] := coalesce(p_workspace_ids, '{}');
    v_spaces uuid[] := coalesce(p_board_ids, '{}');
begin
    if not public.is_admin() then
        raise exception 'Only an admin can change API keys' using errcode = '42501';
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

    select * into v_before from public.api_keys where api_keys.id = p_id and revoked_at is null for update;
    if not found then
        return false;
    end if;

    update public.api_keys
       set name = btrim(p_name), workspace_ids = v_folders, board_ids = v_spaces, expires_at = p_expires_at
     where api_keys.id = p_id;

    insert into public.activity_logs (actor_id, action_type, target_type, target_id, metadata)
    values (auth.uid(), 'api_key_updated', 'api_key', p_id, jsonb_build_object(
        'name', btrim(p_name),
        'old_name', v_before.name,
        'prefix', v_before.key_prefix,
        'folder_count', cardinality(v_folders),
        'space_count', cardinality(v_spaces),
        'old_folder_count', cardinality(v_before.workspace_ids),
        'old_space_count', cardinality(v_before.board_ids),
        'expires_at', p_expires_at
    ));
    return true;
end;
$$;

-- 4. Regenerate: a new key in place; the old one stops working at once -----------------

create or replace function public.rotate_api_key(p_id uuid)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_row public.api_keys%rowtype;
    v_key text;
begin
    if not public.is_admin() then
        raise exception 'Only an admin can regenerate API keys' using errcode = '42501';
    end if;
    select * into v_row from public.api_keys where api_keys.id = p_id and revoked_at is null for update;
    if not found then
        return null;
    end if;

    v_key := 'nhg_' || translate(encode(gen_random_bytes(30), 'base64'), '+/=', '-_');

    if v_row.secret_id is not null then
        perform vault.update_secret(v_row.secret_id, v_key);
    end if;
    update public.api_keys
       set key_hash = encode(digest(v_key, 'sha256'), 'hex'),
           key_prefix = left(v_key, 12),
           secret_id = coalesce(v_row.secret_id, vault.create_secret(v_key, 'nhg_api_key:' || p_id, 'NHG WorkSpace API key "' || v_row.name || '"'))
     where api_keys.id = p_id;

    insert into public.activity_logs (actor_id, action_type, target_type, target_id, metadata)
    values (auth.uid(), 'api_key_rotated', 'api_key', p_id, jsonb_build_object(
        'name', v_row.name, 'old_prefix', v_row.key_prefix, 'prefix', left(v_key, 12)
    ));
    return v_key;
end;
$$;

-- 5. Copy: the key again, for an admin to send on (logged) -------------------------------

create or replace function public.reveal_api_key(p_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
    v_row public.api_keys%rowtype;
    v_key text;
begin
    if not public.is_admin() then
        raise exception 'Only an admin can copy API keys' using errcode = '42501';
    end if;
    select * into v_row from public.api_keys where api_keys.id = p_id and revoked_at is null;
    if not found or v_row.secret_id is null then
        return null;
    end if;
    select decrypted_secret into v_key from vault.decrypted_secrets where vault.decrypted_secrets.id = v_row.secret_id;
    if v_key is null then
        return null;
    end if;
    insert into public.activity_logs (actor_id, action_type, target_type, target_id, metadata)
    values (auth.uid(), 'api_key_copied', 'api_key', p_id, jsonb_build_object('name', v_row.name, 'prefix', v_row.key_prefix));
    return v_key;
end;
$$;

-- 6. Revoking also deletes the Vault copy --------------------------------------------------

create or replace function public.revoke_api_key(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
    v_name text;
    v_prefix text;
    v_secret uuid;
begin
    if not public.is_admin() then
        raise exception 'Only an admin can revoke API keys' using errcode = '42501';
    end if;
    update public.api_keys
       set revoked_at = now(), revoked_by = auth.uid()
     where api_keys.id = p_id and revoked_at is null
    returning name, key_prefix, secret_id into v_name, v_prefix, v_secret;
    if not found then
        return false;
    end if;
    if v_secret is not null then
        delete from vault.secrets where vault.secrets.id = v_secret;
        update public.api_keys set secret_id = null where api_keys.id = p_id;
    end if;
    insert into public.activity_logs (actor_id, action_type, target_type, target_id, metadata)
    values (auth.uid(), 'api_key_revoked', 'api_key', p_id, jsonb_build_object('name', v_name, 'prefix', v_prefix));
    return true;
end;
$$;

revoke execute on function public.update_api_key(uuid, text, uuid[], uuid[], timestamptz) from public, anon;
revoke execute on function public.rotate_api_key(uuid) from public, anon;
revoke execute on function public.reveal_api_key(uuid) from public, anon;
grant execute on function public.update_api_key(uuid, text, uuid[], uuid[], timestamptz) to authenticated;
grant execute on function public.rotate_api_key(uuid) to authenticated;
grant execute on function public.reveal_api_key(uuid) to authenticated;
