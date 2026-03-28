-- Fixes an issue where removing the 'board-guest' role caused workspaces to disappear
-- from the sidebar for users who only had board access.
-- This new definition checks the `board_members` table directly.

CREATE OR REPLACE FUNCTION public.is_board_guest_of_workspace(ws_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM boards b
    JOIN board_members bm ON b.id = bm.board_id
    WHERE b.workspace_id = ws_id AND bm.user_id = auth.uid()
  );
END;
$$;
