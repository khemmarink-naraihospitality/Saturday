-- =====================================================
-- Security Fix v5: Complete Wipe & Rebuild
-- =====================================================
-- This script explicitly drops ALL existing policies on the concerned tables 
-- to guarantee no "OR" condition recursion from old policies.
-- It then rebuilds them using PLPGSQL helper functions to guarantee that
-- PostgreSQL does not inline the SECURITY DEFINER check (which causes 500 errors).
-- =====================================================

DO $$ 
DECLARE 
  pol RECORD; 
BEGIN 
  FOR pol IN 
    SELECT policyname, tablename 
    FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename IN ('workspaces', 'workspace_members', 'boards', 'board_members', 'groups', 'columns', 'items') 
  LOOP 
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, pol.tablename); 
  END LOOP; 
END $$;


-- 1. Helper Functions (PLPGSQL prevents inlining)
CREATE OR REPLACE FUNCTION is_workspace_member(ws_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM workspace_members 
    WHERE workspace_id = ws_id AND user_id = auth.uid() AND role != 'board-guest'
  );
END;
$$;

CREATE OR REPLACE FUNCTION is_board_guest_of_workspace(ws_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM workspace_members 
    WHERE workspace_id = ws_id AND user_id = auth.uid() AND role = 'board-guest'
  );
END;
$$;

CREATE OR REPLACE FUNCTION is_board_member(_board_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM board_members
    WHERE board_id = _board_id AND user_id = auth.uid()
  );
END;
$$;


-- 2. Workspace Management
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view accessible workspaces" ON workspaces
FOR SELECT USING (
  owner_id = auth.uid() OR
  is_workspace_member(id) OR
  is_board_guest_of_workspace(id)
);


-- 3. Board Management
ALTER TABLE boards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view accessible boards" ON boards
FOR SELECT USING (
  workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid()) OR
  is_workspace_member(workspace_id) OR
  is_board_member(id)
);

CREATE POLICY "Users can create boards" ON boards
FOR INSERT WITH CHECK (
  workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid()) OR
  is_workspace_member(workspace_id)
);

CREATE POLICY "Users can update their boards" ON boards
FOR UPDATE USING (
  workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid()) OR
  is_board_member(id)
);

CREATE POLICY "Users can delete their boards" ON boards
FOR DELETE USING (
  workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid()) OR
  is_board_member(id)
);


-- 4. Groups Management
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage groups" ON groups
FOR ALL USING (
  board_id IN (
    SELECT b.id FROM boards b 
    WHERE b.workspace_id IN (SELECT w.id FROM workspaces w WHERE w.owner_id = auth.uid()) 
       OR is_workspace_member(b.workspace_id) 
       OR is_board_member(b.id)
  )
);


-- 5. Columns Management
ALTER TABLE columns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage columns" ON columns
FOR ALL USING (
  board_id IN (
    SELECT b.id FROM boards b 
    WHERE b.workspace_id IN (SELECT w.id FROM workspaces w WHERE w.owner_id = auth.uid()) 
       OR is_workspace_member(b.workspace_id) 
       OR is_board_member(b.id)
  )
);


-- 6. Items Management
ALTER TABLE items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage items" ON items
FOR ALL USING (
  board_id IN (
    SELECT b.id FROM boards b 
    WHERE b.workspace_id IN (SELECT w.id FROM workspaces w WHERE w.owner_id = auth.uid()) 
       OR is_workspace_member(b.workspace_id) 
       OR is_board_member(b.id)
  )
);


-- 7. Fix Member Tables
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view workspace members" ON workspace_members
FOR SELECT USING (
  user_id = auth.uid() OR
  is_workspace_member(workspace_id) OR 
  workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid())
);

CREATE POLICY "Clients can insert member rows" ON workspace_members
FOR INSERT WITH CHECK ( auth.uid() IS NOT NULL );

CREATE POLICY "Clients can update/delete workspace members" ON workspace_members
FOR ALL USING (
  auth.uid() = user_id OR
  is_workspace_member(workspace_id) OR
  workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid())
);


-- 8. Board Members
ALTER TABLE board_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view board members" ON board_members
FOR SELECT USING (
  user_id = auth.uid() OR
  is_board_member(board_id) OR
  board_id IN (SELECT b.id FROM boards b WHERE b.workspace_id IN (SELECT w.id FROM workspaces w WHERE w.owner_id = auth.uid()))
);

CREATE POLICY "Clients can insert board members" ON board_members
FOR INSERT WITH CHECK ( auth.uid() IS NOT NULL );

CREATE POLICY "Clients can update/delete board members" ON board_members
FOR ALL USING (
  auth.uid() = user_id OR
  is_board_member(board_id) OR
  board_id IN (SELECT b.id FROM boards b WHERE b.workspace_id IN (SELECT w.id FROM workspaces w WHERE w.owner_id = auth.uid()))
);
