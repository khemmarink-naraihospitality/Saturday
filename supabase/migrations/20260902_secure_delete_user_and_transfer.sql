-- Harden delete_user, and add the ownership transfer it now depends on.
--
-- The deployed delete_user was SECURITY DEFINER with no role check inside and
-- EXECUTE granted to anon and PUBLIC, so anyone holding the (publicly shipped)
-- anon key could delete any account. It also ran
--     DELETE FROM public.workspaces WHERE owner_id = <victim>
-- which cascades to every board, group and item inside those workspaces.
--
-- After this migration deleting an account can no longer destroy content: the
-- function refuses while the target still owns anything, and admin_transfer_ownership
-- is the supported way to hand that content to someone else first.

-- ---------------------------------------------------------------------------
-- Transfer every workspace and board owned by one user to another.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_transfer_ownership(from_user uuid, to_user uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_caller_role text;
    v_target_active boolean;
    v_workspaces int := 0;
    v_boards int := 0;
BEGIN
    SELECT system_role INTO v_caller_role FROM profiles WHERE id = auth.uid();
    IF v_caller_role IS DISTINCT FROM 'super_admin' THEN
        RAISE EXCEPTION 'Only Super Admins can transfer ownership';
    END IF;

    IF from_user = to_user THEN
        RAISE EXCEPTION 'Cannot transfer ownership to the same user';
    END IF;

    SELECT is_active INTO v_target_active FROM profiles WHERE id = to_user;
    IF v_target_active IS NULL THEN
        RAISE EXCEPTION 'The person receiving ownership no longer exists';
    END IF;
    IF v_target_active = false THEN
        RAISE EXCEPTION 'Cannot transfer ownership to a deactivated account';
    END IF;

    -- Workspaces: owner_id is the source of truth for who owns one.
    UPDATE workspaces SET owner_id = to_user WHERE owner_id = from_user;
    GET DIAGNOSTICS v_workspaces = ROW_COUNT;

    -- Keep the membership rows consistent with the new owner_id. The new owner may
    -- not have had a row at all (workspace creators often don't), hence the upsert.
    INSERT INTO workspace_members (workspace_id, user_id, role)
    SELECT w.id, to_user, 'owner' FROM workspaces w WHERE w.owner_id = to_user
    ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = 'owner';

    UPDATE workspace_members SET role = 'member'
    WHERE user_id = from_user
      AND workspace_id IN (SELECT id FROM workspaces WHERE owner_id = to_user);

    -- Boards: ownership lives in board_members.role.
    SELECT count(*) INTO v_boards
    FROM board_members WHERE user_id = from_user AND role = 'owner';

    INSERT INTO board_members (board_id, user_id, role)
    SELECT bm.board_id, to_user, 'owner'
    FROM board_members bm
    WHERE bm.user_id = from_user AND bm.role = 'owner'
    ON CONFLICT (board_id, user_id) DO UPDATE SET role = 'owner';

    -- The outgoing owner keeps access as an admin rather than being cut loose;
    -- if they are about to be deleted the row goes with them anyway.
    UPDATE board_members SET role = 'admin'
    WHERE user_id = from_user AND role = 'owner';

    PERFORM log_activity(
        'ownership_transferred',
        'user',
        from_user,
        jsonb_build_object('to_user', to_user, 'workspaces', v_workspaces, 'boards', v_boards)
    );

    RETURN jsonb_build_object('workspaces', v_workspaces, 'boards', v_boards);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.admin_transfer_ownership(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_transfer_ownership(uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- delete_user: super-admin only, and never destructive to content.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_user(user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
    v_caller_role text;
    v_owned_workspaces int;
    v_owned_boards int;
BEGIN
    SELECT system_role INTO v_caller_role FROM profiles WHERE id = auth.uid();
    IF v_caller_role IS DISTINCT FROM 'super_admin' THEN
        RAISE EXCEPTION 'Only Super Admins can delete users';
    END IF;

    IF user_id = auth.uid() THEN
        RAISE EXCEPTION 'You cannot delete your own account';
    END IF;

    -- The guard that makes this safe. The client asks the admin to transfer first,
    -- but a stale tab or a direct API call would otherwise still reach the delete.
    SELECT count(*) INTO v_owned_workspaces FROM workspaces WHERE owner_id = delete_user.user_id;
    SELECT count(*) INTO v_owned_boards FROM board_members
        WHERE board_members.user_id = delete_user.user_id AND role = 'owner';

    IF v_owned_workspaces > 0 OR v_owned_boards > 0 THEN
        RAISE EXCEPTION
            'This user still owns % workspace(s) and % board(s). Transfer them to someone else before deleting.',
            v_owned_workspaces, v_owned_boards;
    END IF;

    -- Keep their authored activity readable rather than deleting the trail.
    UPDATE public.notifications SET actor_id = NULL WHERE actor_id = delete_user.user_id;

    -- No workspace deletion here: with the check above there is nothing owned left
    -- to delete, and content must never disappear as a side effect of removing a person.
    DELETE FROM auth.users WHERE id = delete_user.user_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.delete_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_user(uuid) TO authenticated;
