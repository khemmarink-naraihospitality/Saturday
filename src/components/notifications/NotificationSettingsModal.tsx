import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { X, Plus, Trash2, CalendarClock, Save, BellOff } from 'lucide-react';

const ORG_FALLBACK_OFFSETS = [7, 0];

const describeOffset = (n: number) =>
    n === 0 ? 'Due today' : `${n} day${n === 1 ? '' : 's'} before due date`;

interface NotificationSettingsModalProps {
    onClose: () => void;
}

export const NotificationSettingsModal = ({ onClose }: NotificationSettingsModalProps) => {
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [mode, setMode] = useState<'inherit' | 'custom'>('inherit');
    const [orgOffsets, setOrgOffsets] = useState<number[]>(ORG_FALLBACK_OFFSETS);
    const [offsets, setOffsets] = useState<number[]>(ORG_FALLBACK_OFFSETS);
    const [message, setMessage] = useState({ type: '', text: '' });

    useEffect(() => {
        if (!user?.id) return;
        let cancelled = false;

        (async () => {
            const [orgRes, meRes] = await Promise.all([
                supabase.from('system_settings').select('value')
                    .eq('key', 'due_date_reminder_offsets').maybeSingle(),
                supabase.from('profiles').select('due_date_reminder_offsets')
                    .eq('id', user.id).maybeSingle()
            ]);
            if (cancelled) return;

            const org = Array.isArray(orgRes.data?.value)
                ? (orgRes.data!.value as number[])
                : ORG_FALLBACK_OFFSETS;
            setOrgOffsets(org);

            const mine = (meRes.data as any)?.due_date_reminder_offsets;
            if (Array.isArray(mine)) {
                setMode('custom');
                setOffsets(mine as number[]);
            } else {
                // null / column absent -> inheriting. Seed the (hidden)
                // custom editor with the org list so "Customize" starts
                // from what they're getting today rather than blank.
                setMode('inherit');
                setOffsets(org);
            }
            if (meRes.error) {
                setMessage({ type: 'error', text: 'Could not load your saved schedule: ' + meRes.error.message });
            }
            setLoading(false);
        })();

        return () => { cancelled = true; };
    }, [user?.id]);

    const handleSave = async () => {
        if (!user?.id) return;
        setSaving(true);
        setMessage({ type: '', text: '' });

        const payload = mode === 'inherit'
            ? null
            : Array.from(new Set(offsets.map(o => Math.max(0, Math.round(Number(o) || 0)))))
                .sort((a, b) => b - a);

        // .select() matters: a Supabase UPDATE blocked by RLS returns no
        // error, just zero affected rows. Without reading the row back, a
        // missing UPDATE policy would look like a silent success.
        const { data, error } = await supabase
            .from('profiles')
            .update({ due_date_reminder_offsets: payload })
            .eq('id', user.id)
            .select('due_date_reminder_offsets')
            .maybeSingle();

        setSaving(false);

        if (error) {
            setMessage({ type: 'error', text: 'Failed to save: ' + error.message });
            return;
        }
        if (!data) {
            setMessage({ type: 'error', text: "Couldn't save — your account doesn't have permission to update this setting." });
            return;
        }
        if (payload) setOffsets(payload);
        setMessage({ type: 'success', text: 'Notification settings saved' });
        setTimeout(onClose, 900);
    };

    const addOffset = () => setOffsets([...offsets, 1]);
    const removeOffset = (i: number) => setOffsets(offsets.filter((_, idx) => idx !== i));
    const updateOffset = (i: number, v: string) =>
        setOffsets(offsets.map((o, idx) => (idx === i ? Number(v) : o)));

    return createPortal(
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
            <div style={{
                backgroundColor: 'hsl(var(--color-bg-surface))',
                borderRadius: '8px',
                width: '480px',
                maxWidth: '90vw',
                maxHeight: '85vh',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
                border: '1px solid hsl(var(--color-border))',
                overflow: 'hidden'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid hsl(var(--color-border))' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <CalendarClock size={18} />
                        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: 'hsl(var(--color-text-primary))' }}>Notification Settings</h3>
                    </div>
                    <button onClick={onClose} className="icon-btn"><X size={20} /></button>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
                    {loading ? (
                        <div style={{ padding: '24px 0', textAlign: 'center', fontSize: '13px', color: 'hsl(var(--color-text-secondary))' }}>Loading...</div>
                    ) : (
                        <>
                            <p style={{ fontSize: '13px', color: 'hsl(var(--color-text-secondary))', marginTop: 0, marginBottom: '12px' }}>
                                Choose when you get reminded about items assigned to you that have a Due Date.
                            </p>

                            <div style={{
                                display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap',
                                padding: '8px 12px', borderRadius: '6px', marginBottom: '16px',
                                backgroundColor: 'hsl(var(--color-bg-subtle))', border: '1px solid hsl(var(--color-border))',
                                fontSize: '12px', color: 'hsl(var(--color-text-secondary))'
                            }}>
                                Organization default:
                                {orgOffsets.map(o => (
                                    <span key={o} style={{
                                        padding: '2px 8px', borderRadius: '10px', fontWeight: 600,
                                        backgroundColor: 'hsl(var(--color-bg-surface))', border: '1px solid hsl(var(--color-border))',
                                        color: 'hsl(var(--color-text-primary))'
                                    }}>
                                        {describeOffset(o)}
                                    </span>
                                ))}
                            </div>

                            {/* Mode selector */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                                {([
                                    { value: 'inherit' as const, title: 'Use organization default', subtitle: 'Follow whatever the admin sets. Updates automatically if they change it.' },
                                    { value: 'custom' as const, title: 'Customize my own schedule', subtitle: 'Only applies to you.' }
                                ]).map(opt => (
                                    <label
                                        key={opt.value}
                                        style={{
                                            display: 'flex', alignItems: 'flex-start', gap: '10px',
                                            padding: '10px 12px', borderRadius: '6px', cursor: 'pointer',
                                            border: `1px solid ${mode === opt.value ? 'hsl(var(--color-brand-primary))' : 'hsl(var(--color-border))'}`,
                                            backgroundColor: mode === opt.value ? 'hsl(var(--color-brand-light))' : 'transparent'
                                        }}
                                    >
                                        <input
                                            type="radio"
                                            name="reminder-mode"
                                            checked={mode === opt.value}
                                            onChange={() => setMode(opt.value)}
                                            style={{ marginTop: '3px' }}
                                        />
                                        <div>
                                            <div style={{ fontSize: '13px', fontWeight: 600, color: 'hsl(var(--color-text-primary))' }}>{opt.title}</div>
                                            <div style={{ fontSize: '12px', color: 'hsl(var(--color-text-tertiary))', marginTop: '2px' }}>{opt.subtitle}</div>
                                        </div>
                                    </label>
                                ))}
                            </div>

                            {mode === 'custom' && (
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                        <span style={{ fontSize: '12px', fontWeight: 700, color: 'hsl(var(--color-text-secondary))', textTransform: 'uppercase', letterSpacing: '0.05em' }}>My reminder points</span>
                                        <button
                                            onClick={addOffset}
                                            style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 8px', backgroundColor: 'transparent', border: '1px solid hsl(var(--color-border))', borderRadius: '5px', fontSize: '12px', fontWeight: 500, cursor: 'pointer', color: 'hsl(var(--color-text-primary))' }}
                                        >
                                            <Plus size={13} /> Add
                                        </button>
                                    </div>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {offsets.map((offset, idx) => (
                                            <div key={idx} style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                                <input
                                                    type="number"
                                                    min={0}
                                                    value={offset}
                                                    onChange={e => updateOffset(idx, e.target.value)}
                                                    style={{ width: '90px', flex: 'none', padding: '6px 10px', borderRadius: '5px', border: '1px solid hsl(var(--color-border))', fontSize: '13px', outline: 'none', backgroundColor: 'hsl(var(--color-bg-canvas))', color: 'hsl(var(--color-text-primary))', boxSizing: 'border-box' }}
                                                />
                                                <span style={{ fontSize: '13px', color: 'hsl(var(--color-text-secondary))', flex: 1 }}>
                                                    {describeOffset(offset)}
                                                </span>
                                                <button
                                                    onClick={() => removeOffset(idx)}
                                                    style={{ padding: '6px', color: 'hsl(var(--color-text-tertiary))', background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>

                                    {offsets.length === 0 && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', marginTop: '4px', borderRadius: '6px', backgroundColor: 'hsl(var(--color-bg-subtle))', fontSize: '12px', color: 'hsl(var(--color-text-secondary))' }}>
                                            <BellOff size={14} /> You won't receive any due-date reminders.
                                        </div>
                                    )}
                                </div>
                            )}

                            {message.text && (
                                <div style={{
                                    marginTop: '14px', padding: '8px 12px', borderRadius: '6px', fontSize: '12px',
                                    backgroundColor: message.type === 'success' ? 'hsl(var(--color-status-green-bg) / 0.12)' : 'hsl(var(--color-status-red-bg) / 0.12)',
                                    color: message.type === 'success' ? 'hsl(var(--color-status-green-bg))' : 'hsl(var(--color-status-red-bg))',
                                    border: `1px solid ${message.type === 'success' ? 'hsl(var(--color-status-green-bg) / 0.3)' : 'hsl(var(--color-status-red-bg) / 0.3)'}`
                                }}>
                                    {message.text}
                                </div>
                            )}
                        </>
                    )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', padding: '14px 20px', borderTop: '1px solid hsl(var(--color-border))' }}>
                    <button
                        onClick={onClose}
                        style={{ padding: '8px 16px', borderRadius: '4px', border: '1px solid hsl(var(--color-border))', background: 'transparent', cursor: 'pointer', fontSize: '13px', color: 'hsl(var(--color-text-primary))' }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving || loading}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '6px',
                            padding: '8px 16px', borderRadius: '4px', border: 'none',
                            backgroundColor: 'hsl(var(--color-brand-primary))', color: 'white',
                            fontSize: '13px', fontWeight: 600,
                            cursor: (saving || loading) ? 'not-allowed' : 'pointer',
                            opacity: (saving || loading) ? 0.7 : 1
                        }}
                    >
                        <Save size={14} />
                        {saving ? 'Saving...' : 'Save'}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};
