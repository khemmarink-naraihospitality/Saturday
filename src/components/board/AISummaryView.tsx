import { useState } from 'react';
import { Sparkles, RefreshCw, AlertCircle, Clock } from 'lucide-react';
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
            const { data, error } = await supabase.functions.invoke('super-task', { body: payload });
            if (error) throw new Error(error.message);
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

    // Reset to idle when period changes after a result
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
            padding: '40px 24px',
            backgroundColor: 'hsl(var(--color-bg-canvas))',
        }}>
            <div style={{
                width: '100%',
                maxWidth: '720px',
                display: 'flex',
                flexDirection: 'column',
                gap: '24px',
            }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                        width: '40px', height: '40px', borderRadius: '10px',
                        background: 'linear-gradient(135deg, #6b4cc3, #a855f7)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0,
                    }}>
                        <Sparkles size={20} color="white" />
                    </div>
                    <div>
                        <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'hsl(var(--color-text-primary))', margin: 0 }}>
                            AI Summary
                        </h2>
                        <p style={{ fontSize: '13px', color: 'hsl(var(--color-text-secondary))', margin: 0 }}>
                            Summarize board activity · {activeItemCount} item{activeItemCount !== 1 ? 's' : ''} in selected period
                        </p>
                    </div>
                </div>

                {/* Period selector */}
                <div style={{
                    display: 'flex',
                    gap: '8px',
                    padding: '4px',
                    backgroundColor: 'hsl(var(--color-bg-surface))',
                    border: '1px solid hsl(var(--color-border))',
                    borderRadius: '10px',
                    width: 'fit-content',
                }}>
                    {PERIODS.map(p => (
                        <button
                            key={p.id}
                            onClick={() => handlePeriodChange(p.id)}
                            style={{
                                padding: '6px 18px',
                                borderRadius: '7px',
                                fontSize: '13px',
                                fontWeight: period === p.id ? 600 : 400,
                                border: 'none',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                                backgroundColor: period === p.id
                                    ? 'hsl(var(--color-brand-primary))'
                                    : 'transparent',
                                color: period === p.id
                                    ? 'white'
                                    : 'hsl(var(--color-text-secondary))',
                            }}
                        >
                            {p.label}
                        </button>
                    ))}
                </div>

                {/* Action area */}
                {status === 'idle' || status === 'error' ? (
                    <div style={{
                        border: '1px solid hsl(var(--color-border))',
                        borderRadius: '12px',
                        padding: '32px',
                        textAlign: 'center',
                        backgroundColor: 'hsl(var(--color-bg-surface))',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '16px',
                    }}>
                        {status === 'error' && (
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: '8px',
                                color: '#ef4444', fontSize: '13px',
                                padding: '10px 16px', borderRadius: '8px',
                                backgroundColor: 'rgba(239,68,68,0.08)',
                                border: '1px solid rgba(239,68,68,0.2)',
                                width: '100%',
                                boxSizing: 'border-box',
                            }}>
                                <AlertCircle size={16} style={{ flexShrink: 0 }} />
                                <span style={{ textAlign: 'left' }}>{errorMsg}</span>
                            </div>
                        )}
                        <Sparkles size={32} color="#a855f7" />
                        <div>
                            <p style={{ fontSize: '15px', fontWeight: 600, color: 'hsl(var(--color-text-primary))', margin: '0 0 6px' }}>
                                Generate AI Summary for "{activeBoard.title}"
                            </p>
                            <p style={{ fontSize: '13px', color: 'hsl(var(--color-text-secondary))', margin: 0 }}>
                                Gemini AI will analyze items and updates from the past {periodLabel(period).toLowerCase()}
                            </p>
                        </div>
                        <button
                            onClick={handleGenerate}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '8px',
                                padding: '10px 24px', borderRadius: '8px',
                                background: 'linear-gradient(135deg, #6b4cc3, #a855f7)',
                                color: 'white', fontSize: '14px', fontWeight: 600,
                                border: 'none', cursor: 'pointer',
                            }}
                        >
                            <Sparkles size={16} />
                            {status === 'error' ? 'Try Again' : 'Generate Summary'}
                        </button>
                    </div>
                ) : status === 'loading' ? (
                    <div style={{
                        border: '1px solid hsl(var(--color-border))',
                        borderRadius: '12px',
                        padding: '48px 32px',
                        textAlign: 'center',
                        backgroundColor: 'hsl(var(--color-bg-surface))',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '16px',
                    }}>
                        <div style={{
                            width: '40px', height: '40px',
                            border: '3px solid #e9d5ff',
                            borderTopColor: '#a855f7',
                            borderRadius: '50%',
                            animation: 'spin 0.8s linear infinite',
                        }} />
                        <p style={{ fontSize: '14px', color: 'hsl(var(--color-text-secondary))', margin: 0 }}>
                            Analyzing board activity...
                        </p>
                        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                    </div>
                ) : (
                    /* Result */
                    <div style={{
                        border: '1px solid hsl(var(--color-border))',
                        borderRadius: '12px',
                        overflow: 'hidden',
                        backgroundColor: 'hsl(var(--color-bg-surface))',
                    }}>
                        <div style={{
                            padding: '14px 20px',
                            borderBottom: '1px solid hsl(var(--color-border))',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            backgroundColor: 'hsla(var(--color-brand-primary), 0.05)',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'hsl(var(--color-text-secondary))' }}>
                                <Clock size={14} />
                                {periodLabel(summaryPeriod)} summary · Generated {generatedAt?.toLocaleString('en-GB')}
                            </div>
                            <button
                                onClick={handleGenerate}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '6px',
                                    padding: '6px 14px', borderRadius: '6px',
                                    border: '1px solid hsl(var(--color-border))',
                                    backgroundColor: 'hsl(var(--color-bg-canvas))',
                                    color: 'hsl(var(--color-text-secondary))',
                                    fontSize: '13px', cursor: 'pointer',
                                }}
                            >
                                <RefreshCw size={13} />
                                Regenerate
                            </button>
                        </div>
                        <div style={{
                            padding: '24px',
                            fontSize: '15px',
                            lineHeight: '1.8',
                            color: 'hsl(var(--color-text-primary))',
                            whiteSpace: 'pre-wrap',
                        }}>
                            {summary}
                        </div>
                    </div>
                )}

                {/* Footer note */}
                <p style={{ fontSize: '12px', color: 'hsl(var(--color-text-tertiary))', textAlign: 'center', margin: 0 }}>
                    Powered by Google Gemini 1.5 Flash · Processed via Supabase Edge Function
                </p>
            </div>
        </div>
    );
};
