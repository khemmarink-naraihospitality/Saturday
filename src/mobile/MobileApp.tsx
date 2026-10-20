import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import './mobile.css';
import { useBoardStore } from '../store/useBoardStore';
import { useUserStore } from '../store/useUserStore';
import { useThemeStore } from '../store/useThemeStore';
import { useMobileRouting } from './nav/useMobileRouting';
import { TAB_FOR_PAGE } from './nav/navigation';
import { useMobileUI } from './state/mobileStore';
import { TabBar, CenteredSpinner, MobileToastHost } from './ui';
import { HomeScreen } from './screens/HomeScreen';
import { WorkspacesScreen } from './screens/WorkspacesScreen';
import { WorkspaceScreen } from './screens/WorkspaceScreen';
import { FavoritesScreen } from './screens/FavoritesScreen';
import { NotificationsScreen } from './screens/NotificationsScreen';
import { MoreScreen } from './screens/MoreScreen';

// The heavier parts load on first use (and are prefetched once the first
// screen is up), so opening the app on a phone only waits for Home.
const loadBoardScreen = () => import('./board/BoardScreen');
const loadItemSheet = () => import('./item/ItemSheet');
const loadCellEditors = () => import('./cells/CellEditorHost');
const loadViewsSheet = () => import('./board/ViewsSheetHost');
const loadDashboard = () => import('./screens/DashboardScreen');

const BoardScreen = lazy(() => loadBoardScreen().then(m => ({ default: m.BoardScreen })));
const ItemSheet = lazy(() => loadItemSheet().then(m => ({ default: m.ItemSheet })));
const CellEditorHost = lazy(() => loadCellEditors().then(m => ({ default: m.CellEditorHost })));
const ViewsSheetHost = lazy(() => loadViewsSheet().then(m => ({ default: m.ViewsSheetHost })));
const DashboardScreen = lazy(() => loadDashboard().then(m => ({ default: m.DashboardScreen })));
const AdminPage = lazy(() => import('../pages/AdminPage').then(m => ({ default: m.AdminPage })));

/**
 * Mounts `children` from the first time `wanted` is true and keeps them mounted,
 * so a lazily loaded sheet isn't fetched until it's needed but still gets to
 * play its closing animation afterwards.
 */
const MountOnce = ({ wanted, children }: { wanted: boolean; children: ReactNode }) => {
    const [mounted, setMounted] = useState(wanted);
    useEffect(() => {
        if (wanted) setMounted(true);
    }, [wanted]);
    return mounted ? <Suspense fallback={null}>{children}</Suspense> : null;
};

const THEME_COLOR = {
    saturday: { light: '#eff1f8', dark: '#0c0a1a' },
    narai: { light: '#f9f2e3', dark: '#14160f' },
};

/**
 * The phone layout. Rendered by MainApp (App.tsx) in place of the desktop one
 * when the screen is phone-sized; it reads and drives the same stores, so data
 * loading, realtime and the URL keep working exactly as on desktop.
 */
export const MobileApp = () => {
    useMobileRouting();

    const activePage = useBoardStore(state => state.activePage);
    const activeBoardId = useBoardStore(state => state.activeBoardId);
    const boardExists = useBoardStore(state => !!state.activeBoardId && state.boards.some(b => b.id === state.activeBoardId));
    const activeItemId = useBoardStore(state => state.activeItemId);
    const cellEditorOpen = useMobileUI(state => !!state.cellEditor);
    const viewsSheetOpen = useMobileUI(state => !!state.viewsSheetBoardId);
    const loadNotifications = useBoardStore(state => state.loadNotifications);
    const userId = useUserStore(state => state.currentUser?.id);
    const theme = useThemeStore(state => state.theme);
    const palette = useThemeStore(state => state.palette);

    // On desktop the top bar loads notifications; the phone layout has no top
    // bar, so the tab bar's badge and the Notifications tab are fed from here.
    useEffect(() => {
        if (userId) void loadNotifications();
    }, [userId, loadNotifications]);

    // Fetch the board and item code in the background once Home is showing.
    useEffect(() => {
        const timer = window.setTimeout(() => {
            void loadBoardScreen();
            void loadItemSheet();
            void loadCellEditors();
        }, 1200);
        return () => window.clearTimeout(timer);
    }, []);

    // The browser's own bars follow the page colour.
    useEffect(() => {
        const meta = document.querySelector('meta[name="theme-color"]');
        const previous = meta?.getAttribute('content') ?? null;
        meta?.setAttribute('content', (THEME_COLOR[palette] || THEME_COLOR.saturday)[theme === 'dark' ? 'dark' : 'light']);
        return () => {
            if (meta && previous !== null) meta.setAttribute('content', previous);
        };
    }, [theme, palette]);

    let screen: ReactNode;
    switch (activePage) {
        case 'board':
            screen = boardExists && activeBoardId ? <BoardScreen key={activeBoardId} boardId={activeBoardId} /> : <HomeScreen />;
            break;
        case 'workspace':
            screen = <WorkspaceScreen />;
            break;
        case 'workspaces':
            screen = <WorkspacesScreen />;
            break;
        case 'favorites':
            screen = <FavoritesScreen />;
            break;
        case 'notifications':
            screen = <NotificationsScreen />;
            break;
        case 'dashboard':
            screen = <DashboardScreen />;
            break;
        case 'more':
            screen = <MoreScreen />;
            break;
        case 'admin':
            // The admin console has no phone layout of its own; it opens full
            // screen as on desktop, with its own way back.
            screen = (
                <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: '#f8fafc', overflow: 'auto' }}>
                    <AdminPage />
                </div>
            );
            break;
        default:
            screen = <HomeScreen />;
    }

    const showTabBar = activePage in TAB_FOR_PAGE || (activePage === 'board' && !boardExists);

    return (
        <div className="m-app" data-page={activePage}>
            <div className="m-stage">
                <Suspense fallback={<CenteredSpinner />}>{screen}</Suspense>
            </div>
            {showTabBar && <TabBar />}

            <MountOnce wanted={!!activeItemId}><ItemSheet /></MountOnce>
            <MountOnce wanted={cellEditorOpen}><CellEditorHost /></MountOnce>
            <MountOnce wanted={viewsSheetOpen}><ViewsSheetHost /></MountOnce>
            <MobileToastHost />
        </div>
    );
};
