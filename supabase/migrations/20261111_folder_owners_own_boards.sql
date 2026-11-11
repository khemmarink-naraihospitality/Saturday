-- A Space Folder's owners own every board in it, and in its sub-folders (11-Nov-2026).
--
-- The user: "when an Owner is added or changed at the Workspace or Folder level, it
-- should apply to the Boards too, by adding that person's rights to each Board".
--
-- Until now a folder's owner reached its boards only through workspaces.owner_id
-- in RLS and usePermission: they were in no board's member list, a board role
-- they already had (admin, member) was what the app used on that board, an owner
-- set through workspace_members.role (Admin Console) could not change a board at
-- all (is_workspace_member() leaves 'owner' out), and nothing reached the boards
-- of sub-folders (workspaces.parent_id; 486 of the boards live in one).
--
-- The rule, kept by the triggers below whatever made the change (the share modal,
-- an ownership transfer, the Admin Console, admin_transfer_ownership, a board
-- created, duplicated, imported or moved, a folder moved under another):
--   every owner of a folder (workspaces.owner_id, or workspace_members.role
--   'owner') and of every folder above it has role 'owner' in board_members on
--   each board of that folder.
-- A missing row is added, a lower role is raised to owner. Nothing is ever taken
-- away: an outgoing owner keeps the board rights they had (an ownership transfer
-- already demotes them at folder level; admin_transfer_ownership makes them admin).
-- Each grant to a person is written to the activity log
-- (workspace_owner_applied_to_boards), except the one-time backfill at the end.

