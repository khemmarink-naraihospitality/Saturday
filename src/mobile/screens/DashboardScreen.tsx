import { lazy, Suspense, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import './screens.css';
import { useBoardStore } from '../../store/useBoardStore';
import { useAccessibleWorkspaces } from '../../hooks/useAccessibleWorkspaces';
import { BottomSheet, CenteredSpinner, EmptyState } from '../ui';
import { openDashboard } from '../nav/navigation';
import { afterSheetClose } from '../nav/history';
import { WorkspaceRow } from './parts';
import { orderedWorkspaceTree, workspacePath } from './data';

import { useTerms } from '../../lib/terms';
// The desktop dashboard page, which stacks its widgets in one column when it
// sees a phone (useIsMobile in WorkspaceDashboardPage).
const WorkspaceDashboardPage = lazy(() =>
    import('../../pages/WorkspaceDashboardPage').then(m => ({ default: m.WorkspaceDashboardPage }))
);

/** The Dashboard tab: the active workspace's dashboard, with a switcher in the title. */
export const DashboardScreen = () => {
    const t = useTerms();
    const workspace = useBoardStore(state => state.workspaces.find(w => w.id === state.activeWorkspaceId));
    const workspaces = useBoardStore(state => state.workspaces);
    const accessible = useAccessibleWorkspaces();
    const [picking, setPicking] = useState(false);

    return (
        <div className="m-screen" data-testid="m-dashboard">
            <header className="m-header">
                <button
                    type="button"
                    className="m-dash-title"
                    onClick={() => setPicking(true)}
                    aria-label={`Choose ${t.workspace}`}
                    style={{ flex: 1 }}
                >
                    <span style={{ minWidth: 0 }}>
                        <span className="m-dash-title__sub" style={{ display: 'block' }}>Dashboard</span>
                        <span className="m-header__title" style={{ display: 'block' }}>{workspace?.title || 'Choose a workspace'}</span>
                    </span>
                    <ChevronDown size={22} style={{ flexShrink: 0, marginTop: 14 }} />
                </button>
            </header>

            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                {workspace ? (
                    <Suspense fallback={<CenteredSpinner message="Loading dashboard…" />}>
                        <WorkspaceDashboardPage key={workspace.id} />
                    </Suspense>
                ) : (
                    <EmptyState title={`No ${t.workspace}`}>{`Pick a ${t.workspace} to see its dashboard.`}</EmptyState>
                )}
            </div>

            <BottomSheet open={picking} onClose={() => setPicking(false)} title={t.Workspace} size={accessible.length > 6 ? 'tall' : 'auto'}>
                <div style={{ padding: '0 20px 24px' }}>
                    {orderedWorkspaceTree(accessible).map(({ workspace: w, depth }) => (
                        <WorkspaceRow
                            key={w.id}
                            workspace={w}
                            indent={depth}
                            meta={w.id === workspace?.id ? 'Showing now' : w.parentId ? workspacePath(w.id, workspaces) : undefined}
                            onOpen={() => {
                                setPicking(false);
                                afterSheetClose(() => openDashboard(w.id));
                            }}
                        />
                    ))}
                </div>
            </BottomSheet>
        </div>
    );
};
