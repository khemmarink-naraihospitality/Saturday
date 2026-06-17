import { useState } from 'react';
import { Sparkles, RefreshCw, AlertCircle, Clock, Zap } from 'lucide-react';
import { useBoardStore } from '../../store/useBoardStore';
import { supabase } from '../../lib/supabase';
import type { Column, Item } from '../../types';

type Period = '1w' | '1m' | '1y' | 'all';

const PERIODS: { id: Period; label: string; ms: number | null }[] = [
    { id: '1w',  label: '1 Week',  ms: 7 * 24 * 60 * 60 * 1000 },
    { id: '1m',  label: '1 Month', ms: 30 * 24 * 60 * 60 * 1000 },
    { id: '1y',  label: '1 Year',  ms: 365 * 24 * 60 * 60 * 1000 },
    { id: 'all', label: 'All Time', ms: null },
];

function periodLabel(id: Period) {
    return PERIODS.find(p => p.id === id)?.label ?? '1 Month';
}

function resolveStatusLabel(item: Item, columns: Column[]): string {
    for (const col of columns) {
        if (col.type !== 'status' && col.type !== 'dropdown') continue;
        const val = item.values[col.id];
        if (!val) continue;
        const opt = col.options?.find(o => o.id === val || o.label === val);
        if (opt) return opt.label;
    }
    return '';
}

function getCutoff(period: Period): number | null {
    const p = PERIODS.find(x => x.id === period);
    return p?.ms != null ? Date.now() - p.ms : null;
}

function buildPayload(
    activeBoard: NonNullable<ReturnType<typeof useBoardStore.getState>['boards'][number]>,
    period: Period
) {
    const cutoff = getCutoff(period);

    const groups = activeBoard.groups.map(group => {
        const filteredItems = group.items.filter(item => {
            if (cutoff === null) return true;
            const createdRecently = item.createdAt && new Date(item.createdAt).getTime() >= cutoff;
            const hasRecentUpdate = item.updates?.some(u => new Date(u.createdAt).getTime() >= cutoff);
            return createdRecently || hasRecentUpdate;
        });

        return {
            title: group.title,
            items: filteredItems.map(item => ({
                title: item.title,
                statusLabel: resolveStatusLabel(item, activeBoard.columns),
                updates: (item.updates ?? [])
                    .filter(u => cutoff === null || new Date(u.createdAt).getTime() >= cutoff)
                    .map(u => u.content)
                    .slice(0, 5),
            })),
        };
    }).filter(g => g.items.length > 0);

    return {
        boardTitle: activeBoard.title,
        period: periodLabel(period),
        columns: activeBoard.columns.map(c => ({ title: c.title, type: c.type })),
        groups,
    };
}

