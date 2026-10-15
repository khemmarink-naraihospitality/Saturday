import type { Board, Workspace } from '../../types';

/**
 * Data helpers for the phone layout's top-level screens. Pure (no store, no
 * React) so they can be checked from node — tests/mobile_screens_test.ts.
 */

/** "Business Tech > Business Tech Department" for a sub-workspace, else its own title. */
export const workspacePath = (workspaceId: string | undefined, workspaces: Workspace[]): string => {
    const workspace = workspaces.find(w => w.id === workspaceId);
    if (!workspace) return '';
    const parent = workspace.parentId ? workspaces.find(w => w.id === workspace.parentId) : undefined;
    return parent ? `${parent.title} > ${workspace.title}` : workspace.title;
};

/** The workspace and every sub-workspace under it (any depth), as ids. */
export const workspaceFamily = (workspaceId: string, workspaces: Workspace[]): Set<string> => {
    const ids = new Set([workspaceId]);
    let grew = true;
    while (grew) {
        grew = false;
        workspaces.forEach(w => {
            if (w.parentId && ids.has(w.parentId) && !ids.has(w.id)) {
                ids.add(w.id);
                grew = true;
            }
        });
    }
    return ids;
};

/** Boards that are neither deleted nor archived — what every list on the phone shows. */
export const liveBoards = (boards: Board[]) => boards.filter(b => !b.is_archived);

export type RecentEntry =
    | { kind: 'board'; id: string; at: string; board: Board }
    | { kind: 'workspace'; id: string; at: string; workspace: Workspace };

export interface WorkspaceVisit {
    id: string;
    at: string;
}

/**
 * Recently visited boards (from board_members.last_viewed_at) and workspaces
 * (opened on this phone; see recordWorkspaceVisit) in one list, newest first.
 * Archived boards and workspaces that no longer exist are left out.
 */
export const mergeRecents = (
    boards: Board[],
    workspaces: Workspace[],
    visits: WorkspaceVisit[],
    limit = 9
): RecentEntry[] => {
    const entries: RecentEntry[] = [];
    liveBoards(boards).forEach(board => {
        if (board.lastViewedAt) entries.push({ kind: 'board', id: board.id, at: board.lastViewedAt, board });
    });
    visits.forEach(visit => {
        const workspace = workspaces.find(w => w.id === visit.id);
        if (workspace) entries.push({ kind: 'workspace', id: workspace.id, at: visit.at, workspace });
    });
    return entries
        .filter(entry => !Number.isNaN(new Date(entry.at).getTime()))
        .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
        .slice(0, limit);
};

/** Splits a list into pages of `size` (the swipeable pages of "Recently visited"). */
export const pagesOf = <T,>(items: T[], size: number): T[][] => {
    const pages: T[][] = [];
    for (let i = 0; i < items.length; i += size) pages.push(items.slice(i, i + size));
    return pages;
};

// ── Workspace visits, remembered on this device ─────────────────────────────

const visitsKey = (userId: string) => `saturday:recent-workspaces:${userId}`;
const MAX_VISITS = 12;

export const readWorkspaceVisits = (userId: string | undefined): WorkspaceVisit[] => {
    if (!userId) return [];
    try {
        const parsed = JSON.parse(localStorage.getItem(visitsKey(userId)) || '[]');
        return Array.isArray(parsed)
            ? parsed.filter((v): v is WorkspaceVisit => typeof v?.id === 'string' && typeof v?.at === 'string')
            : [];
    } catch {
        return [];
    }
};

export const recordWorkspaceVisit = (userId: string | undefined, workspaceId: string, at = new Date().toISOString()) => {
    if (!userId) return;
    const next = [{ id: workspaceId, at }, ...readWorkspaceVisits(userId).filter(v => v.id !== workspaceId)].slice(0, MAX_VISITS);
    try {
        localStorage.setItem(visitsKey(userId), JSON.stringify(next));
    } catch { /* private mode — the visit just isn't remembered */ }
};

// ── What the user may do in a workspace ────────────────────────────────────

export interface WorkspaceRoleInput {
    workspace: Workspace | undefined;
    userId: string | undefined;
    userWorkspaceRoles: Record<string, string>;
    systemRole?: string;
}

/** The user's role in a workspace, the way the desktop sidebar works it out. */
export const workspaceRole = ({ workspace, userId, userWorkspaceRoles }: WorkspaceRoleInput): string | null => {
    if (!workspace) return null;
    if (workspace.owner_id && workspace.owner_id === userId) return 'owner';
    return userWorkspaceRoles[workspace.id] ?? null;
};

const isSystemAdmin = (systemRole?: string) => systemRole === 'super_admin' || systemRole === 'it_admin';

/** Same rule as the sidebar's "Add board": owner, admin or member (and system admins). */
export const canCreateBoardIn = (input: WorkspaceRoleInput): boolean => {
    if (!input.workspace) return false;
    if (isSystemAdmin(input.systemRole)) return true;
    const role = workspaceRole(input);
    return role === 'owner' || role === 'admin' || role === 'member';
};

/** Same rule as ShareWorkspaceModal's invite form: the owner or an admin. */
export const canInviteTo = (input: WorkspaceRoleInput): boolean => {
    if (!input.workspace) return false;
    if (isSystemAdmin(input.systemRole)) return true;
    const role = workspaceRole(input);
    return role === 'owner' || role === 'admin';
};

/** Workspaces ordered as the sidebar shows them: top-level by order, each followed by its sub-workspaces. */
export const orderedWorkspaceTree = (workspaces: Workspace[]): { workspace: Workspace; depth: number }[] => {
    const byOrder = (a: Workspace, b: Workspace) => (a.order ?? 0) - (b.order ?? 0) || a.title.localeCompare(b.title);
    const ids = new Set(workspaces.map(w => w.id));
    const out: { workspace: Workspace; depth: number }[] = [];
    const visit = (parentId: string | null, depth: number) => {
        workspaces
            .filter(w => (parentId === null ? !w.parentId || !ids.has(w.parentId) : w.parentId === parentId))
            .sort(byOrder)
            .forEach(w => {
                out.push({ workspace: w, depth });
                if (depth < 4) visit(w.id, depth + 1);
            });
    };
    visit(null, 0);
    return out;
};
