import { useEffect, lazy, Suspense, useRef } from 'react';
import { slugify } from './lib/utils';
import { Sidebar } from './components/board/Sidebar'
// BoardHeader, Table, BatchActionsBar moved to BoardPage lazy chunk
import { useBoardStore } from './store/useBoardStore'
import { useUserStore } from './store/useUserStore';


import { LoadingScreen } from './components/common/LoadingScreen';
import { SidePanel } from './components/ui/SidePanel';
import { ContactSupportButton } from './components/ui/ContactSupportButton';
import { TaskDetail } from './components/task/TaskDetail';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LoginPage } from './pages/LoginPage';
import { supabase } from './lib/supabase';

// HomePage moved to lazy
import { TopBar } from './components/layout/TopBar';

const DEFAULT_ASSIGN_TEMPLATE = `<div style="font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 40px 20px;"><div style="text-align: center; margin-bottom: 20px;"><img src="https://guideline.lubd.com/wp-content/uploads/2025/11/NHG128-1.png" alt="NARAI" style="width: 80px; height: 80px; background-color: #1f291e; object-fit: contain; margin: 0 auto; display: block;" /></div><div style="max-width: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 4px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);"><div style="text-align: center; padding: 20px 20px 10px;"><a href="https://saturday.naraihospitalitygroup.com" style="color: #2563eb; text-decoration: underline; font-weight: bold; font-size: 16px;">saturday.com</a></div><div style="border-bottom: 2px solid #1e293b; margin: 0 20px;"></div><div style="padding: 30px 40px; text-align: center;"><p style="font-size: 15px; color: #475569; line-height: 1.5; margin-bottom: 24px;"><strong>{{inviterName}}</strong> assigned you to item <strong>{{itemName}}</strong> under <strong>{{groupName}}</strong> in <strong>{{boardName}}</strong>.</p><a href="{{itemLink}}" style="background-color: #a86315; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold; font-size: 15px; display: inline-block;">View Item</a></div></div><div style="text-align: center; margin-top: 20px; font-size: 11px; color: #94a3b8;">Powered by <strong>NHG BusinessTech Team</strong></div></div>`;

const NotificationPage = lazy(() => import('./pages/NotificationPage').then(m => ({ default: m.NotificationPage })));
const AdminPage = lazy(() => import('./pages/AdminPage').then(m => ({ default: m.AdminPage })));
const BoardPage = lazy(() => import('./pages/BoardPage').then(m => ({ default: m.BoardPage })));
const HomePage = lazy(() => import('./pages/HomePage').then(m => ({ default: m.HomePage })));
const FavoritesPage = lazy(() => import('./pages/FavoritesPage').then(m => ({ default: m.FavoritesPage })));
const WorkspaceDashboardPage = lazy(() => import('./pages/WorkspaceDashboardPage').then(m => ({ default: m.WorkspaceDashboardPage })));

// Loading fallback component
function PageLoader() {
  return <LoadingScreen />;
}

