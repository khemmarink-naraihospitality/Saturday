import { ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useBoardStore } from '../../store/useBoardStore';
import { usePermission } from '../../hooks/usePermission';
import { ConfirmModal } from '../ui/ConfirmModal';

export const GroupRow = ({ data, isCollapsed, onToggle }: { data: any, isCollapsed: boolean, onToggle: () => void }) => {
    const updateGroupTitle = useBoardStore(state => state.updateGroupTitle);
    const deleteGroup = useBoardStore(state => state.deleteGroup);
    const updateGroupColor = useBoardStore(state => state.updateGroupColor);
    const { can } = usePermission();

    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState(data.title);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    // Color Picker State
    const [showColorPicker, setShowColorPicker] = useState(false);
    const colorBtnRef = useRef<HTMLDivElement>(null);

    const GROUP_COLORS = [
        '#579bfc', '#00c875', '#e2445c', '#ffcb00', '#a25ddc',
        '#ffadad', '#c4c4c4', '#333333', '#784bd1', '#ff158a'
    ];

    const handleSave = () => {
        if (editValue.trim() && editValue !== data.title) {
            updateGroupTitle(data.id, editValue.trim());
        }
        setIsEditing(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') handleSave();
        if (e.key === 'Escape') {
            setEditValue(data.title);
            setIsEditing(false);
        }
    };

    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            height: '100%',
            position: 'relative',
            backgroundColor: 'hsl(var(--color-bg-canvas))',
            width: '100%', // Group row spans the whole table row width
        }}>
            {/* Sticky Group Title Container */}
            <div style={{
                position: 'sticky',
                left: 0,
                zIndex: 60,
                backgroundColor: 'hsl(var(--color-bg-canvas))',
                width: '520px', // Match default itemColumnWidth or pass it as prop
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                paddingLeft: '24px', // Reduced padding
                borderRight: '1px solid hsl(var(--color-border))',
                boxSizing: 'border-box'
            }}>
                {/* Color Picker / Expand Trigger */}
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', marginRight: '4px' }}>
                    <button
                        onClick={onToggle}
                        className="icon-btn"
                        style={{ color: data.color || '#579bfc', marginRight: '6px', zIndex: 1 }}
                    >
                        {isCollapsed ? <ChevronRight size={18} /> : <ChevronDown size={18} />}
                    </button>

                    <div
                        onClick={(e) => {
                            e.stopPropagation();
                            if (can('group_ungroup')) setShowColorPicker(!showColorPicker);
                        }}
                        style={{
                            position: 'absolute',
                            left: 20,
                            top: 0,
                            width: '24px',
                            height: '24px',
                            cursor: 'pointer',
                            zIndex: 2,
                            opacity: 0
                        }}
                        title="Change Group Color"
                    />

                    <div
                        ref={colorBtnRef}
                        style={{
                            width: '14px',
                            height: '14px',
                            backgroundColor: data.color || '#579bfc',
                            borderRadius: '4px',
                            marginRight: '8px'
                        }}
                    />

                    {showColorPicker && colorBtnRef.current && createPortal(
                        <>
                            <div
                                style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
                                onClick={() => setShowColorPicker(false)}
                            />
                            <div style={{
                                position: 'fixed',
                                top: colorBtnRef.current.getBoundingClientRect().bottom + 4,
                                left: colorBtnRef.current.getBoundingClientRect().left,
                                backgroundColor: 'white',
                                border: '1px solid hsl(var(--color-border))',
                                borderRadius: '8px',
                                padding: '12px',
                                display: 'grid',
                                gridTemplateColumns: 'repeat(5, 1fr)',
                                gap: '8px',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                                zIndex: 9999,
                                width: '180px'
                            }}>
                                {GROUP_COLORS.map(c => (
                                    <div
                                        key={c}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            updateGroupColor(data.id, c);
                                            setShowColorPicker(false);
                                        }}
                                        style={{
                                            width: '24px',
                                            height: '24px',
                                            backgroundColor: c,
                                            borderRadius: '6px',
                                            cursor: 'pointer',
                                            border: data.color === c ? '2px solid #000' : '1px solid rgba(0,0,0,0.1)',
                                            transition: 'transform 0.1s'
                                        }}
                                        onMouseEnter={(e) => (e.target as HTMLElement).style.transform = 'scale(1.1)'}
                                        onMouseLeave={(e) => (e.target as HTMLElement).style.transform = 'scale(1)'}
                                    />
                                ))}
                            </div>
                        </>,
                        document.body
                    )}
                </div>

                {isEditing ? (
                    <input
                        autoFocus
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onFocus={(e) => e.target.select()}
                        onBlur={handleSave}
                        onKeyDown={handleKeyDown}
                        style={{
                            fontSize: '15px',
                            fontWeight: 600,
                            color: data.color || '#579bfc',
                            background: 'transparent',
                            border: '1px solid hsl(var(--color-brand-primary))',
                            borderRadius: '4px',
                            padding: '0 4px',
                            outline: 'none'
                        }}
                    />
                ) : (
                    <span
                        style={{
                            fontSize: '15px',
                            fontWeight: 600,
                            color: data.color || '#579bfc',
                            cursor: can('group_ungroup') ? 'text' : 'default'
                        }}
                        onDoubleClick={() => {
                            if (can('group_ungroup')) setIsEditing(true);
                        }}
                        title={can('group_ungroup') ? "Double click to rename group" : "Read only"}
                    >
                        {data.title}
                    </span>
                )}

                <span style={{ fontSize: '13px', color: 'hsl(var(--color-text-tertiary))', marginLeft: '8px' }}>
                    {data.count} items
                </span>

                {can('group_ungroup') && (
                    <div className="group-actions" style={{ marginLeft: '12px', display: 'flex', gap: '4px', opacity: 0.2 }}>
                        <button
                            onClick={() => setShowDeleteConfirm(true)}
                            className="icon-btn"
                            title="Delete Group"
                        >
                            <Trash2 size={14} />
                        </button>
                    </div>
                )}
            </div>
            
            {/* The rest of the row will be empty for GroupRow but spans the full table width */}
            <div style={{ flex: 1 }} />

            <ConfirmModal
                isOpen={showDeleteConfirm}
                title="Delete Group"
                message={`Are you sure you want to delete "${data.title}" and all its items? This action cannot be undone.`}
                confirmText="Delete"
                variant="danger"
                onConfirm={() => {
                    deleteGroup(data.id);
                    setShowDeleteConfirm(false);
                }}
                onCancel={() => setShowDeleteConfirm(false)}
            />
        </div>
    );
};
