import { ChevronDown, ChevronRight, Trash2, GripVertical, Link2 } from 'lucide-react';
import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useBoardStore } from '../../store/useBoardStore';
import { usePermission } from '../../hooks/usePermission';
import { ConfirmModal } from '../ui/ConfirmModal';
import { supabase } from '../../lib/supabase';

export const GroupRow = ({ 
    data, 
    groupColor,
    isCollapsed, 
    onToggle,
    dragHandleProps
}: { 
    data: any, 
    groupColor?: string,
    isCollapsed: boolean, 
    onToggle: () => void,
    dragHandleProps?: any
}) => {
    const updateGroupTitle = useBoardStore(state => state.updateGroupTitle);
    const deleteGroup = useBoardStore(state => state.deleteGroup);
    const updateGroupColor = useBoardStore(state => state.updateGroupColor);
    const unlinkGroup = useBoardStore(state => state.unlinkGroup);
    const { can } = usePermission();

    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState(data.title);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [showLinkedDeleteBlocked, setShowLinkedDeleteBlocked] = useState(false);

    // Color Picker State
    const [showColorPicker, setShowColorPicker] = useState(false);
    const colorBtnRef = useRef<HTMLDivElement>(null);

    // Link Popover State
    const [showLinkPopover, setShowLinkPopover] = useState(false);
    const [linkedNames, setLinkedNames] = useState<{ workspaceTitle: string; boardTitle: string; groupTitle: string } | null>(null);
    const linkIconRef = useRef<HTMLDivElement>(null);

    const handleOpenLinkPopover = async () => {
        setShowLinkPopover(!showLinkPopover);
        if (!showLinkPopover && data.linkedBoardId && data.linkedGroupId && !linkedNames) {
            const [{ data: boardRow }, { data: groupRow }] = await Promise.all([
                supabase.from('boards').select('title, workspace_id').eq('id', data.linkedBoardId).single(),
                supabase.from('groups').select('title').eq('id', data.linkedGroupId).single()
            ]);
            const { data: workspaceRow } = boardRow?.workspace_id
                ? await supabase.from('workspaces').select('title').eq('id', boardRow.workspace_id).single()
                : { data: null };
            setLinkedNames({
                workspaceTitle: workspaceRow?.title || 'Unknown workspace',
                boardTitle: boardRow?.title || 'Unknown board',
                groupTitle: groupRow?.title || 'Unknown group'
            });
        }
    };

    const GROUP_COLORS = [
        '#7C3FE4', '#3F6FE4', '#C03FE4', '#92BF0A', '#279966',
        '#F0960A', '#E03333', '#8B85A8', '#1A1728', '#B89BFF',
        '#06B6D4', '#F472B6', '#FBBF24', '#14B8A6', '#84CC16'
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
            {/* Visual Left Border */}
            {(groupColor || data.color || '#579bfc') && (
                <div style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: '6px',
                    backgroundColor: groupColor || data.color || '#579bfc',
                    borderTopLeftRadius: '6px',
                    zIndex: 65,
                    pointerEvents: 'none'
                }} />
            )}
            {/* Hover Drag Handle */}
            {can('group_ungroup') && (
                <div 
                    {...dragHandleProps}
                    className="group-drag-handle"
                    style={{
                        position: 'absolute',
                        left: '4px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        cursor: 'grab',
                        color: 'hsl(var(--color-text-tertiary))',
                        opacity: 0,
                        transition: 'opacity 0.2s',
                        zIndex: 70,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '4px 2px'
                    }}
                >
                    <GripVertical size={16} />
                </div>
            )}

            {/* Sticky Group Title Container */}
            <div style={{
                position: 'sticky',
                left: 0,
                zIndex: 60,
                backgroundColor: 'hsl(var(--color-bg-canvas))',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                paddingLeft: '24px', 
                boxSizing: 'border-box',
                flexShrink: 0,
                minWidth: 'max-content'
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
                            cursor: can('group_ungroup') ? 'text' : 'default',
                            whiteSpace: 'nowrap'
                        }}
                        onDoubleClick={() => {
                            if (can('group_ungroup')) setIsEditing(true);
                        }}
                        title={can('group_ungroup') ? "Double click to rename group" : "Read only"}
                    >
                        {data.title}
                    </span>
                )}

                {data.linkedGroupId && (
                    <div
                        ref={linkIconRef}
                        onClick={(e) => { e.stopPropagation(); handleOpenLinkPopover(); }}
                        style={{ display: 'flex', alignItems: 'center', marginLeft: '6px', cursor: 'pointer', color: 'hsl(var(--color-text-tertiary))' }}
                        title="This group is linked"
                    >
                        <Link2 size={13} />
                    </div>
                )}

                {showLinkPopover && linkIconRef.current && createPortal(
                    <>
                        <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }} onClick={() => setShowLinkPopover(false)} />
                        <div style={{
                            position: 'fixed',
                            top: linkIconRef.current.getBoundingClientRect().bottom + 6,
                            left: linkIconRef.current.getBoundingClientRect().left,
                            backgroundColor: 'white',
                            border: '1px solid hsl(var(--color-border))',
                            borderRadius: '8px',
                            padding: '12px',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                            zIndex: 9999,
                            width: '220px',
                            fontSize: '13px'
                        }}>
                            <div style={{ color: 'hsl(var(--color-text-secondary))', marginBottom: '8px' }}>
                                Linked to: <br />
                                <strong>{linkedNames ? `${linkedNames.workspaceTitle} / ${linkedNames.boardTitle} / ${linkedNames.groupTitle}` : 'Loading…'}</strong>
                            </div>
                            {can('group_ungroup') && (
                                <button
                                    onClick={() => { unlinkGroup(data.id); setShowLinkPopover(false); }}
                                    style={{ width: '100%', padding: '6px 10px', borderRadius: '4px', border: '1px solid hsl(var(--color-border))', background: 'transparent', cursor: 'pointer', fontSize: '12px', color: '#e11d48' }}
                                >
                                    Unlink
                                </button>
                            )}
                        </div>
                    </>,
                    document.body
                )}

                <span style={{ fontSize: '13px', color: 'hsl(var(--color-text-tertiary))', marginLeft: '8px' }}>
                    {data.count} items
                </span>

                {can('group_ungroup') && (
                    <div className="group-actions" style={{ marginLeft: '12px', display: 'flex', gap: '4px', opacity: 0.2 }}>
                        <button
                            onClick={() => data.linkedGroupId ? setShowLinkedDeleteBlocked(true) : setShowDeleteConfirm(true)}
                            className="icon-btn"
                            title={data.linkedGroupId ? "Unlink before deleting" : "Delete Group"}
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
                onConfirm={() => {
                    deleteGroup(data.id);
                    setShowDeleteConfirm(false);
                }}
                onCancel={() => setShowDeleteConfirm(false)}
            />

            <ConfirmModal
                isOpen={showLinkedDeleteBlocked}
                title="This Group is Linked"
                message={`"${data.title}" is linked to another group. Unlink it first, then you can delete it.`}
                confirmText="Unlink Now"
                onConfirm={() => {
                    unlinkGroup(data.id);
                    setShowLinkedDeleteBlocked(false);
                }}
                onCancel={() => setShowLinkedDeleteBlocked(false)}
            />

            <style>{`
                .table-content > div:hover .group-drag-handle {
                    opacity: 1 !important;
                }
                .group-drag-handle:hover {
                    color: hsl(var(--color-text-primary)) !important;
                }
                .group-drag-handle:active {
                    cursor: grabbing;
                }
            `}</style>
        </div>
    );
};