function PendingApprovalPage({ onSignOut }: { onSignOut: () => void }) {
  const setUser = useUserStore(state => state.setUser);
  const currentUser = useUserStore(state => state.currentUser);

  // Poll DB every 10 seconds so the page auto-unblocks once admin approves
  useEffect(() => {
    const check = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from('profiles').select('is_approved, system_role').eq('id', user.id).single();
      if (profile?.is_approved && currentUser) {
        setUser({ ...currentUser, is_approved: true, system_role: (profile.system_role as any) || currentUser.system_role });
      }
    };
    check();
    const timer = setInterval(check, 10000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div style={{
      height: '100vh',
      width: '100vw',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#f8fafc',
      padding: '20px',
      textAlign: 'center'
    }}>
      <div style={{
        maxWidth: '400px',
        backgroundColor: 'white',
        padding: '32px',
        borderRadius: '12px',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center'
      }}>
        <div style={{ 
          width: '64px', 
          height: '64px', 
          backgroundColor: '#fef3c7', 
          borderRadius: '50%', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          marginBottom: '20px'
        }}>
          <span style={{ fontSize: '32px' }}>⏳</span>
        </div>
        <h2 style={{ fontSize: '20px', fontWeight: 600, color: '#1e293b', marginBottom: '12px' }}>Account Pending Approval</h2>
        <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '24px', lineHeight: '1.5' }}>
          Your account has been created successfully. <br/>
          Please wait for <strong>Super Admin</strong> to approve your access.
        </p>
        <button 
          onClick={onSignOut}
          style={{
            padding: '10px 20px',
            backgroundColor: 'hsl(var(--color-brand-primary))',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'background-color 0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'hsl(var(--color-brand-primary) / 0.8)'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'hsl(var(--color-brand-primary))'}
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}

function MainApp() {
  const activeBoardId = useBoardStore(state => state.activeBoardId);
  const activePage = useBoardStore(state => state.activePage);
  const navigateTo = useBoardStore(state => state.navigateTo);

  const boards = useBoardStore(state => state.boards);
  const activeItemId = useBoardStore(state => state.activeItemId);
  const setActiveItem = useBoardStore(state => state.setActiveItem);
  const loadUserData = useBoardStore(state => state.loadUserData);
  const isLoading = useBoardStore(state => state.isLoading);
  const subscribeToRealtime = useBoardStore(state => state.subscribeToRealtime);
  const unsubscribeFromRealtime = useBoardStore(state => state.unsubscribeFromRealtime);
  const activeWorkspaceId = useBoardStore(state => state.activeWorkspaceId);
  const activeBoard = boards.find(b => b.id === activeBoardId);
  const { session } = useAuth();
  const setUser = useUserStore(state => state.setUser); // Import setter

  const lastUserIdRef = useRef<string | null>(null);
  
  useEffect(() => {
    console.log('MainApp: session changed', session?.user?.id);
    
    if (session?.user?.id) {
      // Only re-initialize if the user ID actually changed
      if (lastUserIdRef.current === session.user.id) {
        console.log('MainApp: session refreshed but user ID same, skipping init');
        return;
      }
      
      lastUserIdRef.current = session.user.id;
      
      const initUser = async () => {
        // Fetch full profile to get system_role and is_approved
        const { data: profile } = await supabase.from('profiles').select('system_role, is_approved').eq('id', session.user.id).single();

        const userEmail = session.user.email || '';
        const userDomain = userEmail.split('@')[1];
        const ALLOWED_DOMAINS = ['naraihospitality.com', 'marasca.live', 'lubd.com'];
        const shouldBeApproved = profile?.is_approved || 
                                ALLOWED_DOMAINS.includes(userDomain) || 
                                userEmail === 'khemmarin.k@naraihospitality.com';

        // Auto-update database if they should be approved but aren't yet
        if (shouldBeApproved && !profile?.is_approved) {
          await supabase.from('profiles').update({ is_approved: true }).eq('id', session.user.id);
        }

        // Sync UserStore with Supabase Session
        setUser({
          id: session.user.id,
          name: session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || 'User',
          email: session.user.email,
          avatar: session.user.user_metadata?.avatar_url,
          role: 'owner',
          system_role: (profile?.system_role as any) || 'user',
          is_approved: shouldBeApproved
        });

        // Deep linking logic: 
        // Only go to home if the current path is '/' and we don't have an active page set.
        // Otherwise, let the existing routing logic handle things.
        if (window.location.pathname === '/' && activePage === 'home') {
           console.log('MainApp: Already at home, staying there');
        }

        // Seed default email templates to DB if not yet saved (admins only)
        if (profile?.system_role === 'super_admin' || profile?.system_role === 'it_admin') {
          const { data: existing } = await supabase.from('system_settings').select('key').eq('key', 'mention_email_template').maybeSingle();
          if (!existing) {
            await supabase.from('system_settings').upsert({
              key: 'mention_email_template',
              value: {
                subject: '{{mentionedBy}} mentioned you in {{itemName}}',
                bodyHtml: `<div style="font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 40px 20px;"><div style="text-align: center; margin-bottom: 20px;"><img src="https://guideline.lubd.com/wp-content/uploads/2025/11/NHG128-1.png" alt="NARAI" style="width: 80px; height: 80px; background-color: #1f291e; object-fit: contain; margin: 0 auto; display: block;" /></div><div style="max-width: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 4px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);"><div style="text-align: center; padding: 20px 20px 10px;"><a href="https://saturday.naraihospitalitygroup.com" style="color: #2563eb; text-decoration: underline; font-weight: bold; font-size: 16px;">saturday.com</a></div><div style="border-bottom: 2px solid #1e293b; margin: 0 20px;"></div><div style="padding: 30px 40px; text-align: center;"><p style="font-size: 15px; color: #475569; line-height: 1.5; margin-bottom: 16px;"><strong>{{mentionedBy}}</strong> mentioned you in <strong>{{itemName}}</strong> on board <strong>{{boardName}}</strong>.</p><div style="background-color: #f8fafc; border-left: 3px solid #a86315; padding: 12px 16px; margin: 0 0 20px; text-align: left; border-radius: 0 4px 4px 0;"><p style="font-size: 13px; color: #64748b; margin: 0; line-height: 1.6; font-style: italic;">"{{updatePreview}}"</p></div><a href="{{itemLink}}" style="background-color: #a86315; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold; font-size: 15px; display: inline-block;">View Update</a></div></div><div style="text-align: center; margin-top: 20px; font-size: 11px; color: #94a3b8;">Powered by <strong>NHG BusinessTech Team</strong></div></div>`
              },
              description: 'Template for @mention notifications'
            }, { onConflict: 'key' });
          }

          // Seed/upgrade the assign-item template (adds group name + direct item link)
          const { data: existingAssign } = await supabase.from('system_settings').select('value').eq('key', 'assign_item_template').maybeSingle();
          if (!existingAssign?.value?.bodyHtml?.includes('{{groupName}}')) {
            await supabase.from('system_settings').upsert({
              key: 'assign_item_template',
              value: {
                subject: "[You're assigned] {{itemName}}",
                bodyHtml: DEFAULT_ASSIGN_TEMPLATE
              },
              description: 'Template for item assignments'
            }, { onConflict: 'key' });
          }
        }

        console.log('MainApp: calling loadUserData');
        loadUserData();
      };

      initUser();
    } else if (!session) {
      // Handle logout - clear all state
      console.log('MainApp: session cleared (logged out)');
      lastUserIdRef.current = null;
      window.history.replaceState(null, '', '/');

      // Clear board store state
      useBoardStore.setState({
        activeBoardId: null,
        activeWorkspaceId: '',
        boards: [],
        workspaces: [],
        activePage: 'home',
        activeBoardMembers: [], 
        notifications: [],
        selectedItemIds: [],
        activeItemId: null
      });
    }
  }, [session?.user?.id]);

  // URL Sync and Popstate Handler
  useEffect(() => {
    // 1. Handle Popstate (Browser Back/Forward)
    const handlePopState = () => {
      const path = window.location.pathname;
      if (path === '/notifications') {
        navigateTo('notifications');
      } else if (path === '/' || path === '') {
        navigateTo('home');
      }
      // Note: We don't implement full deep link parsing on popstate here for simplicity in MVP, 
      // relying on the user to reload if they paste a URL or standard navigation. 
      // But we could add it. For now, we prefer the Store state to drive the URL.
      // Exception: If back button takes us to a board URL, we should probably switch.
      // Ideally, the Store updates should push state, so back button works.
    };

    window.addEventListener('popstate', handlePopState);

    // 2. Initial Deep Link Parsing (On Mount)
    const initPath = window.location.pathname;

    // If it's a Board URL: /:username/:workspace/:board


    if (initPath === '/notifications') {
      navigateTo('notifications');
    } else if (initPath === '/admin') {
      navigateTo('admin');
    }

    // Check for query parameters as fallback deep links
    const params = new URLSearchParams(window.location.search);
    const qBoardId = params.get('boardId');
    const qWorkspaceId = params.get('workspaceId');
    const qItemId = params.get('itemId');

    if (qBoardId) {
      useBoardStore.getState().setActiveBoard(qBoardId);
      if (qItemId) {
        useBoardStore.getState().setActiveItem(qItemId);
      }
    } else if (qWorkspaceId) {
      useBoardStore.getState().setActiveWorkspace(qWorkspaceId);
      useBoardStore.getState().navigateTo('home');
    }


    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // 3. Deep Link Resolution (On Initial Data Load ONLY)
  const hasResolvedDeepLink = useRef(false);
  useEffect(() => {
    if (isLoading || boards.length === 0 || hasResolvedDeepLink.current) return;

    const path = window.location.pathname;
    const parts = path.split('/').filter(Boolean);

    if (parts.length >= 3) {
      const targetWorkspaceSlug = parts[1];
      const targetBoardSlug = parts[2];

      const matchedBoard = boards.find(b => {
        const workspace = useBoardStore.getState().workspaces.find(w => w.id === b.workspaceId);
        return slugify(workspace?.title || '') === targetWorkspaceSlug && slugify(b.title) === targetBoardSlug;
      });

      if (matchedBoard && matchedBoard.id !== activeBoardId) {
        console.log('Deep Link: Found board', matchedBoard.title);
        useBoardStore.getState().setActiveBoard(matchedBoard.id);
      }
    } else if (parts.length === 2) {
      // Handle Workspace direct link: /[username]/[workspace-slug]
      const targetWorkspaceSlug = parts[1];
      const matchedWs = useBoardStore.getState().workspaces.find(w => slugify(w.title) === targetWorkspaceSlug);
      
      if (matchedWs) {
        console.log('Deep Link: Found workspace', matchedWs.title);
        useBoardStore.getState().setActiveWorkspace(matchedWs.id);
        useBoardStore.getState().navigateTo('home');
      }
    }
    hasResolvedDeepLink.current = true;
  }, [isLoading, boards.length]);

  // 4. State -> URL Sync
  useEffect(() => {
    if (isLoading) return;

    if (activePage === 'home') {
      if (window.location.pathname !== '/') {
        window.history.pushState(null, '', '/');
      }
    } else if (activePage === 'notifications') {
      if (window.location.pathname !== '/notifications') {
        window.history.pushState(null, '', '/notifications');
      }
    } else if (activePage === 'admin') {
      if (window.location.pathname !== '/admin') {
        window.history.pushState(null, '', '/admin');
      }
    } else if (activePage === 'dashboard') {
      const workspace = useBoardStore.getState().workspaces.find(w => w.id === activeWorkspaceId);
      const workspaceName = workspace ? slugify(workspace.title) : 'workspace';
      const currentUser = useUserStore.getState().currentUser;
      const username = currentUser ? slugify(currentUser.name) : 'u';
      const newPath = `/${username}/${workspaceName}/dashboard`;
      if (window.location.pathname !== newPath) {
        window.history.pushState(null, '', newPath);
      }
    } else if (activePage === 'board' && activeBoard) {
      const workspace = useBoardStore.getState().workspaces.find(w => w.id === activeBoard.workspaceId);
      const workspaceName = workspace ? slugify(workspace.title) : 'workspace';

      const currentUser = useUserStore.getState().currentUser;
      const username = currentUser ? slugify(currentUser.name) : 'u';

      const boardName = slugify(activeBoard.title);

      const newPath = `/${username}/${workspaceName}/${boardName}`;

      if (window.location.pathname !== newPath) {
        window.history.pushState(null, '', newPath);
      }
    }
  }, [activePage, activeBoardId, activeBoard, isLoading]);

  useEffect(() => {
    if (activeWorkspaceId) {
      subscribeToRealtime();

      // Polling Fallback to ensure consistency (5m) - running silently
      const intervalId = setInterval(() => {
        if (!document.hidden) {
          loadUserData(true);
        }
      }, 300000);

      return () => {
        unsubscribeFromRealtime();
        clearInterval(intervalId);
      };
    }
    return () => unsubscribeFromRealtime();
  }, [activeWorkspaceId]);

  if (isLoading) {
    return <LoadingScreen message="Loading your workspace..." />;
  }

  return (
    <div className="app-container" style={{ height: '100vh', display: 'flex', backgroundColor: 'hsl(var(--color-bg-surface))', borderRadius: '8px', overflow: 'hidden' }}>
      <Sidebar />
      <main style={{ 
          flex: 1, 
          display: 'flex', 
          flexDirection: 'column', 
          overflow: 'hidden', 
          backgroundColor: 'hsl(var(--color-bg-canvas))',
          borderRadius: '12px 0 0 0',
          borderLeft: '1px solid hsl(var(--color-border))',
          boxShadow: '-4px 0 15px rgba(0,0,0,0.03)'
      }}>
        {activePage !== 'board' && <TopBar />}

        {activePage === 'admin' ? (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999 }}>
            <Suspense fallback={<PageLoader />}>
              <AdminPage />
            </Suspense>
          </div>
        ) : activePage === 'notifications' ? (
          <div style={{ flex: 1, overflow: 'auto' }}>
            <Suspense fallback={<PageLoader />}>
              <NotificationPage />
            </Suspense>
          </div>
        ) : activePage === 'favorites' ? (
          <div style={{ flex: 1, overflow: 'auto' }}>
            <Suspense fallback={<PageLoader />}>
              <FavoritesPage />
            </Suspense>
          </div>
        ) : activePage === 'dashboard' ? (
          <Suspense fallback={<PageLoader />}>
            <WorkspaceDashboardPage />
          </Suspense>
        ) : activePage === 'board' && activeBoard ? (

          <Suspense fallback={<PageLoader />}>
            <BoardPage />
          </Suspense>
        ) : (
          <div style={{ flex: 1, overflow: 'auto' }}>
            <Suspense fallback={<PageLoader />}>
              <HomePage />
            </Suspense>
          </div>
        )}

        {/* Task Detail Side Panel */}
        <SidePanel isOpen={!!activeItemId} onClose={() => setActiveItem(null)}>
          {activeItemId && <TaskDetail itemId={activeItemId} onClose={() => setActiveItem(null)} />}
        </SidePanel>

        {/* BatchActionsBar moved to BoardPage */}

      </main>
      <ContactSupportButton />
    </div>
  )
}

function AppContent() {
  const { session, loading } = useAuth();
  const currentUser = useUserStore(state => state.currentUser);

  if (loading) {
    return <LoadingScreen />;
  }

  if (!session) {
    return <LoginPage />;
  }
  
  const ALLOWED_DOMAINS = ['naraihospitality.com', 'marasca.live', 'lubd.com'];
  const userDomain = currentUser?.email?.split('@')[1];
  const isAutoApproved = userDomain && ALLOWED_DOMAINS.includes(userDomain);

  // Only check approval if the user isn't the super admin and not from an auto-approved domain
  if (currentUser && currentUser.is_approved === false && currentUser.email !== 'khemmarin.k@naraihospitality.com' && !isAutoApproved) {
    return <PendingApprovalPage onSignOut={() => supabase.auth.signOut()} />;
  }

  return <MainApp />;
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
