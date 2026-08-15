import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Save, Plus, Trash2, CalendarClock } from 'lucide-react';

const DEFAULT_OFFSETS = [7, 0];

export const DueDateReminderSettings = () => {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [offsets, setOffsets] = useState<number[]>([]);
    const [message, setMessage] = useState({ type: '', text: '' });

    useEffect(() => {
        fetchSettings();
    }, []);

    const fetchSettings = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('system_settings')
                .select('value')
                .eq('key', 'due_date_reminder_offsets')
                .single();

            if (error && error.code !== 'PGRST116') throw error; // PGRST116 is "no rows found"

            setOffsets(Array.isArray(data?.value) ? data.value : DEFAULT_OFFSETS);
        } catch (error: any) {
            console.error('Error fetching settings:', error);
            setMessage({ type: 'error', text: 'Failed to load settings: ' + error.message });
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        try {
            setSaving(true);
            setMessage({ type: '', text: '' });

            // Whole non-negative days only, de-duplicated, largest first.
            const cleaned = Array.from(new Set(
                offsets.map(o => Math.max(0, Math.round(o)))
            )).sort((a, b) => b - a);

            if (cleaned.length === 0) {
                setMessage({ type: 'error', text: 'Add at least one reminder point.' });
                setSaving(false);
                return;
            }

            const { error } = await supabase
                .from('system_settings')
                .upsert({
                    key: 'due_date_reminder_offsets',
                    value: cleaned,
                    description: 'Days before a Due Date column value to send a reminder notification (0 = due today)'
                }, { onConflict: 'key' });

            if (error) throw error;

            setOffsets(cleaned);
            setMessage({ type: 'success', text: 'Reminder schedule saved successfully' });
            setTimeout(() => setMessage({ type: '', text: '' }), 3000);

        } catch (error: any) {
            console.error('Error saving settings:', error);
            setMessage({ type: 'error', text: 'Failed to save settings: ' + error.message });
        } finally {
            setSaving(false);
        }
    };

    const addOffset = () => {
        setOffsets([...offsets, 1]);
    };

    const removeOffset = (index: number) => {
        const next = [...offsets];
        next.splice(index, 1);
        setOffsets(next);
    };

    const updateOffset = (index: number, value: string) => {
        const next = [...offsets];
        next[index] = Number(value);
        setOffsets(next);
    };

    if (loading) {
        return <div style={{ padding: '24px', color: '#64748b' }}>Loading settings...</div>;
    }

    return (
        <div style={{ maxWidth: '800px' }}>
            {message.text && (
                <div style={{
                    padding: '12px 16px',
                    borderRadius: '8px',
                    marginBottom: '24px',
                    backgroundColor: message.type === 'success' ? '#def7ec' : '#fee2e2',
                    color: message.type === 'success' ? '#03543f' : '#991b1b',
                    fontSize: '14px',
                    border: `1px solid ${message.type === 'success' ? '#31c48d' : '#f87171'}`
                }}>
                    {message.text}
                </div>
            )}

            <div style={{ backgroundColor: 'white', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                    <h2 style={{ fontSize: '18px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                        <CalendarClock size={20} color="#6366f1" />
                        Due Date Reminders
                    </h2>
                    <button
                        onClick={addOffset}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '6px',
                            padding: '8px 12px',
                            backgroundColor: '#f8fafc',
                            border: '1px solid #cbd5e1',
                            borderRadius: '6px',
                            fontSize: '13px',
                            fontWeight: 500,
                            cursor: 'pointer'
                        }}
                    >
                        <Plus size={16} /> Add Reminder Point
                    </button>
                </div>

                <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '20px', lineHeight: '1.5' }}>
                    Everyone assigned to an item gets notified when its "Due Date" column value lands on one of
                    these day counts before the deadline. Use 0 for "due today". Applies to every board.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {offsets.map((offset, idx) => (
                        <div key={idx} style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                            <input
                                type="number"
                                min={0}
                                value={offset}
                                onChange={e => updateOffset(idx, e.target.value)}
                                style={{ ...inputStyle, width: '100px', flex: 'none' }}
                            />
                            <span style={{ fontSize: '14px', color: '#334155', flex: 1 }}>
                                {offset === 0 ? 'Due today' : `${offset} day${offset === 1 ? '' : 's'} before due date`}
                            </span>
                            <button
                                onClick={() => removeOffset(idx)}
                                style={{
                                    padding: '8px',
                                    color: '#94a3b8',
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer'
                                }}
                                onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                                onMouseLeave={e => e.currentTarget.style.color = '#94a3b8'}
                            >
                                <Trash2 size={18} />
                            </button>
                        </div>
                    ))}

                    {offsets.length === 0 && (
                        <div style={{ padding: '32px', textAlign: 'center', color: '#94a3b8', border: '2px dashed #e2e8f0', borderRadius: '12px' }}>
                            No reminder points defined. Click "Add Reminder Point" to start.
                        </div>
                    )}
                </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '10px 24px',
                        backgroundColor: '#6366f1',
                        border: 'none',
                        borderRadius: '6px',
                        color: 'white',
                        fontWeight: 600,
                        cursor: saving ? 'not-allowed' : 'pointer',
                        fontSize: '14px',
                        opacity: saving ? 0.7 : 1,
                        transition: 'background-color 0.2s'
                    }}
                >
                    <Save size={18} />
                    {saving ? 'Saving...' : 'Save Reminder Schedule'}
                </button>
            </div>
        </div>
    );
};

const inputStyle: React.CSSProperties = {
    padding: '8px 12px',
    borderRadius: '6px',
    border: '1px solid #cbd5e1',
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box'
};
