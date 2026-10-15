import { useEffect } from 'react';
import { useBoardStore } from '../../store/useBoardStore';
import { useUserStore } from '../../store/useUserStore';
import { slugify } from '../../lib/utils';
import type { Workspace } from '../../types';
import { resolveBoardPath } from './paths';
import { getInitialPath } from '../../lib/initialPath';
import { installHistoryDepth, readHistoryState } from './history';

let initialPathConsumed = false;

/** Pages that live at "/" and are told apart by the history entry's mPage. */
const ROOT_PAGES = ['home', 'favorites', 'workspaces', 'more'];

const pathParts = () => window.location.pathname.split('/').filter(Boolean);

const findWorkspaceBySlug = (workspaces: Workspace[], slug: string) =>
    workspaces.find(w => slugify(w.title) === slug);

/** Points the store at whatever the current URL + history entry describe. */
const syncPageFromLocation = () => {
    const s = useBoardStore.getState();
    const parts = pathParts();
    const state = readHistoryState();

    if (parts.length === 0) {
        const page = typeof state?.mPage === 'string' && ROOT_PAGES.includes(state.mPage) ? state.mPage : 'home';
        if (s.activePage !== page) s.navigateTo(page);
        return;
    }

    if (parts.length === 1) {
        // /notifications, /admin — single-segment pages of their own.
        if ((parts[0] === 'notifications' || parts[0] === 'admin') && s.activePage !== parts[0]) {
            s.navigateTo(parts[0]);
        }
        return;
    }

    if (parts.length >= 3 && parts[2] === 'dashboard') {
        const workspace = findWorkspaceBySlug(s.workspaces, parts[1]);
        if (workspace && s.activeWorkspaceId !== workspace.id) s.setActiveWorkspace(workspace.id);
        if (s.activePage !== 'dashboard') s.navigateTo('dashboard');
        return;
    }

    if (parts.length >= 3) {
        const board = resolveBoardPath(parts, s.boards, s.workspaces);
        if (board && (s.activePage !== 'board' || s.activeBoardId !== board.id)) {
            void s.setActiveBoard(board.id);
        }
        return;
    }

    openWorkspaceFromSlug(parts[1]);
};

const openWorkspaceFromSlug = (slug: string) => {
    const s = useBoardStore.getState();
    const workspace = findWorkspaceBySlug(s.workspaces, slug);
    if (!workspace) return;
    if (s.activeWorkspaceId !== workspace.id) s.setActiveWorkspace(workspace.id);
    if (s.activePage !== 'workspace') s.navigateTo('workspace');
};

/**
 * Keeps the phone layout's screens and the browser history in step. Mount once,
 * in MobileApp.
 *
 *  - back/forward restore the screen from the URL (MainApp only handles "/" and
 *    /notifications itself);
 *  - the phone-only pages get history entries and URLs of their own: a
 *    workspace's screen at /user/workspace (the same link the desktop resolves
 *    to that workspace), the others at "/" marked with mPage;
 *  - a reload or shared link at /user/workspace opens that workspace's screen.
 */
export const useMobileRouting = () => {
    const activePage = useBoardStore(state => state.activePage);
    const activeWorkspaceId = useBoardStore(state => state.activeWorkspaceId);
    const workspaceTitle = useBoardStore(state => state.workspaces.find(w => w.id === state.activeWorkspaceId)?.title);
    const userName = useUserStore(state => state.currentUser?.name);

    useEffect(() => installHistoryDepth(), []);

    useEffect(() => {
        window.addEventListener('popstate', syncPageFromLocation);
        return () => window.removeEventListener('popstate', syncPageFromLocation);
    }, []);

    // Opened at /user/workspace: MainApp resolves the workspace but shows Home
    // (the desktop has no workspace page) and rewrites the URL to "/"; the phone
    // shows that workspace's screen instead. Acted on a tick later, after
    // MainApp's own effects, or its navigateTo('home') would land on top of ours.
    // Once per page load: a later remount (rotating between layouts) leaves the
    // user where they are.
    useEffect(() => {
        if (initialPathConsumed) return;
        const parts = getInitialPath().split('/').filter(Boolean);
        if (parts.length !== 2) {
            initialPathConsumed = true;
            return;
        }
        const timer = window.setTimeout(() => {
            initialPathConsumed = true;
            openWorkspaceFromSlug(parts[1]);
        }, 0);
        return () => window.clearTimeout(timer);
    }, []);

    useEffect(() => {
        const path = window.location.pathname;
        const state = readHistoryState();

        if (ROOT_PAGES.includes(activePage)) {
            // Home itself is MainApp's ("/" with no mPage); only switching between
            // root pages while already at "/" needs an entry of our own.
            const wanted = activePage === 'home' ? undefined : activePage;
            if (path !== '/' && activePage === 'home') return; // MainApp pushes "/" for Home
            if (path !== '/' || state?.mPage !== wanted) {
                window.history.pushState(wanted ? { mPage: wanted } : {}, '', '/');
            }
            return;
        }

        if (activePage === 'workspace' && workspaceTitle) {
            const username = userName ? slugify(userName) : 'u';
            const wanted = `/${username}/${slugify(workspaceTitle)}`;
            if (path !== wanted) window.history.pushState({ mPage: 'workspace' }, '', wanted);
        }
    }, [activePage, activeWorkspaceId, workspaceTitle, userName]);
};
