import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Copy, Loader2, Lock, Send, Settings, Sparkles } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useBoardStore } from '../../../store/useBoardStore';
import { useUserStore } from '../../../store/useUserStore';
import { useGeminiEnabled } from '../../../hooks/useGeminiEnabled';
import { geminiPayload, type BoardSummary, type GeminiLanguage, type GeminiPeriod } from '../../../lib/boardSummary';
import { requestAdminTab } from '../../../lib/adminTab';
import { useTerms } from '../../../lib/terms';
import type { Board } from '../../../types';

/*
 * The AI Summary tab's top section: Gemini, on Google's free tier, writes the
 * board up in Thai or English — overview, issues, trends, suggestions — from
 * the calculated section's facts plus each task's details and the period's
 * comments (geminiPayload). The ai-summary edge function holds the key, refuses
 * private boards and keeps the last summary per board (board_ai_summaries),
 * which everyone on the board sees here until someone writes a new one. On a
 * wide card the note on what is sent sits beside the button (.ais-send) and
 * the issues, trends and suggestions sit side by side (.ais-trio).
 */

interface Written { overview: string; issues: string[]; trends: string[]; suggestions: string[] }

interface Result {
    summary: Written;
    modelName: string;
    generatedAt: string;
    generatedByName?: string | null;
    language: GeminiLanguage;
    period: GeminiPeriod;
}

const PERIODS: { id: GeminiPeriod; label: string; words: string }[] = [
    { id: '7d', label: '7 days', words: 'the last 7 days' },
    { id: '30d', label: '30 days', words: 'the last 30 days' },
    { id: '90d', label: '90 days', words: 'the last 90 days' },
    { id: 'all', label: 'All', words: 'all time' },
];

const LANGUAGES: { id: GeminiLanguage; label: string }[] = [
    { id: 'th', label: 'ไทย' },
    { id: 'en', label: 'English' },
];

const modelName = (id: string | null | undefined) =>
    !id ? 'Gemini'
        : id === 'gemini-flash-latest' ? 'Gemini Flash (latest)'
            : id.split('-').map(w => (/^\d/.test(w) ? w : w[0].toUpperCase() + w.slice(1))).join(' ');

const listOf = (v: unknown): string[] => (Array.isArray(v) ? v.map(String).filter(Boolean) : []);

/** The function's answer (or a kept row) as one shape; an older function sent the text alone. */
const writtenOf = (raw: unknown): Written => {
    if (typeof raw === 'string') return { overview: raw, issues: [], trends: [], suggestions: [] };
    const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    return { overview: String(o.overview ?? ''), issues: listOf(o.issues), trends: listOf(o.trends), suggestions: listOf(o.suggestions) };
};

const stored = <T extends string>(key: string, allowed: readonly T[], fallback: T): T => {
    try {
        const v = localStorage.getItem(key) as T | null;
        return v && allowed.includes(v) ? v : fallback;
    } catch { return fallback; }
};

const remember = (key: string, value: string) => {
    try { localStorage.setItem(key, value); } catch { /* private mode */ }
};

