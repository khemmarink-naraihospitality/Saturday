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
    const activeBoard = useBoardStore(state => state.boards.find(b => b.id === activeBoardId));
    
    // Safety check, though App.tsx should handle this
    if (!activeBoardId || !activeBoard) return null;

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
