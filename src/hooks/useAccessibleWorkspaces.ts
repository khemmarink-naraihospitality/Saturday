import { useBoardStore } from '../store/useBoardStore';
import { useUserStore } from '../store/useUserStore';

/**
 * Every workspace the current user can see: because they own it, because they
 * have an explicit workspace-level role in it, or — the case that's easy to
 * miss — because one of its boards was shared with them individually without
 * them ever being added to the workspace itself.
 *
 * Extracted out of WorkspaceList's "Move to" / "Duplicate to" submenus so the
 * collapsed icon rail (Sidebar) can list the same workspaces the full tree
 * does. Keeping this in one place means a workspace that's visible in one is
 * never silently missing from the other.
 */
export const useAccessibleWorkspaces = () => {
    const boards = useBoardStore(state => state.boards);
    const workspaces = useBoardStore(state => state.workspaces);
    const sharedBoardIds = useBoardStore(state => state.sharedBoardIds);
    const userWorkspaceRoles = useBoardStore(state => state.userWorkspaceRoles);
    const userId = useUserStore(state => state.currentUser?.id);

    return workspaces.filter((w, index, self) => {
        const isAccessible = w.owner_id === userId ||
            userWorkspaceRoles[w.id] !== undefined ||
            boards.some(b => b.workspaceId === w.id && sharedBoardIds.includes(b.id));

        return isAccessible && self.findIndex(i => i.id === w.id) === index;
    });
};
