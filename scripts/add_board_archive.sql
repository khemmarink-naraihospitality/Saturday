-- Adds soft-delete support for boards

-- 1. Add the is_archived column if it doesn't exist
ALTER TABLE boards
ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE;

-- 2. Update RLS Policies to ensure archived boards are still readable 
--    (Wait, the existing policies already allow access based on workspace membership/board_members, 
--     so we just need to filter them out in the Frontend application, not via RLS, so Owners can still see them to restore them).

-- Just the column is enough! The frontend will handle filtering.
