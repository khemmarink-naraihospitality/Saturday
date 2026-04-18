import { useEffect } from 'react';
import { BatchActionsBar } from '../components/table/BatchActionsBar';
import { BoardHeader } from '../components/board/BoardHeader';
import { BoardViewsToolbar } from '../components/board/BoardViewsToolbar';
import { Table } from '../components/table/Table';
import { useBoardStore } from '../store/useBoardStore';
import { TimelineView } from '../components/table/TimelineView';
import { KanbanView } from '../components/kanban/KanbanView';
import { CalendarView } from '../components/calendar/CalendarView';

export const BoardPage = () => {
    const activeBoardId = useBoardStore(state => state.activeBoardId);
    const boards = useBoardStore(state => state.boards);
    const loadBoardData = useBoardStore(state => state.loadBoardData);
    const activeBoard = boards.find(b => b.id === activeBoardId);

    useEffect(() => {
        if (activeBoardId && activeBoard && !activeBoard.isDataLoaded) {
            console.log('BoardPage: Triggering lazy load for', activeBoardId);
            loadBoardData(activeBoardId);
        }
    }, [activeBoardId, activeBoard?.isDataLoaded, loadBoardData]);
    
    // Safety check: Prevent white screens if the board is deleted or deeply linked incorrectly
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
    
    const activeViewId = activeBoard.activeViewId || 'main_table';

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
            <BoardHeader boardId={activeBoardId} />
            <BoardViewsToolbar />
            <div style={{ flex: 1, overflow: 'hidden', padding: '0', display: 'flex', flexDirection: 'column' }}>
                {activeViewId === 'main_table' ? (
                    <Table boardId={activeBoardId} />
                ) : activeViewId === 'timeline' ? (
                    <TimelineView />
                ) : activeViewId === 'kanban' ? (
                    <KanbanView />
                ) : activeViewId === 'calendar' ? (
                    <CalendarView />
                ) : (
                    <div style={{ padding: '40px', textAlign: 'center', color: 'hsl(var(--color-text-tertiary))' }}>
                        <h2 style={{ fontSize: '24px', marginBottom: '16px' }}>{activeViewId.charAt(0).toUpperCase() + activeViewId.slice(1)} View</h2>
                        <p>This view is currently being implemented to match the requested premium design.</p>
                    </div>
                )}
            </div>
            <BatchActionsBar />
        </div>
    );
};
