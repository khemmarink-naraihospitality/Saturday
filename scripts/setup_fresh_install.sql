-- =====================================================
-- Workera Complete Database Setup Script (Clean Install)
-- =====================================================
-- This script sets up the entire database schema for Workera v1.1.1 Beta.
-- It is designed for a FRESH INSTALLATION.
-- It will DROP existing tables and recreate them to ensure a clean state.
-- =====================================================

-- 0. CLEANUP (WARNING: This drops all existing data in these tables)
DROP TABLE IF EXISTS activity_logs CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS items CASCADE;
DROP TABLE IF EXISTS columns CASCADE;
DROP TABLE IF EXISTS groups CASCADE;
DROP TABLE IF EXISTS board_members CASCADE;
DROP TABLE IF EXISTS boards CASCADE;
DROP TABLE IF EXISTS workspace_members CASCADE;
DROP TABLE IF EXISTS workspaces CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;

DROP FUNCTION IF EXISTS delete_user(UUID) CASCADE;
DROP FUNCTION IF EXISTS log_activity(TEXT, TEXT, UUID, JSONB) CASCADE;
DROP FUNCTION IF EXISTS trigger_log_board_created() CASCADE;
DROP FUNCTION IF EXISTS trigger_log_workspace_created() CASCADE;
DROP FUNCTION IF EXISTS trigger_log_user_signup() CASCADE;
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;
DROP FUNCTION IF EXISTS is_board_member(UUID) CASCADE;

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. TABLES

-- Profiles (Users)
CREATE TABLE profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    email TEXT,
    full_name TEXT,
    avatar_url TEXT,
    system_role TEXT DEFAULT 'user', -- 'user', 'it_admin', 'super_admin'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Workspaces
