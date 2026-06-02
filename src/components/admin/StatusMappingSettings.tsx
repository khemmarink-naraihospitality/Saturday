import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Save, Plus, Trash2, Palette } from 'lucide-react';

interface StatusMapping {
    label: string;
    color: string;
}

export const StatusMappingSettings = () => {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [mappings, setMappings] = useState<StatusMapping[]>([]);
    const [message, setMessage] = useState({ type: '', text: '' });

    // Standard preset colors for NHG
    const presetColors = [
        '#00c875', // Done (Green)
        '#fdab3d', // Working on it (Orange)
        '#e2445c', // Stuck / At Risk (Red)
        '#ffd533', // Ready for review / Waiting (Yellow)
        '#a1a1a1', // On Hold (Grey)
        '#ff158a', // RFP (Pink)
        '#333333', // Not start / N/A (Black)
        '#579bfc', // Info (Blue)
        '#a25ddc', // Purple
        '#c4c4c4', // Default
    ];

    useEffect(() => {
        fetchSettings();
    }, []);

    const fetchSettings = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('system_settings')
                .select('value')
                .eq('key', 'status_color_mapping')
                .single();
            
            if (error && error.code !== 'PGRST116') throw error; // PGRST116 is "no rows found"

            if (data?.value) {
                // value is stored as an object { [label: string]: color }
                const formatted = Object.entries(data.value as Record<string, string>).map(([label, color]) => ({
                    label,
                    color
                }));
                setMappings(formatted);
            } else {
                // Load defaults if nothing in DB
                setMappings([
                    { label: 'Done', color: '#00c875' },
                    { label: 'Completed', color: '#00c875' },
                    { label: 'Working on it', color: '#fdab3d' },
                    { label: 'In Progress', color: '#fdab3d' },
                    { label: 'Stuck', color: '#e2445c' },
                    { label: 'At risk', color: '#e2445c' },
                    { label: 'Ready for review', color: '#ffd533' },
                    { label: 'Waiting', color: '#ffd533' },
                    { label: 'Not start', color: '#333333' }
                ]);
            }
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
            
            // Convert array back to lookup object
            const valueObject: Record<string, string> = {};
            mappings.forEach(m => {
                if (m.label.trim()) {
                    valueObject[m.label.trim()] = m.color;
                }
            });

            const { error } = await supabase
                .from('system_settings')
                .upsert({
                    key: 'status_color_mapping',
                    value: valueObject,
                    description: 'Global status to color mapping for Excel imports'
                }, { onConflict: 'key' });

            if (error) throw error;

            setMessage({ type: 'success', text: 'Status mappings saved successfully' });
            setTimeout(() => setMessage({ type: '', text: '' }), 3000);
            
        } catch (error: any) {
            console.error('Error saving settings:', error);
            setMessage({ type: 'error', text: 'Failed to save settings: ' + error.message });
        } finally {
            setSaving(false);
        }
    };

    const addMapping = () => {
        setMappings([...mappings, { label: '', color: '#333333' }]);
    };

    const removeMapping = (index: number) => {
        const newMappings = [...mappings];
        newMappings.splice(index, 1);
        setMappings(newMappings);
    };

    const updateMapping = (index: number, field: keyof StatusMapping, value: string) => {
        const newMappings = [...mappings];
        newMappings[index] = { ...newMappings[index], [field]: value };
        setMappings(newMappings);
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
                        <Palette size={20} color="#6366f1" />
                        Status to Color Mapping
                    </h2>
                    <button 
                        onClick={addMapping}
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
                        <Plus size={16} /> Add New
                    </button>
                </div>
                
                <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '20px', lineHeight: '1.5' }}>
                    Define how Excel status labels map to colors in the system. 
                    Labels are case-insensitive. If a label isn't found here, the system will try to read the color from Excel or default to black.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {mappings.map((m, idx) => (
                        <div key={idx} style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                            <div style={{ flex: 1 }}>
                                <input 
                                    type="text" 
                                    value={m.label}
                                    onChange={e => updateMapping(idx, 'label', e.target.value)}
                                    placeholder="Status Label (e.g. Done)"
                                    style={inputStyle}
                                />
                            </div>
                            <div style={{ display: 'flex', gap: '6px', backgroundColor: '#f8fafc', padding: '6px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                {presetColors.map(color => (
                                    <button
                                        key={color}
                                        onClick={() => updateMapping(idx, 'color', color)}
                                        style={{
                                            width: '24px',
                                            height: '24px',
                                            borderRadius: '4px',
                                            backgroundColor: color,
                                            border: m.color === color ? '2px solid #0f172a' : '1px solid rgba(0,0,0,0.1)',
                                            padding: 0,
                                            cursor: 'pointer'
                                        }}
                                        title={color}
                                    />
                                ))}
                                <div style={{ width: '1px', backgroundColor: '#cbd5e1', margin: '0 4px' }} />
                                <input 
                                    type="color" 
                                    value={m.color}
                                    onChange={e => updateMapping(idx, 'color', e.target.value)}
                                    style={{ width: '24px', height: '24px', padding: 0, border: 'none', backgroundColor: 'transparent', cursor: 'pointer' }}
                                />
                            </div>
                            <button 
                                onClick={() => removeMapping(idx)}
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
                    
                    {mappings.length === 0 && (
                        <div style={{ padding: '32px', textAlign: 'center', color: '#94a3b8', border: '2px dashed #e2e8f0', borderRadius: '12px' }}>
                            No mappings defined. Click "Add New" to start.
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
                    {saving ? 'Saving...' : 'Save Mappings'}
                </button>
            </div>
        </div>
    );
};

const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    borderRadius: '6px',
    border: '1px solid #cbd5e1',
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box'
};
