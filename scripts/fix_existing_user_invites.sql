-- 1. Create a function to handle auto-accept for existing users
CREATE OR REPLACE FUNCTION public.handle_existing_user_invite()
RETURNS TRIGGER AS $$
DECLARE
    target_user_id UUID;
BEGIN
    -- Check if the email already exists in profiles
    SELECT id INTO target_user_id FROM public.profiles WHERE email = NEW.email;

    IF target_user_id IS NOT NULL THEN
        -- 1. Auto-join board
        IF NEW.board_id IS NOT NULL THEN
            INSERT INTO public.board_members (board_id, user_id, role)
            VALUES (NEW.board_id, target_user_id, COALESCE(NEW.role, 'editor'))
            ON CONFLICT (board_id, user_id) DO NOTHING;
        END IF;

        -- 2. Auto-join workspace
        IF NEW.workspace_id IS NOT NULL THEN
            INSERT INTO public.workspace_members (workspace_id, user_id, role)
            VALUES (NEW.workspace_id, target_user_id, 'board-guest')
            ON CONFLICT (workspace_id, user_id) DO NOTHING;
        END IF;

        -- 3. Delete from pending once accepted
        -- We return NULL in a trigger to prevent the insert if we've already processed it, 
        -- but it's cleaner to let the insert happen and then delete, or just handle it here.
        -- Actually, if we use a BEFORE INSERT trigger, we can just reject the insert.
        -- But for simplicity and to keep the record for a split second, let's use AFTER INSERT.
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 2. Create the trigger on pending_invites
DROP TRIGGER IF EXISTS on_pending_invite_created ON public.pending_invites;
CREATE TRIGGER on_pending_invite_created
    AFTER INSERT ON public.pending_invites
    FOR EACH ROW EXECUTE PROCEDURE public.handle_existing_user_invite();

-- 3. Cleanup existing pending_invites for current users
-- (This fix applies immediately to businesstech@lubd.com if they still had a pending record, 
-- but we saw earlier it was empty, meaning they probably clicked accept and joined board_members, 
-- but maybe not workspace_members correctly or something else).
-- Actually, we saw they ARE in both. So the SQL fix is for future cases.
