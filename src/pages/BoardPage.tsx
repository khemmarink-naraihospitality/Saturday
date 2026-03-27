import { BatchActionsBar } from '../components/table/BatchActionsBar';
import { BoardHeader } from '../components/board/BoardHeader';
import { BoardViewsToolbar } from '../components/board/BoardViewsToolbar';
import { Table } from '../components/table/Table';
import { useBoardStore } from '../store/useBoardStore';
import { TimelineView } from '../components/table/TimelineView';
import { KanbanView } from '../components/kanban/KanbanView';
import { CalendarView } from '../components/calendar/CalendarView';

const BoardLoader = () => (
    <div style={{ 
        flex: 1, 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center', 
        justifyContent: 'center',
        padding: '100px 0',
        gap: '20px'
    }}>
        <div style={{
            width: '40px',
            height: '40px',
            border: '3px solid hsl(var(--color-bg-surface-hover))',
            borderTop: '3px solid hsl(var(--color-brand-primary))',
            borderRadius: '50%',
            animation: 'spin 1.2s linear infinite'
        }} />
        <span style={{ fontSize: '14px', color: 'hsl(var(--color-text-tertiary))', fontWeight: 500 }}>
            Fetching board details...
        </span>
        <style>{`
            @keyframes spin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
            }
        `}</style>
    </div>
);

export const BoardPage = () => {
    const activeBoardId = useBoardStore(state => state.activeBoardId);
    const activeBoard = useBoardStore(state => state.boards.find(b => b.id === activeBoardId));
    const isBoardLoading = useBoardStore(state => activeBoardId ? state.isBoardLoading[activeBoardId] : false);
    
    // Safety check, though App.tsx should handle this
    if (!activeBoardId || !activeBoard) return null;

    const activeViewId = activeBoard.activeViewId || 'main_table';

    // Content is empty if columns/groups haven't been loaded yet and we're lazy loading
    const isContentMissing = activeBoard.columns.length === 0 && activeBoard.groups.length === 0;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
            <BoardHeader boardId={activeBoardId} />
            <BoardViewsToolbar />
            <div style={{ flex: 1, overflow: 'hidden', padding: '0', display: 'flex', flexDirection: 'column' }}>
                {(isBoardLoading || isContentMissing) ? (
                    <BoardLoader />
                ) : activeViewId === 'main_table' ? (
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
