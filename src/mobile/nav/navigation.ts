import { useBoardStore } from '../../store/useBoardStore';
import { goBack } from './history';

/**
 * Every screen change in the phone layout goes through these, so the rules
 * live in one place. They only move the shared store (activePage and friends);
 * the URL and history follow from that (MainApp + useMobileRouting).
 */

export type MobileTab = 'home' | 'favorites' | 'dashboard' | 'notifications' | 'more';

/** Pages the floating tab bar sits under, and which tab each one lights up. */
export const TAB_FOR_PAGE: Record<string, MobileTab> = {
    home: 'home',
    favorites: 'favorites',
    dashboard: 'dashboard',
    notifications: 'notifications',
    more: 'more',
};

const store = () => useBoardStore.getState();

export const openTab = (tab: MobileTab) => {
    if (tab === 'dashboard') {
        openDashboard();
        return;
    }
    store().navigateTo(tab);
};

export const openHome = () => store().navigateTo('home');

export const openWorkspaces = () => store().navigateTo('workspaces');

/** A workspace's own screen: its boards, its dashboard, its people. */
export const openWorkspace = (workspaceId: string) => {
    const s = store();
    if (s.activeWorkspaceId !== workspaceId) s.setActiveWorkspace(workspaceId);
    s.navigateTo('workspace');
};

/**
 * The workspace dashboard. Without a workspace to show it for, the dashboard
 * tab opens on the workspace list's most recent pick: the active one, else the
 * workspace of the most recently viewed board, else the first.
 */
export const openDashboard = (workspaceId?: string) => {
    const s = store();
    const target = workspaceId
        || s.activeWorkspaceId
        || [...s.boards]
            .filter(b => b.lastViewedAt && !b.is_archived && b.workspaceId)
            .sort((a, b) => (b.lastViewedAt || '').localeCompare(a.lastViewedAt || ''))[0]?.workspaceId
        || s.workspaces[0]?.id;
    if (target && s.activeWorkspaceId !== target) s.setActiveWorkspace(target);
    s.navigateTo('dashboard');
};

export const openBoard = (boardId: string) => {
    void store().setActiveBoard(boardId);
};

export const openItem = (itemId: string) => store().setActiveItem(itemId);

export const closeItem = () => store().setActiveItem(null);

/** Header back on a board: the previous screen, or the board's workspace. */
export const backFromBoard = () => {
    const s = store();
    const board = s.boards.find(b => b.id === s.activeBoardId);
    goBack(() => (board?.workspaceId ? openWorkspace(board.workspaceId) : openHome()));
};

/** Header back on a workspace (or the workspace list, More…): previous screen, else Home. */
export const backToHome = () => goBack(openHome);