CREATE TABLE workspaces (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    title TEXT NOT NULL,
    owner_id UUID REFERENCES auth.users(id) NOT NULL,
    "order" INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Workspace Members
CREATE TABLE workspace_members (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'member', -- 'admin', 'member'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(workspace_id, user_id)
);

-- Boards
CREATE TABLE boards (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    "order" INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Board Members
CREATE TABLE board_members (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    board_id UUID REFERENCES boards(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'viewer', -- 'owner', 'editor', 'viewer'
    last_viewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(board_id, user_id)
);

-- Groups
CREATE TABLE groups (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    board_id UUID REFERENCES boards(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    color TEXT,
    "order" INTEGER DEFAULT 0
);

-- Columns
CREATE TABLE columns (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    board_id UUID REFERENCES boards(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    type TEXT NOT NULL,
    "order" INTEGER DEFAULT 0,
    width INTEGER,
    options JSONB DEFAULT '[]'::jsonb,
    aggregation TEXT
);

-- Items
CREATE TABLE items (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    board_id UUID REFERENCES boards(id) ON DELETE CASCADE,
    group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    "values" JSONB DEFAULT '{}'::jsonb,
    "order" INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    is_hidden BOOLEAN DEFAULT FALSE,
    updates JSONB DEFAULT '[]'::jsonb,
    files JSONB DEFAULT '[]'::jsonb
);

-- Notifications
CREATE TABLE notifications (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    actor_id UUID REFERENCES auth.users(id),
    type TEXT NOT NULL, -- 'mention', 'assignment', 'access_granted', 'workspace_invite', 'board_invite'
    content TEXT,
    message TEXT,
    entity_id UUID, -- link to item_id or board_id
    data JSONB, -- stores workspace_id, board_id, status etc for invites
    status TEXT, -- 'pending', 'accepted', 'declined' for invites
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Activity Logs
CREATE TABLE activity_logs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    action_type TEXT NOT NULL,
    target_type TEXT,
    target_id UUID,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Indexes for Performance
CREATE INDEX idx_activity_logs_actor_id ON activity_logs(actor_id);
CREATE INDEX idx_activity_logs_target ON activity_logs(target_type, target_id);
CREATE INDEX idx_items_board_id ON items(board_id);
CREATE INDEX idx_notifications_user_id ON notifications(user_id);


-- 3. FUNCTIONS & TRIGGERS

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_workspaces_updated_at BEFORE UPDATE ON workspaces FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_boards_updated_at BEFORE UPDATE ON boards FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_items_updated_at BEFORE UPDATE ON items FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- Function: Log Activity (Secured)
CREATE OR REPLACE FUNCTION log_activity(
    p_action_type TEXT,
    p_target_type TEXT DEFAULT NULL,
    p_target_id UUID DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_log_id UUID;
BEGIN
    INSERT INTO activity_logs (
        actor_id,
        action_type,
        target_type,
        target_id,
        metadata
    ) VALUES (
        auth.uid(),
        p_action_type,
        p_target_type,
        p_target_id,
        p_metadata
    )
    RETURNING id INTO v_log_id;
    
    RETURN v_log_id;
END;
$$;
GRANT EXECUTE ON FUNCTION log_activity TO authenticated;

-- Function: Delete User (Secured)
CREATE OR REPLACE FUNCTION delete_user(user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_email TEXT;
    v_user_name TEXT;
    v_current_user_role TEXT;
    v_target_user_role TEXT;
BEGIN
    SELECT system_role INTO v_current_user_role
    FROM profiles WHERE id = auth.uid();

    SELECT email, full_name, system_role
    INTO v_user_email, v_user_name, v_target_user_role
    FROM profiles WHERE id = user_id;

    IF v_user_email IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'User not found');
    END IF;

    IF v_current_user_role != 'super_admin' AND auth.uid() != user_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'Permission denied');
    END IF;

    PERFORM log_activity(
        'user_deleted',
        'user',
        user_id,
        jsonb_build_object(
            'email', v_user_email,
            'full_name', v_user_name,
            'system_role', v_target_user_role
        )
    );

    DELETE FROM notifications WHERE user_id = user_id OR actor_id = user_id;
    DELETE FROM board_members WHERE user_id = user_id;
    DELETE FROM workspace_members WHERE user_id = user_id;
    DELETE FROM workspaces WHERE owner_id = user_id;
    DELETE FROM profiles WHERE id = user_id;

    RETURN jsonb_build_object('success', true, 'message', 'User data deleted successfully');
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
GRANT EXECUTE ON FUNCTION delete_user TO authenticated;

-- Trigger: Log User Signup (Profiles Insert)
CREATE OR REPLACE FUNCTION trigger_log_user_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO activity_logs (
        actor_id, action_type, target_type, target_id, metadata
    ) VALUES (
        NEW.id, 'user_signup', 'user', NEW.id,
        jsonb_build_object(
            'email', NEW.email,
            'full_name', NEW.full_name,
            'system_role', NEW.system_role
        )
    );
    RETURN NEW;
END;
$$;
CREATE TRIGGER on_user_signup_log AFTER INSERT ON profiles FOR EACH ROW EXECUTE FUNCTION trigger_log_user_signup();

-- Trigger: Workspace Created
CREATE OR REPLACE FUNCTION trigger_log_workspace_created()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public
AS $$
BEGIN
    INSERT INTO activity_logs (
        actor_id, action_type, target_type, target_id, metadata
    ) VALUES (
        auth.uid(), 'workspace_created', 'workspace', NEW.id,
        jsonb_build_object('workspace_title', NEW.title, 'workspace_id', NEW.id)
    );
    RETURN NEW;
END;
$$;
CREATE TRIGGER on_workspace_created_log AFTER INSERT ON workspaces FOR EACH ROW EXECUTE FUNCTION trigger_log_workspace_created();

-- Trigger: Board Created
CREATE OR REPLACE FUNCTION trigger_log_board_created()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public
AS $$
DECLARE v_workspace_title TEXT;
BEGIN
    SELECT title INTO v_workspace_title FROM workspaces WHERE id = NEW.workspace_id;
    INSERT INTO activity_logs (
        actor_id, action_type, target_type, target_id, metadata
    ) VALUES (
        auth.uid(), 'board_created', 'board', NEW.id,
        jsonb_build_object(
            'board_title', NEW.title,
            'board_id', NEW.id,
            'workspace_title', COALESCE(v_workspace_title, 'Unknown'),
            'workspace_id', NEW.workspace_id
        )
    );
    RETURN NEW;
END;
$$;
CREATE TRIGGER on_board_created_log AFTER INSERT ON boards FOR EACH ROW EXECUTE FUNCTION trigger_log_board_created();

-- 4. HELPER FUNCTIONS FOR RLS (Security Definer)

-- Helper: Check if user is a board member (solves infinite recursion)
CREATE OR REPLACE FUNCTION is_board_member(_board_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM board_members
    WHERE board_id = _board_id
    AND user_id = auth.uid()
  );
$$;

-- Helper: Check if user has access to any board in a workspace (solves infinite recursion)
CREATE OR REPLACE FUNCTION has_board_access_in_workspace(_workspace_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM boards b
    JOIN board_members bm ON b.id = bm.board_id
    WHERE b.workspace_id = _workspace_id
    AND bm.user_id = auth.uid()
  );
$$;

-- 5. RLS POLICIES

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE board_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

-- Profiles
CREATE POLICY "Authenticated users can see all profiles" ON profiles FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Users can insert their own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Workspaces
CREATE POLICY "Users can view accessible workspaces" ON workspaces FOR SELECT USING (
  owner_id = auth.uid() OR
  id IN (SELECT m.workspace_id FROM workspace_members m WHERE m.user_id = auth.uid()) OR
  has_board_access_in_workspace(id)
);
CREATE POLICY "Users can create workspaces" ON workspaces FOR INSERT WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Users can update their workspaces" ON workspaces FOR UPDATE USING (owner_id = auth.uid());
CREATE POLICY "Users can delete their workspaces" ON workspaces FOR DELETE USING (owner_id = auth.uid());

-- Workspace Members
CREATE POLICY "Members viewable by members" ON workspace_members FOR SELECT USING (
    workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid()) OR
    workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
);
CREATE POLICY "Owners can manage members" ON workspace_members FOR ALL USING (
    workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid())
);

-- Boards
CREATE POLICY "Users can view accessible boards" ON boards FOR SELECT USING (
  workspace_id IN (SELECT w.id FROM workspaces w WHERE w.owner_id = auth.uid()) OR
  workspace_id IN (SELECT m.workspace_id FROM workspace_members m WHERE m.user_id = auth.uid()) OR
  id IN (SELECT bm.board_id FROM board_members bm WHERE bm.user_id = auth.uid())
);
CREATE POLICY "Users can create boards" ON boards FOR INSERT WITH CHECK (
  workspace_id IN (SELECT w.id FROM workspaces w WHERE w.owner_id = auth.uid()) OR
  workspace_id IN (SELECT m.workspace_id FROM workspace_members m WHERE m.user_id = auth.uid())
);
CREATE POLICY "Users can update their boards" ON boards FOR UPDATE USING (
  workspace_id IN (SELECT w.id FROM workspaces w WHERE w.owner_id = auth.uid()) OR
  id IN (SELECT bm.board_id FROM board_members bm WHERE bm.user_id = auth.uid())
);
CREATE POLICY "Users can delete their boards" ON boards FOR DELETE USING (
  workspace_id IN (SELECT w.id FROM workspaces w WHERE w.owner_id = auth.uid()) OR
  id IN (SELECT bm.board_id FROM board_members bm WHERE bm.user_id = auth.uid())
);

-- Board Members (Using is_board_member helper to prevent recursion)
CREATE POLICY "Users can view members of boards they are in" ON board_members FOR SELECT USING (
    auth.uid() = user_id OR
    is_board_member(board_id)
);
CREATE POLICY "Board members manage" ON board_members FOR ALL USING (
    board_id IN (SELECT id FROM boards WHERE workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid())) OR
    is_board_member(board_id)
);

-- Groups, Columns, Items (Cascade access from Board)
CREATE POLICY "Users can manage groups" ON groups FOR ALL USING (
  board_id IN (SELECT b.id FROM boards b WHERE 
    b.workspace_id IN (SELECT w.id FROM workspaces w WHERE w.owner_id = auth.uid()) OR
    b.id IN (SELECT bm.board_id FROM board_members bm WHERE bm.user_id = auth.uid())
  )
);

CREATE POLICY "Users can manage columns" ON columns FOR ALL USING (
  board_id IN (SELECT b.id FROM boards b WHERE 
    b.workspace_id IN (SELECT w.id FROM workspaces w WHERE w.owner_id = auth.uid()) OR
    b.id IN (SELECT bm.board_id FROM board_members bm WHERE bm.user_id = auth.uid())
  )
);

CREATE POLICY "Users can manage items" ON items FOR ALL USING (
  board_id IN (SELECT b.id FROM boards b WHERE 
    b.workspace_id IN (SELECT w.id FROM workspaces w WHERE w.owner_id = auth.uid()) OR
    b.id IN (SELECT bm.board_id FROM board_members bm WHERE bm.user_id = auth.uid())
  )
);

-- Notifications
CREATE POLICY "Users can view their own notifications" ON notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Authenticated users can create notifications" ON notifications FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Users can update their own notifications" ON notifications FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own notifications" ON notifications FOR DELETE USING (auth.uid() = user_id);

-- Activity Logs (v3 ultra-permissive policy applied)
CREATE POLICY "Users can view relevant logs" ON activity_logs FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "Allow insert for all authenticated" ON activity_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

-- 6. Finished