export const AISummaryView = () => {
    const activeBoardId = useBoardStore(state => state.activeBoardId);
    const activeBoard = useBoardStore(state => state.boards.find(b => b.id === activeBoardId));

    const [period, setPeriod] = useState<Period>('1m');
    const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
    const [summary, setSummary] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const [generatedAt, setGeneratedAt] = useState<Date | null>(null);
    const [summaryPeriod, setSummaryPeriod] = useState<Period>('1m');

    if (!activeBoard) return null;

    const cutoff = getCutoff(period);
    const activeItemCount = activeBoard.groups.reduce((sum, g) =>
        sum + g.items.filter(i => {
            if (cutoff === null) return true;
            return (i.createdAt && new Date(i.createdAt).getTime() >= cutoff) ||
                i.updates?.some(u => new Date(u.createdAt).getTime() >= cutoff);
        }).length, 0
    );

    const handleGenerate = async () => {
        setStatus('loading');
        setSummary('');
        setErrorMsg('');
        try {
            const payload = buildPayload(activeBoard as any, period);
            const { data, error } = await supabase.functions.invoke('ai-summary', { body: payload });
            if (error) {
                let detail = error.message;
                try {
                    const ctx = (error as any).context;
                    if (ctx) {
                        const body = await (ctx as Response).json();
                        detail = body?.error ?? body?.message ?? JSON.stringify(body);
                    }
                } catch { /* ignore parse failure */ }
                throw new Error(detail);
            }
            if (data?.error) throw new Error(data.error);
            setSummary(data?.summary ?? '');
            setGeneratedAt(new Date());
            setSummaryPeriod(period);
            setStatus('done');
        } catch (err) {
            setErrorMsg(err instanceof Error ? err.message : 'An unknown error occurred.');
            setStatus('error');
        }
    };

    const handlePeriodChange = (p: Period) => {
        setPeriod(p);
        if (status === 'done') setStatus('idle');
    };

    return (
        <div style={{
            flex: 1,
            overflow: 'auto',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '20px 24px 48px',
            backgroundColor: 'hsl(var(--color-bg-canvas))',
        }}>
            <style>{`
                @keyframes spin { to { transform: rotate(360deg); } }
                .ai-gen-btn { transition: transform 0.15s ease, box-shadow 0.15s ease !important; }
                .ai-gen-btn:hover { transform: translateY(-1px); box-shadow: 0 8px 24px rgba(107,76,195,0.42) !important; }
                .ai-gen-btn:active { transform: translateY(0) !important; }
                .ai-period-btn:hover { opacity: 0.8; }
                .ai-regen-btn:hover { border-color: hsl(var(--color-border)) !important; background-color: hsl(var(--color-bg-surface)) !important; }
            `}</style>

            <div style={{
                width: '100%',
                maxWidth: '820px',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
            }}>
                {/* Premium header row: title+subtitle left, period selector right */}
                <div style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: '24px',
                }}>
                    {/* Title + subtitle stacked */}
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                            <div style={{
                                width: '34px', height: '34px',
                                borderRadius: '9px',
                                background: 'linear-gradient(135deg, #6b4cc3, #a855f7)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                flexShrink: 0,
                                boxShadow: '0 2px 8px rgba(107,76,195,0.3)',
                            }}>
                                <Sparkles size={16} color="white" />
                            </div>
                            <h2 style={{
                                fontSize: '22px',
                                fontWeight: 700,
                                color: 'hsl(var(--color-text-primary))',
                                margin: 0,
                                letterSpacing: '-0.3px',
                            }}>
                                AI Summary
                            </h2>
                        </div>
                        <p style={{
                            fontSize: '13.5px',
                            color: 'hsl(var(--color-text-secondary))',
                            margin: '0 0 0 44px',
                            lineHeight: 1.5,
                        }}>
                            Summarize board activity
                            <span style={{ margin: '0 5px', color: 'hsl(var(--color-text-tertiary))' }}>·</span>
                            <span style={{ fontWeight: 600, color: 'hsl(var(--color-text-primary))' }}>
                                {activeItemCount} item{activeItemCount !== 1 ? 's' : ''}
                            </span>
                            {' '}in the selected period
                        </p>
                    </div>

                    {/* Period selector pill */}
                    <div style={{
                        display: 'flex',
                        gap: '3px',
                        padding: '4px',
                        backgroundColor: 'hsl(var(--color-bg-surface))',
                        border: '1px solid hsl(var(--color-border))',
                        borderRadius: '10px',
                        flexShrink: 0,
                    }}>
                        {PERIODS.map(p => (
                            <button
                                key={p.id}
                                className="ai-period-btn"
                                onClick={() => handlePeriodChange(p.id)}
                                style={{
                                    padding: '6px 15px',
                                    borderRadius: '7px',
                                    fontSize: '13px',
                                    fontWeight: period === p.id ? 600 : 400,
                                    border: 'none',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease',
                                    backgroundColor: period === p.id ? 'hsl(var(--color-brand-primary))' : 'transparent',
                                    color: period === p.id ? 'white' : 'hsl(var(--color-text-secondary))',
                                }}
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Main card */}
                {status === 'idle' || status === 'error' ? (
                    <div style={{
                        border: '1px solid hsl(var(--color-border))',
                        borderRadius: '16px',
                        padding: '72px 56px',
                        textAlign: 'center',
                        backgroundColor: 'hsl(var(--color-bg-surface))',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '22px',
                        boxShadow: '0 2px 20px rgba(0,0,0,0.04)',
                        position: 'relative',
                        overflow: 'hidden',
                    }}>
                        {/* Decorative blobs */}
                        <div style={{
                            position: 'absolute', top: '-70px', right: '-70px',
                            width: '240px', height: '240px', borderRadius: '50%',
                            background: 'radial-gradient(circle, rgba(168,85,247,0.08) 0%, transparent 70%)',
                            pointerEvents: 'none',
                        }} />
                        <div style={{
                            position: 'absolute', bottom: '-50px', left: '-50px',
                            width: '200px', height: '200px', borderRadius: '50%',
                            background: 'radial-gradient(circle, rgba(107,76,195,0.07) 0%, transparent 70%)',
                            pointerEvents: 'none',
                        }} />

                        {status === 'error' && (
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: '10px',
                                color: '#ef4444', fontSize: '13px',
                                padding: '12px 18px', borderRadius: '10px',
                                backgroundColor: 'rgba(239,68,68,0.07)',
                                border: '1px solid rgba(239,68,68,0.18)',
                                width: '100%', maxWidth: '500px',
                                boxSizing: 'border-box',
                                textAlign: 'left',
                                zIndex: 1,
                            }}>
                                <AlertCircle size={16} style={{ flexShrink: 0 }} />
                                <span>{errorMsg}</span>
                            </div>
                        )}

                        {/* Icon */}
                        <div style={{
                            width: '68px', height: '68px',
                            borderRadius: '18px',
                            background: 'linear-gradient(135deg, rgba(107,76,195,0.1), rgba(168,85,247,0.16))',
                            border: '1px solid rgba(168,85,247,0.22)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            zIndex: 1,
                        }}>
                            <Sparkles size={30} color="#a855f7" />
                        </div>

                        <div style={{ maxWidth: '440px', zIndex: 1 }}>
                            <p style={{
                                fontSize: '18px', fontWeight: 700,
                                color: 'hsl(var(--color-text-primary))',
                                margin: '0 0 10px', letterSpacing: '-0.2px',
                            }}>
                                Generate AI Summary
                            </p>
                            <p style={{
                                fontSize: '14px', color: 'hsl(var(--color-text-secondary))',
                                margin: 0, lineHeight: 1.65,
                            }}>
                                Gemini AI will analyze{' '}
                                <strong style={{ color: 'hsl(var(--color-text-primary))' }}>
                                    {activeItemCount} item{activeItemCount !== 1 ? 's' : ''}
                                </strong>
                                {' '}and their updates from the past{' '}
                                <strong style={{ color: 'hsl(var(--color-text-primary))' }}>
                                    {periodLabel(period).toLowerCase()}
                                </strong>
                                {' '}in{' '}
                                <em>"{activeBoard.title}"</em>
                            </p>
                        </div>

                        <button
                            className="ai-gen-btn"
                            onClick={handleGenerate}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '8px',
                                padding: '13px 36px', borderRadius: '10px',
                                background: 'linear-gradient(135deg, #6b4cc3, #a855f7)',
                                color: 'white', fontSize: '14px', fontWeight: 600,
                                border: 'none', cursor: 'pointer',
                                boxShadow: '0 4px 16px rgba(107,76,195,0.35)',
                                letterSpacing: '0.1px',
                                zIndex: 1,
                            }}
                        >
                            <Zap size={15} />
                            {status === 'error' ? 'Try Again' : 'Generate Summary'}
                        </button>
                    </div>

                ) : status === 'loading' ? (
                    <div style={{
                        border: '1px solid hsl(var(--color-border))',
                        borderRadius: '16px',
                        padding: '88px 56px',
                        textAlign: 'center',
                        backgroundColor: 'hsl(var(--color-bg-surface))',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '20px',
                        boxShadow: '0 2px 20px rgba(0,0,0,0.04)',
                    }}>
                        <div style={{ position: 'relative', width: '54px', height: '54px' }}>
                            <div style={{
                                width: '54px', height: '54px',
                                border: '3px solid rgba(168,85,247,0.15)',
                                borderTopColor: '#a855f7',
                                borderRadius: '50%',
                                animation: 'spin 0.85s linear infinite',
                            }} />
                            <div style={{
                                position: 'absolute', top: '50%', left: '50%',
                                transform: 'translate(-50%, -50%)',
                            }}>
                                <Sparkles size={18} color="#a855f7" />
                            </div>
                        </div>
                        <div>
                            <p style={{
                                fontSize: '15px', fontWeight: 600,
                                color: 'hsl(var(--color-text-primary))',
                                margin: '0 0 5px',
                            }}>
                                Analyzing board activity...
                            </p>
                            <p style={{ fontSize: '13px', color: 'hsl(var(--color-text-secondary))', margin: 0 }}>
                                Gemini is reading {activeItemCount} item{activeItemCount !== 1 ? 's' : ''} and their updates
                            </p>
                        </div>
                    </div>

                ) : (
                    /* Result card */
                    <div style={{
                        border: '1px solid hsl(var(--color-border))',
                        borderRadius: '16px',
                        overflow: 'hidden',
                        backgroundColor: 'hsl(var(--color-bg-surface))',
                        boxShadow: '0 2px 20px rgba(0,0,0,0.05)',
                    }}>
                        {/* Result header */}
                        <div style={{
                            padding: '18px 32px',
                            borderBottom: '1px solid hsl(var(--color-border))',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            background: 'linear-gradient(to right, rgba(107,76,195,0.06), transparent)',
                        }}>
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: '10px',
                                fontSize: '13px', color: 'hsl(var(--color-text-secondary))',
                            }}>
                                <Clock size={14} color="#a855f7" />
                                <span style={{ fontWeight: 600, color: 'hsl(var(--color-text-primary))' }}>
                                    {periodLabel(summaryPeriod)}
                                </span>
                                <span style={{ color: 'hsl(var(--color-text-tertiary))' }}>·</span>
                                <span>Generated {generatedAt?.toLocaleString('en-GB')}</span>
                            </div>
                            <button
                                className="ai-regen-btn"
                                onClick={handleGenerate}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '6px',
                                    padding: '7px 16px', borderRadius: '8px',
                                    border: '1px solid hsl(var(--color-border))',
                                    backgroundColor: 'hsl(var(--color-bg-canvas))',
                                    color: 'hsl(var(--color-text-secondary))',
                                    fontSize: '13px', fontWeight: 500,
                                    cursor: 'pointer',
                                    transition: 'background-color 0.15s ease',
                                }}
                            >
                                <RefreshCw size={13} />
                                Regenerate
                            </button>
                        </div>

                        {/* Summary body */}
                        <div style={{
                            padding: '40px 44px',
                            fontSize: '15px',
                            lineHeight: 1.9,
                            color: 'hsl(var(--color-text-primary))',
                            whiteSpace: 'pre-wrap',
                            letterSpacing: '0.1px',
                        }}>
                            {summary}
                        </div>

                        {/* Inner footer */}
                        <div style={{
                            padding: '14px 44px',
                            borderTop: '1px solid hsl(var(--color-border))',
                            display: 'flex', alignItems: 'center', gap: '6px',
                            backgroundColor: 'hsl(var(--color-bg-canvas))',
                        }}>
                            <Sparkles size={11} color="#a855f7" />
                            <span style={{ fontSize: '12px', color: 'hsl(var(--color-text-tertiary))' }}>
                                Powered by Google Gemini 1.5 Flash
                            </span>
                        </div>
                    </div>
                )}

                {/* Footer — only on idle/error states */}
                {(status === 'idle' || status === 'error') && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                        <Sparkles size={11} color="#a855f7" />
                        <p style={{ fontSize: '12px', color: 'hsl(var(--color-text-tertiary))', margin: 0 }}>
                            Powered by Google Gemini 1.5 Flash
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};
