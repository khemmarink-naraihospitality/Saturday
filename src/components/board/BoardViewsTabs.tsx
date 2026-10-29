import { useBoardStore } from '../../store/useBoardStore';
import { shownViewId, useAiSummaryEnabled } from '../../hooks/useAiSummaryEnabled';

const BASE_VIEWS = [
    { id: 'main_table', label: 'Main table' },
    { id: 'timeline', label: 'Timeline' },
    { id: 'kanban', label: 'Kanban' },
    { id: 'calendar', label: 'Calendar' },
];

const AI_SUMMARY_VIEW = { id: 'ai_summary', label: '✦ AI Summary' };

export const BoardViewsTabs = () => {
    const activeBoardId = useBoardStore(state => state.activeBoardId);
    const activeBoard = useBoardStore(state => state.boards.find(b => b.id === activeBoardId));
    const setActiveView = useBoardStore(state => state.setActiveView);
    // Offered only when switched on in Admin › AI Settings (the backend needs its key).
    const aiEnabled = useAiSummaryEnabled();

    const views = aiEnabled ? [...BASE_VIEWS, AI_SUMMARY_VIEW] : BASE_VIEWS;
    const activeViewId = shownViewId(activeBoard?.activeViewId, aiEnabled);

    if (!activeBoardId) return null;

    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            padding: '0 24px',
            gap: '16px',
            borderBottom: '1px solid hsl(var(--color-border))',
            // -canvas, matching BoardHeader's own wrapper and <main> — this tab strip
            // sits between two white regions (title above, table below) and used to
            // be a leftover -subtle band sandwiched between them.
            backgroundColor: 'hsl(var(--color-bg-canvas))',
            height: '32px',
            minHeight: '32px'
        }}>
            {views.map(view => {
                const isActive = activeViewId === view.id;
                return (
                    <button
                        key={view.id}
                        className="board-view-tab"
                        onClick={() => setActiveView(activeBoardId, view.id)}
                        style={{
                            height: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            fontSize: '14px',
                            // The violet is Saturday's; a palette may set --color-nav-accent
                            color: isActive ? 'var(--color-nav-accent, #6b4cc3)' : 'hsl(var(--color-text-secondary))',
                            borderBottom: isActive ? '2px solid var(--color-nav-accent, #6b4cc3)' : '2px solid transparent',
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
