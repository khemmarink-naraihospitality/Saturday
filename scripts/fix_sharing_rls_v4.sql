-- =====================================================
-- Security Fix v4: Cross-Visibility for Sharing
-- =====================================================
-- Purpose: 
-- 1. Ensure Shared Workspace members see all boards.
-- 2. Ensure Shared Board guests see ONLY that board.
-- 3. Ensure Groups, Columns, and Items inherit visibility.
-- =====================================================

-- 1. Helper Function to prevent RLS recursion
CREATE OR REPLACE FUNCTION is_workspace_member(ws_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM workspace_members 
    WHERE workspace_id = ws_id AND user_id = auth.uid() AND role != 'board-guest'
  );
$$;

CREATE OR REPLACE FUNCTION is_board_guest_of_workspace(ws_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM workspace_members 
    WHERE workspace_id = ws_id AND user_id = auth.uid() AND role = 'board-guest'
  );
$$;

CREATE OR REPLACE FUNCTION is_board_member(_board_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM board_members
    WHERE board_id = _board_id AND user_id = auth.uid()
  );
$$;


-- 2. Workspace Management
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view accessible workspaces" ON workspaces;
CREATE POLICY "Users can view accessible workspaces" ON workspaces
FOR SELECT USING (
  owner_id = auth.uid() OR
  is_workspace_member(id) OR
  is_board_guest_of_workspace(id)
);


-- 3. Board Management
ALTER TABLE boards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view accessible boards" ON boards;
CREATE POLICY "Users can view accessible boards" ON boards
FOR SELECT USING (
  workspace_id IN (SELECT w.id FROM workspaces w WHERE w.owner_id = auth.uid()) OR
  is_workspace_member(workspace_id) OR
  is_board_member(id)
);

DROP POLICY IF EXISTS "Users can create boards" ON boards;
CREATE POLICY "Users can create boards" ON boards
FOR INSERT WITH CHECK (
  workspace_id IN (SELECT w.id FROM workspaces w WHERE w.owner_id = auth.uid()) OR
  is_workspace_member(workspace_id)
);

DROP POLICY IF EXISTS "Users can update their boards" ON boards;
CREATE POLICY "Users can update their boards" ON boards
FOR UPDATE USING (
  workspace_id IN (SELECT w.id FROM workspaces w WHERE w.owner_id = auth.uid()) OR
  is_board_member(id)
);

DROP POLICY IF EXISTS "Users can delete their boards" ON boards;
CREATE POLICY "Users can delete their boards" ON boards
FOR DELETE USING (
  workspace_id IN (SELECT w.id FROM workspaces w WHERE w.owner_id = auth.uid()) OR
  is_board_member(id) -- you can restrict to owner if needed
);


-- 4. Groups Management
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage groups" ON groups;
CREATE POLICY "Users can manage groups" ON groups
FOR ALL USING (
  board_id IN (SELECT b.id FROM boards b WHERE 
    b.workspace_id IN (SELECT w.id FROM workspaces w WHERE w.owner_id = auth.uid()) OR
    is_workspace_member(b.workspace_id) OR
    is_board_member(b.id)
  )
);


-- 5. Columns Management
ALTER TABLE columns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage columns" ON columns;
CREATE POLICY "Users can manage columns" ON columns
FOR ALL USING (
  board_id IN (SELECT b.id FROM boards b WHERE 
    b.workspace_id IN (SELECT w.id FROM workspaces w WHERE w.owner_id = auth.uid()) OR
    is_workspace_member(b.workspace_id) OR
    is_board_member(b.id)
  )
);


-- 6. Items Management
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage items" ON items;
CREATE POLICY "Users can manage items" ON items
FOR ALL USING (
  board_id IN (SELECT b.id FROM boards b WHERE 
    b.workspace_id IN (SELECT w.id FROM workspaces w WHERE w.owner_id = auth.uid()) OR
    is_workspace_member(b.workspace_id) OR
    is_board_member(b.id)
  )
);

-- 7. Fix Member Tables (Ensure you can select your own rows)
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view workspace members" ON workspace_members;
CREATE POLICY "Users can view workspace members" ON workspace_members
FOR SELECT USING (
  user_id = auth.uid() OR
  workspace_id IN (SELECT w.id FROM workspaces w WHERE w.owner_id = auth.uid()) OR
  is_workspace_member(workspace_id)
);

-- Note: Inserting into members is usually handled securely, but if clients do it directly:
DROP POLICY IF EXISTS "Clients can insert member rows" ON workspace_members;
CREATE POLICY "Clients can insert member rows" ON workspace_members
FOR INSERT WITH CHECK ( auth.uid() IS NOT NULL );

DROP POLICY IF EXISTS "Clients can insert board members" ON board_members;
CREATE POLICY "Clients can insert board members" ON board_members
FOR INSERT WITH CHECK ( auth.uid() IS NOT NULL );

DROP POLICY IF EXISTS "Clients can update/delete workspace members" ON workspace_members;
CREATE POLICY "Clients can update/delete workspace members" ON workspace_members
FOR ALL USING (
  auth.uid() = user_id OR
  workspace_id IN (SELECT w.id FROM workspaces w WHERE w.owner_id = auth.uid())
);

DROP POLICY IF EXISTS "Clients can update/delete board members" ON board_members;
CREATE POLICY "Clients can update/delete board members" ON board_members
FOR ALL USING (
  auth.uid() = user_id OR
  board_id IN (SELECT b.id FROM boards b JOIN workspaces w ON b.workspace_id = w.id WHERE w.owner_id = auth.uid())
);
