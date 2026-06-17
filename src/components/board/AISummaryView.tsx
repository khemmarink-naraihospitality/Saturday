import { useState } from 'react';
import { Sparkles, RefreshCw, AlertCircle, Clock } from 'lucide-react';
import { useBoardStore } from '../../store/useBoardStore';
import { supabase } from '../../lib/supabase';
import type { Column, Item } from '../../types';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

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

function buildPayload(activeBoard: NonNullable<ReturnType<typeof useBoardStore.getState>['boards'][number]>) {
    const cutoff = Date.now() - THIRTY_DAYS_MS;

    const groups = activeBoard.groups.map(group => {
        const recentItems = group.items.filter(item => {
            const createdRecently = item.createdAt && new Date(item.createdAt).getTime() >= cutoff;
            const hasRecentUpdate = item.updates?.some(
                u => new Date(u.createdAt).getTime() >= cutoff
            );
            return createdRecently || hasRecentUpdate;
        });

        return {
            title: group.title,
            items: recentItems.map(item => ({
                title: item.title,
                statusLabel: resolveStatusLabel(item, activeBoard.columns),
                updates: (item.updates ?? [])
                    .filter(u => new Date(u.createdAt).getTime() >= cutoff)
                    .map(u => u.content)
                    .slice(0, 5), // cap per item to avoid huge payloads
            })),
        };
    }).filter(g => g.items.length > 0);

    return {
        boardTitle: activeBoard.title,
        columns: activeBoard.columns.map(c => ({ title: c.title, type: c.type })),
        groups,
    };
}

export const AISummaryView = () => {
    const activeBoardId = useBoardStore(state => state.activeBoardId);
    const activeBoard = useBoardStore(state => state.boards.find(b => b.id === activeBoardId));

    const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
    const [summary, setSummary] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const [generatedAt, setGeneratedAt] = useState<Date | null>(null);

    if (!activeBoard) return null;

    const handleGenerate = async () => {
        setStatus('loading');
        setSummary('');
        setErrorMsg('');
        try {
            const payload = buildPayload(activeBoard as any);
            const { data, error } = await supabase.functions.invoke('ai-summary', { body: payload });
            if (error) throw new Error(error.message);
            if (data?.error) throw new Error(data.error);
            setSummary(data?.summary ?? '');
            setGeneratedAt(new Date());
            setStatus('done');
        } catch (err) {
            setErrorMsg(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ');
            setStatus('error');
        }
    };

    const totalRecentItems = activeBoard.groups.reduce((sum, g) => {
        const cutoff = Date.now() - THIRTY_DAYS_MS;
        return sum + g.items.filter(i =>
            (i.createdAt && new Date(i.createdAt).getTime() >= cutoff) ||
            i.updates?.some(u => new Date(u.createdAt).getTime() >= cutoff)
        ).length;
    }, 0);

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
                    }}>
                        <Sparkles size={20} color="white" />
                    </div>
                    <div>
                        <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'hsl(var(--color-text-primary))', margin: 0 }}>
                            AI Summary
                        </h2>
                        <p style={{ fontSize: '13px', color: 'hsl(var(--color-text-secondary))', margin: 0 }}>
                            สรุปกิจกรรมบอร์ดย้อนหลัง 30 วัน · {totalRecentItems} items ที่มีการเคลื่อนไหว
                        </p>
                    </div>
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
                            }}>
                                <AlertCircle size={16} style={{ flexShrink: 0 }} />
                                <span>{errorMsg}</span>
                            </div>
                        )}
                        <Sparkles size={32} color="#a855f7" />
                        <div>
                            <p style={{ fontSize: '15px', fontWeight: 600, color: 'hsl(var(--color-text-primary))', margin: '0 0 6px' }}>
                                สร้าง AI Summary สำหรับบอร์ด "{activeBoard.title}"
                            </p>
                            <p style={{ fontSize: '13px', color: 'hsl(var(--color-text-secondary))', margin: 0 }}>
                                Gemini AI จะวิเคราะห์ items และ updates ย้อนหลัง 30 วัน
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
                            {status === 'error' ? 'ลองใหม่อีกครั้ง' : 'Generate AI Summary'}
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
                            กำลังวิเคราะห์ข้อมูลบอร์ด...
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
                                สร้างเมื่อ {generatedAt?.toLocaleString('th-TH')}
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

                {/* Info note */}
                <p style={{ fontSize: '12px', color: 'hsl(var(--color-text-tertiary))', textAlign: 'center', margin: 0 }}>
                    ขับเคลื่อนโดย Google Gemini 1.5 Flash · ข้อมูลส่งผ่าน Supabase Edge Function
                </p>
            </div>
        </div>
    );
};
