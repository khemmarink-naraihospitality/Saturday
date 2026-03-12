import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Pencil, Plus, Trash2, PaintBucket } from 'lucide-react';
import type { ColumnOption } from '../../types';
import { useBoardStore } from '../../store/useBoardStore';

interface StatusPickerProps {
    columnId: string; // Need this for editing
    options: ColumnOption[];
    onSelect: (label: string) => void;
    onClose: () => void;
    currentValue?: string;
    position: { top: number; bottom: number; left: number; width: number };
}

export const StatusPicker = ({ columnId, options = [], onSelect, onClose, position }: StatusPickerProps) => {
    const menuRef = useRef<HTMLDivElement>(null);
    const [isEditingLabels, setIsEditingLabels] = useState(false);

    // Store actions
    const addColumnOption = useBoardStore(state => state.addColumnOption);
    const updateColumnOption = useBoardStore(state => state.updateColumnOption);
    const deleteColumnOption = useBoardStore(state => state.deleteColumnOption);

    // Temp state for keydown buffer etc, but mostly we can edit directly store or local
    // For "Apply" feel, ideally we do local state, but store is easier. 
    // Screenshot has "Apply", which usually implies saving. 
    // IF we edit DIRECTLY, "Apply" just means Close.

    // Handle click outside to close
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    // Define standard colors for picker
    const LABEL_COLORS = [
        '#00c875', '#e2445c', '#fdab3d', '#0086c0', '#579bfc',
        '#a25ddc', '#ffcb00', '#c4c4c4', '#333333', '#784bd1'
    ];

    const safeOptions = Array.isArray(options) ? options : [];

    const handleAddLabel = () => {
        addColumnOption(columnId, 'New Label', '#c4c4c4');
    };

    if (isEditingLabels) {
        return createPortal(
            <div
                ref={menuRef}
                style={{
                    position: 'fixed',
                    top: position.bottom + 8,
                    left: position.left - (280 - position.width) / 2, // Wider for edit mode
                    width: '280px',
                    backgroundColor: 'white',
                    borderRadius: '8px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    zIndex: 9999,
                    padding: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    border: '1px solid hsl(var(--color-border))'
                }}
            >
                {/* Pointer triangle */}
                <div style={{
                    position: 'absolute',
                    top: '-6px',
                    left: '50%',
                    transform: 'translateX(-50%) rotate(45deg)',
                    width: '12px',
                    height: '12px',
                    backgroundColor: 'white',
                    borderLeft: '1px solid hsl(var(--color-border))',
                    borderTop: '1px solid hsl(var(--color-border))',
                }} />

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px', overflowY: 'auto' }}>
                    {safeOptions.map((opt) => (
                        <div key={opt.id} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            {/* Color Swatch / Paint Bucket - simplified for MVP to just cycle or random? 
                                Let's make it a small square that triggers a color menu? 
                                Or simpler: just match screenshot design: Icon on left.
                             */}
                            <div style={{
                                width: '24px',
                                height: '24px',
                                backgroundColor: opt.color,
                                borderRadius: '4px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: 'white',
                                cursor: 'pointer',
                                flexShrink: 0
                            }}
                                onClick={() => {
                                    // Cycle colors for simple MVP
                                    const idx = LABEL_COLORS.indexOf(opt.color);
                                    const nextColor = LABEL_COLORS[(idx + 1) % LABEL_COLORS.length];
                                    updateColumnOption(columnId, opt.id, { color: nextColor });
                                }}
                                title="Click to cycle color"
                            >
                                <PaintBucket size={12} />
                            </div>

                            <input
                                value={opt.label}
                                onChange={(e) => updateColumnOption(columnId, opt.id, { label: e.target.value })}
                                style={{
                                    flex: 1,
                                    border: '1px solid hsl(var(--color-border))',
                                    borderRadius: '4px',
                                    padding: '4px 8px',
                                    outline: 'none',
                                    fontSize: '13px',
                                    backgroundColor: 'white',
                                    color: '#323338'
                                }}
                            />

                            <button
                                onClick={() => deleteColumnOption(columnId, opt.id)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#676879', padding: '4px' }}
                                title="Delete Label"
                            >
                                <Trash2 size={14} />
                            </button>
                        </div>
                    ))}
                </div>

                <button
                    onClick={handleAddLabel}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        backgroundColor: 'white',
                        border: '1px solid hsl(var(--color-border))',
                        borderRadius: '4px',
                        padding: '6px',
                        fontSize: '13px',
                        cursor: 'pointer',
                        color: 'hsl(var(--color-text-primary))'
                    }}
                >
                    <Plus size={14} />
                    New label
                </button>

                <div style={{ display: 'flex', justifyContent: 'center', marginTop: '4px' }}>
                    <button
                        onClick={() => setIsEditingLabels(false)}
                        style={{
                            backgroundColor: 'hsl(var(--color-brand-primary))',
                            flex: 1,
                            border: 'none',
                            borderRadius: '4px',
                            background: 'transparent',
                            fontSize: '14px',
                            fontWeight: 500,
                            padding: '8px',
                            cursor: 'pointer',
                            color: '#e5e6ea'
                        }}
                    >
                        Apply
                    </button>
                </div>
            </div>,
            document.body
        );
    }

    // Default View (Picker)
    return createPortal(
        <div
            ref={menuRef}
            style={{
                position: 'fixed',
                top: position.bottom + 8,
                left: position.left - (340 - position.width) / 2, // Slightly narrower
                width: '340px',
                backgroundColor: 'white',
                borderRadius: '8px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08)',
                zIndex: 9999,
                display: 'flex',
                flexDirection: 'column',
                border: '1px solid #e1e1e1',
                overflow: 'hidden'
            }}
        >
            {/* Pointer triangle */}
            <div style={{
                position: 'absolute',
                top: '-6px',
                left: '50%',
                transform: 'translateX(-50%) rotate(45deg)',
                width: '12px',
                height: '12px',
                backgroundColor: 'white',
                borderLeft: '1px solid #e1e1e1',
                borderTop: '1px solid #e1e1e1',
            }} />

            <div style={{ padding: '16px 16px 8px 16px' }}>
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '8px',
                    marginBottom: '8px'
                }}>
                    {safeOptions.map((opt) => (
                        <button
                            key={opt.id}
                            onClick={() => onSelect(opt.id)}
                            style={{
                                backgroundColor: opt.color,
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                padding: '6px 10px',
                                fontSize: '13px',
                                fontWeight: 500,
                                cursor: 'pointer',
                                transition: 'opacity 0.15s, transform 0.1s',
                                height: '32px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis'
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.opacity = '0.9';
                                e.currentTarget.style.transform = 'translateY(-1px)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.opacity = '1';
                                e.currentTarget.style.transform = 'translateY(0)';
                            }}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>

                <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <button
                        className="status-picker-edit-btn"
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                            background: 'transparent',
                            border: 'none',
                            color: '#676879',
                            cursor: 'pointer',
                            padding: '6px 12px',
                            fontSize: '13px',
                            fontWeight: 400
                        }}
                        onClick={() => setIsEditingLabels(true)}
                    >
                        <Pencil size={14} strokeWidth={1.5} />
                        Edit Labels
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};