-- The folder and every folder below it (cycles and depth guarded).
CREATE OR REPLACE FUNCTION public.folder_and_below(p_folder uuid)
RETURNS TABLE (folder_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    WITH RECURSIVE down AS (
        SELECT w.id, ARRAY[w.id] AS path FROM workspaces w WHERE w.id = p_folder
        UNION ALL
        SELECT c.id, d.path || c.id FROM workspaces c JOIN down d ON c.parent_id = d.id
        WHERE NOT c.id = ANY (d.path) AND array_length(d.path, 1) < 12
    )
    SELECT id FROM down;
$$;

-- The owners of a folder and of every folder above it.
CREATE OR REPLACE FUNCTION public.folder_owners_above(p_folder uuid)
RETURNS TABLE (user_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    WITH RECURSIVE up AS (
        SELECT w.id, w.parent_id, ARRAY[w.id] AS path FROM workspaces w WHERE w.id = p_folder
        UNION ALL
        SELECT p.id, p.parent_id, u.path || p.id FROM workspaces p JOIN up u ON p.id = u.parent_id
        WHERE NOT p.id = ANY (u.path) AND array_length(u.path, 1) < 12
    )
    SELECT w.owner_id FROM up JOIN workspaces w ON w.id = up.id WHERE w.owner_id IS NOT NULL
    UNION
    SELECT wm.user_id FROM up JOIN workspace_members wm ON wm.workspace_id = up.id WHERE wm.role = 'owner';
$$;

-- Make one person owner of every board in a folder and the folders below it.
-- Returns how many rows were added or raised; logs them when asked to.
CREATE OR REPLACE FUNCTION public.apply_owner_to_folder_boards(p_folder uuid, p_user uuid, p_log boolean DEFAULT true)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_count integer := 0;
BEGIN
    IF p_folder IS NULL OR p_user IS NULL THEN
        RETURN 0;
    END IF;

    INSERT INTO board_members (board_id, user_id, role)
    SELECT b.id, p_user, 'owner'
    FROM boards b
    WHERE b.workspace_id IN (SELECT folder_id FROM folder_and_below(p_folder))
    ON CONFLICT (board_id, user_id) DO UPDATE SET role = 'owner'
    WHERE board_members.role IS DISTINCT FROM 'owner';
    GET DIAGNOSTICS v_count = ROW_COUNT;

    IF v_count > 0 AND p_log THEN
        PERFORM log_activity(
            'workspace_owner_applied_to_boards',
            'workspace',
            p_folder,
            jsonb_build_object(
                'user_id', p_user,
                'user_name', (SELECT coalesce(full_name, email) FROM profiles WHERE id = p_user),
                'boards', v_count
            )
        );
    END IF;
    RETURN v_count;
END;
$$;

-- Folder side: a new owner (owner_id set or changed), or the folder moved under
-- another one (the owners above it now reach its boards).
CREATE OR REPLACE FUNCTION public.trg_folder_owner_to_boards()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_owner uuid;
BEGIN
    IF NEW.owner_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.owner_id IS DISTINCT FROM OLD.owner_id) THEN
        PERFORM apply_owner_to_folder_boards(NEW.id, NEW.owner_id);
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.parent_id IS NOT NULL AND NEW.parent_id IS DISTINCT FROM OLD.parent_id THEN
        FOR v_owner IN SELECT user_id FROM folder_owners_above(NEW.parent_id) LOOP
            PERFORM apply_owner_to_folder_boards(NEW.id, v_owner);
        END LOOP;
    END IF;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS folder_owner_to_boards ON public.workspaces;
CREATE TRIGGER folder_owner_to_boards
    AFTER INSERT OR UPDATE OF owner_id, parent_id ON public.workspaces
    FOR EACH ROW EXECUTE FUNCTION public.trg_folder_owner_to_boards();

-- Membership side: someone given the owner role on a folder.
CREATE OR REPLACE FUNCTION public.trg_folder_member_owner_to_boards()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    IF NEW.role = 'owner' AND (
        TG_OP = 'INSERT'
        OR OLD.role IS DISTINCT FROM 'owner'
        OR OLD.user_id IS DISTINCT FROM NEW.user_id
        OR OLD.workspace_id IS DISTINCT FROM NEW.workspace_id
    ) THEN
        PERFORM apply_owner_to_folder_boards(NEW.workspace_id, NEW.user_id);
    END IF;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS folder_member_owner_to_boards ON public.workspace_members;
CREATE TRIGGER folder_member_owner_to_boards
    AFTER INSERT OR UPDATE OF role, user_id, workspace_id ON public.workspace_members
    FOR EACH ROW EXECUTE FUNCTION public.trg_folder_member_owner_to_boards();

-- Board side: a board created in a folder, or moved into one, gets the owners of
-- that folder and the folders above it. On a new board the person creating it is
-- left out: every client path adds its creator as owner itself right after the
-- insert (boardSlice, workspaceSlice, backupService), and a row already there
-- would make that insert fail.
CREATE OR REPLACE FUNCTION public.trg_board_folder_owners()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_creator uuid := auth.uid();
BEGIN
    IF NEW.workspace_id IS NULL OR (TG_OP = 'UPDATE' AND NEW.workspace_id IS NOT DISTINCT FROM OLD.workspace_id) THEN
        RETURN NULL;
    END IF;
    INSERT INTO board_members (board_id, user_id, role)
    SELECT NEW.id, o.user_id, 'owner'
    FROM folder_owners_above(NEW.workspace_id) o
    WHERE NOT (TG_OP = 'INSERT' AND o.user_id IS NOT DISTINCT FROM v_creator)
    ON CONFLICT (board_id, user_id) DO UPDATE SET role = 'owner'
    WHERE board_members.role IS DISTINCT FROM 'owner';
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS board_folder_owners ON public.boards;
CREATE TRIGGER board_folder_owners
    AFTER INSERT OR UPDATE OF workspace_id ON public.boards
    FOR EACH ROW EXECUTE FUNCTION public.trg_board_folder_owners();

-- Server-side only: nobody calls these from the browser (anyone who could would
-- make themselves owner of a folder's boards).
REVOKE ALL ON FUNCTION public.folder_and_below(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.folder_owners_above(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_owner_to_folder_boards(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_folder_owner_to_boards() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_folder_member_owner_to_boards() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_board_folder_owners() FROM PUBLIC, anon, authenticated;

-- One-time backfill: the owners there are today, on every board below them
-- (11-Nov-2026: 10 people, about 93 boards; not logged one by one).
INSERT INTO board_members (board_id, user_id, role)
SELECT DISTINCT b.id, o.user_id, 'owner'
FROM boards b
CROSS JOIN LATERAL folder_owners_above(b.workspace_id) o
WHERE b.workspace_id IS NOT NULL
ON CONFLICT (board_id, user_id) DO UPDATE SET role = 'owner'
WHERE board_members.role IS DISTINCT FROM 'owner';
