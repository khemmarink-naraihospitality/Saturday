/**
 * Phone-layout preview: /mobile-preview.html?screen=<name> in `npm run dev`.
 *
 * Renders MobileApp over sample data (fixtures.ts) with every network call
 * stubbed out, so each screen can be opened, clicked through and screenshotted
 * without signing in or touching the real database. Development only: the page
 * is not part of the production build (vite builds index.html alone).
 *
 * Screens (?screen=): home, home-scrolled, workspace, board, item-updates,
 * board-scrolled, sheet-status, sheet-date, sheet-files, sheet-date2,
 * sheet-timeline, sheet-views, workspaces, favorites, notifications, more,
 * dashboard, item-columns, item-files, board-large (4,800 rows, for speed).
 * Add &theme=dark for the dark theme, &palette=narai for the Narai palette.
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import '../../styles/index.css';
import { supabase } from '../../lib/supabase';
import { AuthProvider } from '../../contexts/AuthContext';
import { useBoardStore } from '../../store/useBoardStore';
import { useUserStore } from '../../store/useUserStore';
import { useThemeStore } from '../../store/useThemeStore';
import { MobileApp } from '../MobileApp';
import { useMobileUI } from '../state/mobileStore';
import * as fx from './fixtures';

// ── Network: every query resolves to an empty, successful result ───────────

const emptyResult = { data: null, error: null, count: 0, status: 200, statusText: 'OK' };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const chain: any = new Proxy(function () { /* callable */ }, {
    get(_target, prop) {
        if (prop === 'then') {
            return (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => Promise.resolve(emptyResult).then(resolve, reject);
        }
        return () => chain;
    },
    apply: () => chain,
});

// items.updates as the database holds it, so posting, replying, liking and
// deleting work end to end (itemSlice reads the row before every rewrite).
const dbUpdates = new Map<string, unknown[]>();
const dbUpdatesOf = (itemId: string) => {
    if (!dbUpdates.has(itemId)) {
        const original = fx.boards.flatMap(b => b.items).find(i => i.id === itemId);
        dbUpdates.set(itemId, original?.updates ? [...original.updates] : []);
    }
    return dbUpdates.get(itemId)!;
};

