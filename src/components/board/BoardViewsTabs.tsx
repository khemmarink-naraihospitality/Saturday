import { useBoardStore } from '../../store/useBoardStore';

const views = [
    { id: 'main_table', label: 'Main table' },
    { id: 'timeline', label: 'Timeline' },
    { id: 'kanban', label: 'Kanban' },
    { id: 'calendar', label: 'Calendar' },
];

export const BoardViewsTabs = () => {
    const activeBoardId = useBoardStore(state => state.activeBoardId);
    const activeBoard = useBoardStore(state => state.boards.find(b => b.id === activeBoardId));
    const setActiveView = useBoardStore(state => state.setActiveView);
    
    const activeViewId = activeBoard?.activeViewId || 'main_table';

    if (!activeBoardId) return null;

    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            padding: '0 32px',
            gap: '24px',
            borderBottom: '1px solid hsl(var(--color-border))',
            backgroundColor: 'hsl(var(--color-bg-subtle))',
            height: '40px',
            minHeight: '40px'
        }}>
            {views.map(view => {
                const isActive = activeViewId === view.id;
                return (
                    <button
                        key={view.id}
                        onClick={() => setActiveView(activeBoardId, view.id)}
                        style={{
                            height: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            fontSize: '14px',
                            color: isActive ? 'hsl(var(--color-brand-primary))' : 'hsl(var(--color-text-secondary))',
                            borderBottom: isActive ? '2px solid hsl(var(--color-brand-primary))' : '2px solid transparent',
                            cursor: 'pointer',
                            background: 'none',
                            borderTop: 'none',
                            borderLeft: 'none',
                            borderRight: 'none',
                            padding: '0 4px',
                            fontWeight: isActive ? 500 : 400,
                            transition: 'all 0.2s ease',
                            marginTop: '2px' // Offset for border bottom
                        }}
                    >
                        {view.label}
                    </button>
                );
            })}
        </div>
    );
};
