import { useEffect, useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useBoardStore } from '../../store/useBoardStore';
import { supabase } from '../../lib/supabase';
import { useTerms } from '../../lib/terms';
import { useToday } from '../../hooks/useToday';
import { summarizeBoard, type SummaryLog } from '../../lib/boardSummary';
import { CalculatedSection } from './aiSummary/CalculatedSection';
import { GeminiSection } from './aiSummary/GeminiSection';

/*
 * The AI Summary tab, in two sections (src/styles/ai_summary.css):
 *  A. worked out here from the board's own numbers and its activity log, free
 *     and with nothing sent anywhere (src/lib/boardSummary.ts);
 *  B. written by Gemini on Google's free tier, through the ai-summary edge
 *     function, while Admin › AI Settings has it switched on.
 * Both palettes, desktop and phone.
 */

const LOG_DAYS = 60;
const PAGE = 1000;

/** This board's status changes and comments over the last 60 days; null when they can't be read. */
const fetchBoardLogs = async (boardId: string): Promise<SummaryLog[] | null> => {
    const since = new Date(Date.now() - LOG_DAYS * 86400000).toISOString();
    const out: SummaryLog[] = [];
    for (let page = 0; page < 8; page++) {
        const { data, error } = await supabase
            .from('activity_logs')
            .select('action_type, created_at, target_id, new_value:metadata->>new_value')
            .eq('metadata->>board_id', boardId)
            .in('action_type', ['item_status_updated', 'item_comment_added'])
            .gte('created_at', since)
            .order('created_at', { ascending: false })
            .range(page * PAGE, page * PAGE + PAGE - 1);
        if (error) {
            console.error('AI Summary: activity log not read', error);
            return null;
        }
        const rows = (data || []) as unknown as { action_type: string; created_at: string; target_id: string | null; new_value: string | null }[];
        rows.forEach(r => out.push({ action: r.action_type, at: r.created_at, itemId: r.target_id, newValue: r.new_value }));
        if (rows.length < PAGE) break;
    }
    return out;
};

const storedChoice = (key: string): string | null => {
    try { return localStorage.getItem(key); } catch { return null; }
};

const storeChoice = (key: string, value: string) => {
    try { localStorage.setItem(key, value); } catch { /* private mode: not remembered */ }
};

export const AISummaryView = () => {
    const t = useTerms();
    const boardId = useBoardStore(state => state.activeBoardId);
    const board = useBoardStore(state => state.boards.find(b => b.id === state.activeBoardId));
    const members = useBoardStore(state => state.activeBoardMembers);
    const today = useToday();

    const statusKey = `aiSummaryStatusColumn:${boardId}`;
    const [statusColumnId, setStatusColumnId] = useState<string | null>(() => storedChoice(statusKey));
    // undefined while loading, null when it couldn't be read
    const [logs, setLogs] = useState<SummaryLog[] | null | undefined>(undefined);

    useEffect(() => {
        setStatusColumnId(storedChoice(statusKey));
    }, [statusKey]);

    useEffect(() => {
        if (!boardId) return;
        let live = true;
        setLogs(undefined);
        fetchBoardLogs(boardId).then(rows => { if (live) setLogs(rows); });
        return () => { live = false; };
    }, [boardId]);

    const personName = useMemo(() => {
        const names = new Map<string, string>();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (members || []).forEach((m: any) => {
            const profile = Array.isArray(m?.profiles) ? m.profiles[0] : m?.profiles;
            const name = profile?.full_name || profile?.email;
            if (m?.user_id && name) names.set(m.user_id, name);
        });
        return (id: string) => names.get(id);
    }, [members]);

    const summary = useMemo(
        () => (board ? summarizeBoard(board, { terms: t, today, statusColumnId, personName, logs: logs ?? null }) : null),
        [board, t, today, statusColumnId, personName, logs]
    );

    if (!board || !summary) return null;

    const pickStatusColumn = (id: string) => {
        setStatusColumnId(id);
        storeChoice(statusKey, id);
    };

    return (
        <div className="ais">
            <div className="ais__inner">
                <header className="ais-head">
                    <span className="ais-head__tile" aria-hidden="true"><Sparkles size={18} /></span>
                    <div>
                        <h2>AI Summary</h2>
                        <p>{`Two ways to sum up “${board.title}”: from the ${t.board}'s own numbers, or written by Gemini.`}</p>
                    </div>
                </header>
                <div className="ais-grid">
                    <CalculatedSection summary={summary} logsLoading={logs === undefined} onPickStatusColumn={pickStatusColumn} />
                    <GeminiSection board={board} summary={summary} personName={personName} />
                </div>
            </div>
        </div>
    );
};
