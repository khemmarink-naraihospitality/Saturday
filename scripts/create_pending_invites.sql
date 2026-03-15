-- 1. Create Pending Invites Table
CREATE TABLE IF NOT EXISTS pending_invites (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  board_id UUID REFERENCES boards(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'editor',
  invited_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE pending_invites ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to insert/read their own sent invites
CREATE POLICY "Users can create and view their own invitations" 
ON pending_invites FOR ALL 
USING (auth.uid() = invited_by)
WITH CHECK (auth.uid() = invited_by);

-- 2. Create Auto-Accept Function
CREATE OR REPLACE FUNCTION public.handle_auto_accept_invite()
RETURNS TRIGGER AS $$
BEGIN
  -- Auto-join board
  INSERT INTO board_members (board_id, user_id, role)
  SELECT board_id, NEW.id, role
  FROM pending_invites
  WHERE email = NEW.email;

  -- Auto-join workspace
  INSERT INTO workspace_members (workspace_id, user_id, role)
  SELECT workspace_id, NEW.id, role
  FROM pending_invites
  WHERE email = NEW.email;

  -- Delete from pending once accepted
  DELETE FROM pending_invites WHERE email = NEW.email;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Create Trigger on profiles table
-- Assuming profiles are created on auth.users signup
DROP TRIGGER IF EXISTS on_profile_created_at_invite ON public.profiles;
CREATE TRIGGER on_profile_created_at_invite
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE PROCEDURE public.handle_auto_accept_invite();
