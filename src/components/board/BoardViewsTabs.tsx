import { useState, useEffect } from 'react';
import { useBoardStore } from '../../store/useBoardStore';
import { supabase } from '../../lib/supabase';

const BASE_VIEWS = [
    { id: 'main_table', label: 'Main table' },
    { id: 'timeline', label: 'Timeline' },
    { id: 'kanban', label: 'Kanban' },
    { id: 'calendar', label: 'Calendar' },
];

const AI_SUMMARY_VIEW = { id: 'ai_summary', label: '✦ AI Summary' };

// Module-level cache so we only fetch once per session
let aiEnabledCache: boolean | null = null;

export const BoardViewsTabs = () => {
    const activeBoardId = useBoardStore(state => state.activeBoardId);
    const activeBoard = useBoardStore(state => state.boards.find(b => b.id === activeBoardId));
    const setActiveView = useBoardStore(state => state.setActiveView);
    const [aiEnabled, setAiEnabled] = useState<boolean>(aiEnabledCache ?? false);

    useEffect(() => {
        if (aiEnabledCache !== null) return;
        supabase
            .from('system_settings')
            .select('value')
            .eq('key', 'ai_summary_enabled')
            .single()
            .then(({ data }) => {
                aiEnabledCache = data?.value === 'true';
                setAiEnabled(aiEnabledCache);
            });
    }, []);

    const views = aiEnabled ? [...BASE_VIEWS, AI_SUMMARY_VIEW] : BASE_VIEWS;
    const activeViewId = activeBoard?.activeViewId || 'main_table';

    if (!activeBoardId) return null;

    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            padding: '0 24px',
            gap: '16px',
            borderBottom: '1px solid hsl(var(--color-border))',
            backgroundColor: 'hsl(var(--color-bg-subtle))',
            height: '32px',
            minHeight: '32px'
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
                            color: isActive ? '#6b4cc3' : 'hsl(var(--color-text-secondary))',
                            borderBottom: isActive ? '2px solid #6b4cc3' : '2px solid transparent',
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
