import { useBoardStore } from '../../store/useBoardStore';
import { useTerms } from '../../lib/terms';
import { useNewUi } from '../../lib/brand';
import { Calendar, Columns3, GanttChart, Sparkles, Table2, type LucideIcon } from 'lucide-react';

// NHG draws each view as a pill with its symbol
const VIEW_ICON: Record<string, LucideIcon> = { main_table: Table2, timeline: GanttChart, kanban: Columns3, calendar: Calendar, ai_summary: Sparkles };

// AI Summary is on every board: its first section is worked out here and sends
// nothing anywhere (Admin › AI Settings switches only its Gemini section).
const VIEWS = [
    { id: 'main_table', label: 'Main table' },
    { id: 'timeline', label: 'Timeline' },
    { id: 'kanban', label: 'Kanban' },
    { id: 'calendar', label: 'Calendar' },
    { id: 'ai_summary', label: '✦ AI Summary' },
];

export const BoardViewsTabs = () => {
    const activeBoardId = useBoardStore(state => state.activeBoardId);
    const activeBoard = useBoardStore(state => state.boards.find(b => b.id === activeBoardId));
    const setActiveView = useBoardStore(state => state.setActiveView);
    const t = useTerms();
    const newUi = useNewUi();

    const views = VIEWS;
    const activeViewId = activeBoard?.activeViewId || 'main_table';

    if (!activeBoardId) return null;

    // NHG: a glass segmented control, each view a pill with its symbol
    if (newUi) {
        return (
            <div className="seg glass-chip" role="tablist" aria-label="Views">
                {views.map(view => {
                    const isActive = activeViewId === view.id;
                    const Icon = VIEW_ICON[view.id];
                    return (
                        <button
                            key={view.id}
                            role="tab"
                            aria-selected={isActive}
                            className={`seg-btn${isActive ? ' is-active' : ''}`}
                            onClick={() => setActiveView(activeBoardId, view.id)}
                        >
                            {Icon && <Icon size={14} aria-hidden="true" />}
                            {view.id === 'ai_summary' ? 'AI Summary' : view.id === 'main_table' ? t.mainTable : view.label}
                        </button>
                    );
                })}
            </div>
        );
    }

    return (
        <div className="board-view-tabs" style={{
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
                        className={`board-view-tab${isActive ? ' is-active' : ''}`}
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
                        {view.id === 'main_table' ? t.mainTable : view.label}
                    </button>
                );
            })}
        </div>
    );
};
