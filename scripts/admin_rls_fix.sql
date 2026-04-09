-- =====================================================
-- RLS Fix: Super Admin Full Access
-- =====================================================

-- Create a helper function to identify super admins and it admins
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() AND system_role IN ('super_admin', 'it_admin')
  );
END;
$$;

-- 1. Updates to Workspaces
DROP POLICY IF EXISTS "Users can view accessible workspaces" ON workspaces;

CREATE POLICY "Users can view accessible workspaces" ON workspaces
FOR SELECT USING (
  is_admin() OR
  owner_id = auth.uid() OR
  is_workspace_member(id) OR
  is_board_guest_of_workspace(id)
);

-- 2. Updates to Boards
DROP POLICY IF EXISTS "Users can view accessible boards" ON boards;

CREATE POLICY "Users can view accessible boards" ON boards
FOR SELECT USING (
  is_admin() OR
  workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid()) OR
  is_workspace_member(workspace_id) OR
  is_board_member(id)
);

DROP POLICY IF EXISTS "Users can update their boards" ON boards;
CREATE POLICY "Users can update their boards" ON boards
FOR UPDATE USING (
  is_admin() OR
  workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid()) OR
  is_board_member(id)
);

DROP POLICY IF EXISTS "Users can delete their boards" ON boards;
CREATE POLICY "Users can delete their boards" ON boards
FOR DELETE USING (
  is_admin() OR
  workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid()) OR
  is_board_member(id)
);

-- 3. Groups
DROP POLICY IF EXISTS "Users can manage groups" ON groups;
CREATE POLICY "Users can manage groups" ON groups
FOR ALL USING (
  is_admin() OR
  board_id IN (
    SELECT b.id FROM boards b 
    WHERE b.workspace_id IN (SELECT w.id FROM workspaces w WHERE w.owner_id = auth.uid()) 
       OR is_workspace_member(b.workspace_id) 
       OR is_board_member(b.id)
  )
);

-- 4. Columns
DROP POLICY IF EXISTS "Users can manage columns" ON columns;
CREATE POLICY "Users can manage columns" ON columns
FOR ALL USING (
  is_admin() OR
  board_id IN (
    SELECT b.id FROM boards b 
    WHERE b.workspace_id IN (SELECT w.id FROM workspaces w WHERE w.owner_id = auth.uid()) 
       OR is_workspace_member(b.workspace_id) 
       OR is_board_member(b.id)
  )
);

-- 5. Items
DROP POLICY IF EXISTS "Users can manage items" ON items;
CREATE POLICY "Users can manage items" ON items
FOR ALL USING (
  is_admin() OR
  board_id IN (
    SELECT b.id FROM boards b 
    WHERE b.workspace_id IN (SELECT w.id FROM workspaces w WHERE w.owner_id = auth.uid()) 
       OR is_workspace_member(b.workspace_id) 
       OR is_board_member(b.id)
  )
);

-- 6. Workspace Members
DROP POLICY IF EXISTS "Users can view workspace members" ON workspace_members;
CREATE POLICY "Users can view workspace members" ON workspace_members
FOR SELECT USING (
  is_admin() OR
  user_id = auth.uid() OR
  is_workspace_member(workspace_id) OR 
  workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid())
);

DROP POLICY IF EXISTS "Clients can update/delete workspace members" ON workspace_members;
CREATE POLICY "Clients can update/delete workspace members" ON workspace_members
FOR ALL USING (
  is_admin() OR
  auth.uid() = user_id OR
  is_workspace_member(workspace_id) OR
  workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid())
);

-- 7. Board Members
DROP POLICY IF EXISTS "Users can view board members" ON board_members;
CREATE POLICY "Users can view board members" ON board_members
FOR SELECT USING (
  is_admin() OR
  user_id = auth.uid() OR
  is_board_member(board_id) OR
  board_id IN (SELECT b.id FROM boards b WHERE b.workspace_id IN (SELECT w.id FROM workspaces w WHERE w.owner_id = auth.uid()))
);

DROP POLICY IF EXISTS "Clients can update/delete board members" ON board_members;
CREATE POLICY "Clients can update/delete board members" ON board_members
FOR ALL USING (
  is_admin() OR
  auth.uid() = user_id OR
  is_board_member(board_id) OR
  board_id IN (SELECT b.id FROM boards b WHERE b.workspace_id IN (SELECT w.id FROM workspaces w WHERE w.owner_id = auth.uid()))
);