/** A query on one table: everything succeeds empty, except items.updates, which is remembered. */
const tableChain = (table: string) => {
    const q: { op: string; columns?: string; filters: Record<string, unknown>; payload?: Record<string, unknown> } = { op: 'select', filters: {} };
    const result = () => {
        const id = q.filters.id as string | undefined;
        if (table === 'items' && id) {
            if (q.op === 'select' && q.columns === 'updates') return { ...emptyResult, data: { updates: dbUpdatesOf(id) } };
            if (q.op === 'update' && q.payload && 'updates' in q.payload) dbUpdates.set(id, q.payload.updates as unknown[]);
        }
        return emptyResult;
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const proxy: any = new Proxy(function () { /* callable */ }, {
        get(_target, prop) {
            if (prop === 'then') {
                return (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => Promise.resolve(result()).then(resolve, reject);
            }
            return (...args: unknown[]) => {
                if (prop === 'select' && q.op === 'select') q.columns = args[0] as string;
                if (prop === 'update' || prop === 'insert' || prop === 'upsert' || prop === 'delete') {
                    q.op = prop;
                    q.payload = args[0] as Record<string, unknown>;
                }
                if (prop === 'eq') q.filters[args[0] as string] = args[1];
                return proxy;
            };
        },
        apply: () => proxy,
    });
    return proxy;
};

const fakeUser = { id: fx.ME.id, email: fx.ME.email, user_metadata: { full_name: fx.ME.name }, app_metadata: { provider: new URLSearchParams(window.location.search).get('provider') || 'google' } };
const fakeSession = { user: fakeUser, access_token: 'preview', refresh_token: 'preview', expires_in: 3600, token_type: 'bearer' };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const client = supabase as any;
client.from = (table: string) => tableChain(table);
client.rpc = () => chain;
client.channel = () => chain;
client.removeChannel = async () => 'ok';
// functions / storage are getters on the client: shadow them on the instance.
Object.defineProperty(client, 'functions', { configurable: true, value: { invoke: async () => ({ data: null, error: null }) } });
Object.defineProperty(client, 'storage', { configurable: true, value: { from: () => chain } });
client.auth.getSession = async () => ({ data: { session: fakeSession }, error: null });
client.auth.getUser = async () => ({ data: { user: fakeUser }, error: null });
client.auth.onAuthStateChange = () => ({ data: { subscription: { unsubscribe() { /* noop */ } } } });
client.auth.signOut = async () => ({ error: null });

// ── Stores: sample data, and the loaders that would hit the network ────────

const params = new URLSearchParams(window.location.search);
const screen = params.get('screen') || 'home';

// Shared components that adapt to the phone (the dashboard) ask useIsMobile(),
// which in the real app is what decided to render MobileApp in the first place.
try { localStorage.setItem('saturday:layout', 'mobile'); } catch { /* ignore */ }

if (params.get('theme') === 'dark') useThemeStore.getState().setTheme('dark');
else useThemeStore.getState().setTheme('light');
useThemeStore.getState().setPalette(params.get('palette') === 'narai' ? 'narai' : 'saturday');

useUserStore.setState({
    currentUser: { id: fx.ME.id, name: fx.ME.name, email: fx.ME.email, avatar: '', role: 'owner', system_role: 'super_admin', is_approved: true, is_active: true },
});

const set = useBoardStore.setState;
set({
    workspaces: fx.workspaces,
    boards: fx.boards,
    notifications: fx.notifications,
    activeWorkspaceId: 'ws-bt',
    activePage: 'home',
    activeBoardId: null,
    activeItemId: null,
    isLoading: false,
    isInitializing: false,
    userWorkspaceRoles: { 'ws-bt': 'owner', 'ws-btd': 'owner', 'ws-main': 'owner', 'ws-mkt': 'member', 'ws-fin': 'owner', 'ws-ops': 'member' },
    userBoardRoles: {},
    sharedBoardIds: ['b-tech'],
    sharedWorkspaceIds: [],
    activeBoardMembers: fx.boardMembers,
    // Loaders and subscriptions: the data is already here.
    loadUserData: async () => { /* preview */ },
    loadBoardData: async () => { /* preview */ },
    loadItemUpdates: async () => true,
    loadNotifications: async () => { /* preview */ },
    subscribeToRealtime: () => { /* preview */ },
    unsubscribeFromRealtime: () => { /* preview */ },
    getBoardMembers: async () => fx.boardMembers,
    getWorkspaceMembers: async (workspaceId: string) => (fx.workspaceMembers[workspaceId] as never[]) || [],
    setActiveBoard: async (id: string | null) => {
        set(state => ({
            activeBoardId: id,
            activePage: 'board',
            activeBoardMembers: fx.boardMembers,
            activeWorkspaceId: state.boards.find(b => b.id === id)?.workspaceId || state.activeWorkspaceId,
            boards: state.boards.map(b => (b.id === id ? { ...b, lastViewedAt: new Date().toISOString() } : b)),
        }));
    },
});

// ── Scenarios ───────────────────────────────────────────────────────────────

const store = () => useBoardStore.getState();
const ui = () => useMobileUI.getState();
const openTech = () => store().setActiveBoard('b-tech');

/** Runs after the first render, once the screen's DOM exists. */
const afterRender = (fn: () => void, delay = 350) => window.setTimeout(fn, delay);

/** Scrolls an element once it exists (lazy screens can take a moment to arrive). */
const scrollInside = (selector: string, to: { top?: number; left?: number }, tries = 30) => afterRender(() => {
    const el = document.querySelector(selector) as HTMLElement | null;
    if (!el) {
        if (tries > 0) scrollInside(selector, to, tries - 1);
        return;
    }
    if (to.top !== undefined) el.scrollTop = to.top < 0 ? el.scrollHeight : to.top;
    if (to.left !== undefined) el.scrollLeft = to.left;
    el.dispatchEvent(new Event('scroll'));
}, tries === 30 ? 350 : 100);

const scenarios: Record<string, () => void> = {
    home: () => store().navigateTo('home'),
    'home-scrolled': () => {
        store().navigateTo('home');
        scrollInside('[data-testid="m-home"] .m-scroll', { top: -1 });
    },
    workspaces: () => store().navigateTo('workspaces'),
    workspace: () => {
        store().setActiveWorkspace('ws-bt');
        store().navigateTo('workspace');
    },
    favorites: () => store().navigateTo('favorites'),
    notifications: () => store().navigateTo('notifications'),
    more: () => store().navigateTo('more'),
    dashboard: () => {
        store().setActiveWorkspace('ws-btd');
        store().navigateTo('dashboard');
    },
    board: openTech,
    'board-scrolled': () => {
        openTech();
        // Updates scrolled under the name column, as in reference 20.
        scrollInside('[data-testid="m-table-scroll"]', { left: 236 });
    },
    'board-expanded': () => {
        openTech();
        store().toggleItemExpansion('b-tech', 'i-microsoft-office-license');
    },
    'item-updates': () => {
        openTech();
        ui().setItemTab('updates');
        store().setActiveItem('i-ragnar');
    },
    'item-columns': () => {
        openTech();
        ui().setItemTab('columns');
        store().setActiveItem('i-ragnar');
    },
    'item-files': () => {
        openTech();
        ui().setItemTab('files');
        store().setActiveItem('i-ragnar');
    },
    'sheet-status': () => {
        openTech();
        afterRender(() => ui().openCellEditor({ boardId: 'b-tech', itemId: 'i-anti-virus', columnId: 'c-champ' }));
    },
    'sheet-date': () => {
        openTech();
        afterRender(() => ui().openCellEditor({ boardId: 'b-tech', itemId: 'i-google-workspace-license', columnId: 'c-renew' }));
    },
    'sheet-files': () => {
        openTech();
        afterRender(() => ui().openCellEditor({ boardId: 'b-tech', itemId: 'i-domain', columnId: 'c-file' }));
    },
    'sheet-date2': () => {
        openTech();
        afterRender(() => ui().openCellEditor({ boardId: 'b-tech', itemId: 'i-domain', columnId: 'c-expire' }));
    },
    'sheet-timeline': () => {
        void store().setActiveBoard('b-it-bo');
        afterRender(() => ui().openCellEditor({ boardId: 'b-it-bo', itemId: 'bo-2', columnId: 'bo-tl' }));
    },
    'sheet-people': () => {
        openTech();
        afterRender(() => ui().openCellEditor({ boardId: 'b-tech', itemId: 'i-domain', columnId: 'c-resp' }));
    },
    'sheet-text': () => {
        openTech();
        afterRender(() => ui().openCellEditor({ boardId: 'b-tech', itemId: 'i-domain', columnId: 'c-note' }));
    },
    'board-large': () => {
        const large = fx.buildLargeBoard();
        set(state => ({ boards: [...state.boards, large] }));
        (window as unknown as { __openedAt: number }).__openedAt = performance.now();
        void store().setActiveBoard('b-large');
    },
    'sheet-views': () => {
        openTech();
        afterRender(() => ui().openViewsSheet('b-tech'));
    },
};

(scenarios[screen] || scenarios.home)();

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <AuthProvider>
            <MobileApp />
        </AuthProvider>
    </React.StrictMode>
);
