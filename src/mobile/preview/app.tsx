/**
 * Whole-app preview: /app-preview.html in `npm run dev`.
 *
 * Unlike mobile-preview.html (which mounts MobileApp alone), this mounts the real
 * <App/> — AuthProvider, MainApp with its URL sync, deep links and popstate
 * handling — over the same sample data with the network stubbed. Two uses:
 *   - ?layout=mobile (default): click through the phone layout as a user would,
 *     back gesture and URLs included;
 *   - ?layout=desktop: the desktop layout over the same data, for checking that
 *     the desktop renders exactly as before.
 * Deep links work as in production: ?boardId=b-tech&itemId=i-ragnar.
 * Development only; not part of the build.
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import '../../styles/index.css';
import { supabase } from '../../lib/supabase';
import { useBoardStore } from '../../store/useBoardStore';
import { useUserStore } from '../../store/useUserStore';
import { useThemeStore } from '../../store/useThemeStore';
import App from '../../App';
import * as fx from './fixtures';

const params = new URLSearchParams(window.location.search);

try {
    localStorage.setItem('saturday:layout', params.get('layout') === 'desktop' ? 'desktop' : 'mobile');
} catch { /* the layout just follows the window size */ }

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

const fakeUser = { id: fx.ME.id, email: fx.ME.email, user_metadata: { full_name: fx.ME.name }, app_metadata: { provider: new URLSearchParams(window.location.search).get('provider') || 'google' } };
const fakeSession = { user: fakeUser, access_token: 'preview', refresh_token: 'preview', expires_in: 3600, token_type: 'bearer' };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const client = supabase as any;
client.from = () => chain;
client.rpc = () => chain;
client.channel = () => chain;
client.removeChannel = async () => 'ok';
Object.defineProperty(client, 'functions', { configurable: true, value: { invoke: async () => ({ data: null, error: null }) } });
Object.defineProperty(client, 'storage', { configurable: true, value: { from: () => chain } });
client.auth.getSession = async () => ({ data: { session: fakeSession }, error: null });
client.auth.getUser = async () => ({ data: { user: fakeUser }, error: null });
client.auth.onAuthStateChange = () => ({ data: { subscription: { unsubscribe() { /* noop */ } } } });
client.auth.signOut = async () => ({ error: null });

// ── Stores ──────────────────────────────────────────────────────────────────

useThemeStore.getState().setTheme(params.get('theme') === 'dark' ? 'dark' : 'light');
useThemeStore.getState().setPalette(params.get('palette') === 'narai' ? 'narai' : 'saturday');

useUserStore.setState({
    currentUser: { id: fx.ME.id, name: fx.ME.name, email: fx.ME.email, avatar: '', role: 'owner', system_role: 'super_admin', is_approved: true, is_active: true },
});

useBoardStore.setState({
    workspaces: fx.workspaces,
    boards: fx.boards,
    notifications: fx.notifications,
    activeWorkspaceId: 'ws-bt',
    activePage: 'home',
    isLoading: false,
    isInitializing: false,
    userWorkspaceRoles: { 'ws-bt': 'owner', 'ws-btd': 'owner', 'ws-main': 'owner', 'ws-mkt': 'member', 'ws-fin': 'owner', 'ws-ops': 'member' },
    sharedBoardIds: ['b-tech'],
    activeBoardMembers: fx.boardMembers,
    // The data is already in the store; these would otherwise go to the network.
    loadUserData: async () => { /* preview */ },
    loadBoardData: async () => { /* preview */ },
    loadItemUpdates: async () => true,
    loadNotifications: async () => { /* preview */ },
    subscribeToRealtime: () => { /* preview */ },
    unsubscribeFromRealtime: () => { /* preview */ },
    getBoardMembers: async () => fx.boardMembers,
    getWorkspaceMembers: async (workspaceId: string) => (fx.workspaceMembers[workspaceId] as never[]) || [],
});

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
);
