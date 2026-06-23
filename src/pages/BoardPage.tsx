import { useEffect, useState } from 'react';
import { BatchActionsBar } from '../components/table/BatchActionsBar';
import { BoardHeader } from '../components/board/BoardHeader';
import { BoardViewsToolbar } from '../components/board/BoardViewsToolbar';
import { Table } from '../components/table/Table';
import { useBoardStore } from '../store/useBoardStore';
import { TimelineView } from '../components/table/TimelineView';
import { KanbanView } from '../components/kanban/KanbanView';
import { CalendarView } from '../components/calendar/CalendarView';
import { AISummaryView } from '../components/board/AISummaryView';
import { LoadingScreen } from '../components/common/LoadingScreen';
import { PinLockScreen } from '../components/board/PinLockScreen';
import { isBoardUnlocked } from '../lib/boardPinUnlock';

export const BoardPage = () => {
    const activeBoardId = useBoardStore(state => state.activeBoardId);
    const boards = useBoardStore(state => state.boards);
    const loadBoardData = useBoardStore(state => state.loadBoardData);
    const activeBoard = boards.find(b => b.id === activeBoardId);

    const [isUnlocked, setIsUnlocked] = useState(() => !activeBoardId || isBoardUnlocked(activeBoardId));

    useEffect(() => {
        if (!activeBoardId) return;
        setIsUnlocked(isBoardUnlocked(activeBoardId));
    }, [activeBoardId, activeBoard?.is_private]);

    useEffect(() => {
        if (!activeBoardId || !activeBoard || activeBoard.isDataLoaded) return;
        // Don't fetch columns/groups/items for a private board until the PIN
        // has been verified — otherwise the content would already be sitting
        // in the store (visible via devtools/network tab) before the lock screen
        // is passed, defeating the point of the PIN.
        if (activeBoard.is_private && !isUnlocked) return;

        console.log('BoardPage: Triggering lazy load for', activeBoardId);
        loadBoardData(activeBoardId);
    }, [activeBoardId, activeBoard?.isDataLoaded, activeBoard?.is_private, isUnlocked, loadBoardData]);

    if (!activeBoardId || !activeBoard) {
        return (
            <div style={{ padding: '60px', textAlign: 'center', color: 'hsl(var(--color-text-secondary))' }}>
                <h2 style={{ fontSize: '24px', marginBottom: '8px', color: 'hsl(var(--color-text-primary))' }}>Board Not Found</h2>
                <p>The board you are looking for does not exist, or you might not have access to it.</p>
                <button
                    onClick={() => useBoardStore.getState().navigateTo('home')}
                    className="btn-primary"
                    style={{ marginTop: '24px', padding: '8px 16px', borderRadius: '6px' }}
                >
                    Return to Home
                </button>
            </div>
        );
    }

    // Gate on the PIN before ever loading (or showing a spinner for) the
    // board's actual content — checked ahead of the isDataLoaded guard below,
    // since we deliberately skip loadBoardData while locked.
    if (activeBoard.is_private && !isUnlocked) {
        return (
            <div style={{ position: 'relative', height: '100%' }}>
                <PinLockScreen
                    boardId={activeBoard.id}
                    boardTitle={activeBoard.title}
                    onUnlocked={() => setIsUnlocked(true)}
                />
            </div>
        );
    }

    // Safety check: Prevent white screens if the board is deleted or deeply linked incorrectly
    if (!activeBoard.isDataLoaded) {
        return <LoadingScreen message="Loading board content..." />;
    }

    // Safety fallback for malformed board data
    if (!activeBoard.groups || !activeBoard.columns) {
        return (
             <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'hsl(var(--color-bg-base))', flexDirection: 'column', gap: '16px' }}>
                <span style={{ color: '#ef4444', fontSize: '14px' }}>Error: Board data is incomplete.</span>
                <button onClick={() => window.location.reload()} className="btn-primary" style={{ padding: '8px 16px' }}>Reload Application</button>
            </div>
        );
    }

    const activeViewId = activeBoard.activeViewId || 'main_table';

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', backgroundColor: 'hsl(var(--color-bg-canvas))' }}>
            <BoardHeader boardId={activeBoardId} />
            
            <div style={{ 
                flex: 1, 
                display: 'flex', 
                flexDirection: 'column', 
                overflow: 'hidden',
                padding: '0 var(--spacing-board-x) var(--spacing-board-y) var(--spacing-board-x)'
            }}>
                <BoardViewsToolbar />
                
                <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', marginTop: '16px' }}>
                    {activeViewId === 'main_table' ? (
                        <Table boardId={activeBoardId} />
                    ) : activeViewId === 'timeline' ? (
                        <TimelineView />
                    ) : activeViewId === 'kanban' ? (
                        <KanbanView />
                    ) : activeViewId === 'calendar' ? (
                        <CalendarView />
                    ) : activeViewId === 'ai_summary' ? (
                        <AISummaryView />
                    ) : (
                        <div style={{ padding: '40px', textAlign: 'center', color: 'hsl(var(--color-text-tertiary))' }}>
                            <h2 style={{ fontSize: '24px', marginBottom: '16px' }}>{activeViewId.charAt(0).toUpperCase() + activeViewId.slice(1)} View</h2>
                            <p>This view is currently being implemented to match the requested premium design.</p>
                        </div>
                    )}
                </div>
            </div>
            <BatchActionsBar />
        </div>
    );
};
