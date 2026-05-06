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
    const [pickerHeight, setPickerHeight] = useState(0);

    const safeOptions = Array.isArray(options) ? options : [];

    // Measure height after render to handle overflow
    useEffect(() => {
        if (menuRef.current) {
            setPickerHeight(menuRef.current.offsetHeight);
        }
    }, [safeOptions, isEditingLabels]);

    // Calculate vertical position
    const spaceBelow = window.innerHeight - position.bottom;
    const shouldShowAbove = spaceBelow < (isEditingLabels ? 400 : 250) && position.top > (isEditingLabels ? 400 : 250);

    const topPos = shouldShowAbove 
        ? position.top - (pickerHeight || (isEditingLabels ? 400 : 220)) - 8 
        : position.bottom + 8;

    // Store actions
    const addColumnOption = useBoardStore(state => state.addColumnOption);
    const updateColumnOption = useBoardStore(state => state.updateColumnOption);
    const deleteColumnOption = useBoardStore(state => state.deleteColumnOption);

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
        '#7C3FE4', '#3F6FE4', '#C03FE4', '#92BF0A', '#279966',
        '#F0960A', '#E03333', '#8B85A8', '#1A1728', '#B89BFF'
    ];

    const handleAddLabel = () => {
        addColumnOption(columnId, 'New Label', '#c4c4c4');
    };

    const [activeColorPickerId, setActiveColorPickerId] = useState<string | null>(null);

    if (isEditingLabels) {
        return createPortal(
            <div
                ref={menuRef}
                style={{
                    position: 'fixed',
                    top: topPos,
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
                    top: shouldShowAbove ? 'auto' : '-6px',
                    bottom: shouldShowAbove ? '-6px' : 'auto',
                    left: '50%',
                    transform: 'translateX(-50%) rotate(45deg)',
                    width: '12px',
                    height: '12px',
                    backgroundColor: 'white',
                    borderLeft: shouldShowAbove ? 'none' : '1px solid hsl(var(--color-border))',
                    borderTop: shouldShowAbove ? 'none' : '1px solid hsl(var(--color-border))',
                    borderRight: shouldShowAbove ? '1px solid hsl(var(--color-border))' : 'none',
                    borderBottom: shouldShowAbove ? '1px solid hsl(var(--color-border))' : 'none',
                }} />

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px', overflowY: 'visible' }}>
                    {safeOptions.map((opt) => (
                        <div key={opt.id} style={{ display: 'flex', gap: '8px', alignItems: 'center', position: 'relative' }}>
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
                                onClick={() => setActiveColorPickerId(activeColorPickerId === opt.id ? null : opt.id)}
                                title="Change color"
                            >
                                <PaintBucket size={12} />
                            </div>

                            {activeColorPickerId === opt.id && (
                                <div style={{
                                    position: 'absolute',
                                    top: '30px',
                                    left: '0',
                                    backgroundColor: 'white',
                                    border: '1px solid hsl(var(--color-border))',
                                    borderRadius: '6px',
                                    padding: '8px',
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(5, 1fr)',
                                    gap: '6px',
                                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                                    zIndex: 10000,
                                    width: '140px'
                                }}>
                                    {LABEL_COLORS.map(c => (
                                        <div
                                            key={c}
                                            onClick={() => {
                                                updateColumnOption(columnId, opt.id, { color: c });
                                                setActiveColorPickerId(null);
                                            }}
                                            style={{
                                                width: '20px',
                                                height: '20px',
                                                backgroundColor: c,
                                                borderRadius: '3px',
                                                cursor: 'pointer',
                                                border: opt.color === c ? '2px solid #333' : '1px solid rgba(0,0,0,0.1)'
                                            }}
                                        />
                                    ))}
                                </div>
                            )}

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
                            border: 'none',
                            borderRadius: '4px',
                            fontSize: '14px',
                            fontWeight: 500,
                            padding: '8px 24px',
                            cursor: 'pointer',
                            color: 'white',
                            transition: 'background-color 0.2s',
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'hsl(var(--color-brand-hover))'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'hsl(var(--color-brand-primary))'}
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
                top: topPos,
                left: position.left - (340 - position.width) / 2,
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
                top: shouldShowAbove ? 'auto' : '-6px',
                bottom: shouldShowAbove ? '-6px' : 'auto',
                left: '50%',
                transform: 'translateX(-50%) rotate(45deg)',
                width: '12px',
                height: '12px',
                backgroundColor: 'white',
                borderLeft: shouldShowAbove ? 'none' : '1px solid #e1e1e1',
                borderTop: shouldShowAbove ? 'none' : '1px solid #e1e1e1',
                borderRight: shouldShowAbove ? '1px solid #e1e1e1' : 'none',
                borderBottom: shouldShowAbove ? '1px solid #e1e1e1' : 'none',
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
