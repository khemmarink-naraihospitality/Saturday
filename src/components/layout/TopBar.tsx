import { GlobalTopActions } from './GlobalTopActions';
import { useBoardStore } from '../../store/useBoardStore';

export const TopBar = () => {
    const activePage = useBoardStore(state => state.activePage);
    const activeWorkspaceId = useBoardStore(state => state.activeWorkspaceId);
    const workspaces = useBoardStore(state => state.workspaces);
    
    // Find active workspace or fallback to the first one available
    const activeWorkspace = workspaces.find(w => w.id === activeWorkspaceId) || workspaces[0];

    return (
        <div style={{
            height: '50px',
            width: '100%',
            backgroundColor: 'hsl(var(--color-bg-surface))',
            borderBottom: '1px solid hsl(var(--color-border))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 24px',
            gap: '12px',
            flexShrink: 0,
            zIndex: 50 // Ensure above table sticky headers if any conflict
        }}>
            {/* Left side: Title (only for dashboard or home) */}
            <div style={{ display: 'flex', alignItems: 'center' }}>
                {(activePage === 'dashboard' || activePage === 'home') && (
                    <h1 style={{ 
                        fontSize: '18px', 
                        fontWeight: 600, 
                        color: 'hsl(var(--color-text-primary))', 
                        margin: 0 
                    }}>
                        {activeWorkspace?.title || 'Finance'} Dashboard
                    </h1>
                )}
            </div>

            {/* Right side: Global Actions */}
            <GlobalTopActions />
        </div>
    );
};