const when = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export const GeminiSection = ({ board, summary, personName }: {
    board: Board;
    summary: BoardSummary;
    personName: (id: string) => string | undefined;
}) => {
    const t = useTerms();
    const enabled = useGeminiEnabled();
    const role = useUserStore(state => state.currentUser?.system_role);
    const navigateTo = useBoardStore(state => state.navigateTo);
    const isAdmin = role === 'super_admin' || role === 'it_admin';

    const [period, setPeriod] = useState<GeminiPeriod>(() => stored('aiSummaryPeriod', ['7d', '30d', '90d', 'all'] as const, '30d'));
    const [language, setLanguage] = useState<GeminiLanguage>(() => stored('aiSummaryLanguage', ['th', 'en'] as const, 'th'));
    const [result, setResult] = useState<Result | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    // The last summary written for this board, by anyone.
    useEffect(() => {
        let live = true;
        setResult(null);
        setError(null);
        supabase
            .from('board_ai_summaries')
            .select('summary, model, language, period, generated_at, generated_by_name')
            .eq('board_id', board.id)
            .maybeSingle()
            .then(({ data }) => {
                if (!live || !data) return;
                setResult({
                    summary: writtenOf(data.summary),
                    modelName: modelName(data.model),
                    generatedAt: data.generated_at,
                    generatedByName: data.generated_by_name,
                    language: data.language,
                    period: data.period,
                });
            }, () => { /* nothing kept yet, or not readable: the button still works */ });
        return () => { live = false; };
    }, [board.id]);

    const items = board.items || [];
    const sending = useMemo(
        () => geminiPayload(board, summary, { period, language, terms: t, personName }),
        [board, summary, period, language, t, personName]
    );
    const taskCount = sending.groups.reduce((n, g) => n + g.tasks.length, 0);
    const commentsLoading = items.filter(i => !i.parentId && !i.updatesLoaded && (i.updatesCount ?? 0) > 0).length;
    const periodWords = PERIODS.find(p => p.id === period)?.words ?? 'the last 30 days';

    const pickPeriod = (p: GeminiPeriod) => { setPeriod(p); remember('aiSummaryPeriod', p); };
    const pickLanguage = (l: GeminiLanguage) => { setLanguage(l); remember('aiSummaryLanguage', l); };

    const write = async () => {
        setBusy(true);
        setError(null);
        try {
            const { data, error: callError } = await supabase.functions.invoke('ai-summary', { body: { mode: 'summarize', ...sending } });
            if (callError) {
                let detail = callError.message;
                try {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const body = await ((callError as any).context as Response)?.json();
                    detail = body?.error ?? body?.message ?? detail;
                } catch { /* not JSON */ }
                throw new Error(detail);
            }
            if (data?.error) throw new Error(data.error);
            setResult({
                summary: writtenOf(data?.summary),
                modelName: data?.modelName || modelName(data?.model),
                generatedAt: data?.generatedAt || new Date().toISOString(),
                generatedByName: data?.generatedByName,
                language: data?.language || language,
                period: data?.period || period,
            });
        } catch (err) {
            setError(err instanceof Error && err.message ? err.message : 'Gemini could not write the summary. Try again.');
        } finally {
            setBusy(false);
        }
    };

    const copy = async () => {
        if (!result) return;
        const s = result.summary;
        const block = (title: string, list: string[]) => (list.length ? `\n${title}\n${list.map(x => `- ${x}`).join('\n')}\n` : '');
        const text = [
            `AI Summary: ${board.title} (${PERIODS.find(p => p.id === result.period)?.words ?? ''}, ${when(result.generatedAt)})`,
            '',
            s.overview,
            block('Issues and risks', s.issues),
            block('Trends', s.trends),
            block('Suggestions', s.suggestions),
            `Written by ${result.modelName} on the Gemini API's free tier. Check it before you share it.`,
        ].join('\n').replace(/\n{3,}/g, '\n\n');
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch { /* clipboard refused: nothing to show */ }
    };

    const openSettings = () => {
        requestAdminTab('ai_settings');
        navigateTo('admin');
    };

    let body: React.ReactNode;
    if (board.is_private) {
        body = (
            <div className="ais-callout ais-callout--plain">
                <Lock size={15} aria-hidden="true" />
                <span>{`Private ${t.boards} are never sent to Gemini: on the free tier Google may use what it is sent to improve its products. The numbers below still cover this ${t.board}.`}</span>
            </div>
        );
    } else if (enabled === false) {
        body = (
            <div className="ais-callout ais-callout--plain">
                <Settings size={15} aria-hidden="true" />
                <span>
                    {`Gemini is switched off. An admin can switch it on for every ${t.board} in Admin Console › AI Settings.`}
                    {isAdmin && (
                        <>
                            {' '}
                            <button type="button" className="ais-more" onClick={openSettings}>Open AI Settings</button>
                        </>
                    )}
                </span>
            </div>
        );
    } else {
        body = (
            <>
                <div className="ais-controls">
                    <span className="ais-control">
                        Period
                        <span className="ais-seg" role="group" aria-label="Period">
                            {PERIODS.map(p => (
                                <button key={p.id} type="button" aria-pressed={period === p.id} onClick={() => pickPeriod(p.id)}>{p.label}</button>
                            ))}
                        </span>
                    </span>
                    <span className="ais-control">
                        Language
                        <span className="ais-seg" role="group" aria-label="Language">
                            {LANGUAGES.map(l => (
                                <button key={l.id} type="button" aria-pressed={language === l.id} onClick={() => pickLanguage(l.id)}>{l.label}</button>
                            ))}
                        </span>
                    </span>
                </div>

                <div className="ais-send">
                    <div className="ais-callout">
                        <Send size={15} aria-hidden="true" />
                        <span>
                            <strong>Sent to Google: </strong>
                            {`the ${t.items}' names, statuses, people, deadlines and other filled-in columns, and the ${t.updates} from ${periodWords}, as text. On the free tier Google may use them to improve its products.`}
                            {commentsLoading > 0 && ` (${t.Updates} on ${commentsLoading} ${commentsLoading === 1 ? t.item : t.items} are still loading.)`}
                        </span>
                    </div>

                    <div className="ais-actions">
                        <button type="button" className="ais-btn" onClick={write} disabled={busy || enabled !== true || taskCount === 0}>
                            {busy ? <Loader2 size={15} className="ais-spin" aria-hidden="true" /> : <Sparkles size={15} aria-hidden="true" />}
                            {busy ? 'Writing…' : result ? 'Write a new summary' : 'Write summary'}
                        </button>
                        {busy && <span className="ais-wait" role="status">{`Gemini is reading ${taskCount} ${taskCount === 1 ? t.item : t.items}…`}</span>}
                        {!busy && taskCount === 0 && <span className="ais-wait">{`Nothing from ${periodWords} to send.`}</span>}
                    </div>
                </div>

                {error && (
                    <div className="ais-callout ais-callout--error" role="alert">
                        <AlertTriangle size={15} aria-hidden="true" />
                        <span>{error}</span>
                    </div>
                )}
            </>
        );
    }

    return (
        <section className="ais-sec card-surface" aria-labelledby="ais-gemini-title">
            <div className="ais-sec__head">
                <div className="ais-sec__eyebrow"><span className="ais-sec__mark" aria-hidden="true"><Sparkles size={12} /></span>Gemini API · free tier</div>
                <div className="ais-sec__titlerow">
                    <h3 id="ais-gemini-title">Written by Gemini</h3>
                    <div className="ais-chips">
                        <span className="ais-chip ais-chip--ok"><Check size={12} aria-hidden="true" />Free, within Google's limits</span>
                        <span className="ais-chip ais-chip--warn"><Send size={12} aria-hidden="true" />Sent to Google</span>
                    </div>
                </div>
            </div>

            {body}

            {result && !board.is_private && (
                <div className="ais-result" aria-live="polite">
                    <div className="ais-meta">
                        <Sparkles size={12} aria-hidden="true" />
                        <b>{result.modelName}</b>
                        <span>·</span>
                        <span>{when(result.generatedAt)}</span>
                        {result.generatedByName && <><span>·</span><span>{`by ${result.generatedByName}`}</span></>}
                        <span>·</span>
                        <span>{PERIODS.find(p => p.id === result.period)?.words}</span>
                    </div>
                    {result.summary.overview && <p className="ais-overview">{result.summary.overview}</p>}
                    {(result.summary.issues.length > 0 || result.summary.trends.length > 0 || result.summary.suggestions.length > 0) && (
                        <div className="ais-trio">
                            {result.summary.issues.length > 0 && (
                                <div>
                                    <h4 className="ais-h">Issues and risks</h4>
                                    <ul className="ais-list ais-list--issues">{result.summary.issues.map((x, i) => <li key={i}>{x}</li>)}</ul>
                                </div>
                            )}
                            {result.summary.trends.length > 0 && (
                                <div>
                                    <h4 className="ais-h">Trends</h4>
                                    <ul className="ais-list ais-list--trends">{result.summary.trends.map((x, i) => <li key={i}>{x}</li>)}</ul>
                                </div>
                            )}
                            {result.summary.suggestions.length > 0 && (
                                <div>
                                    <h4 className="ais-h">Suggestions</h4>
                                    <ul className="ais-list ais-list--steps">{result.summary.suggestions.map((x, i) => <li key={i}>{x}</li>)}</ul>
                                </div>
                            )}
                        </div>
                    )}
                    <div className="ais-actions">
                        <button type="button" className="ais-ghost" onClick={copy}>
                            {copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
                            {copied ? 'Copied' : 'Copy text'}
                        </button>
                    </div>
                </div>
            )}

            <p className="ais-limit">
                <AlertTriangle size={13} aria-hidden="true" />
                Gemini can be wrong, so read it before you share it. Google can change the free models and their limits at any time.
            </p>
        </section>
    );
};
