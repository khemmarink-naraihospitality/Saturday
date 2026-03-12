import React, { useRef, useEffect } from 'react';
import type { Item, Column } from '../../types';
import { Cell } from './Cell';
import { GripVertical, MessageSquare } from 'lucide-react';
import { usePermission } from '../../hooks/usePermission';
import { useBoardStore } from '../../store/useBoardStore';
import { Check } from 'lucide-react';

const CheckboxState = ({ itemId }: { itemId: string }) => {
    const isSelected = useBoardStore(state => state.selectedItemIds.includes(itemId));

    return (
        <div style={{
            width: '100%',
            height: '100%',
            backgroundColor: isSelected ? 'hsl(var(--color-brand-primary))' : 'transparent',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '2px' // Inner radius
        }}>
            {isSelected && <Check size={12} color="white" strokeWidth={3} />}
        </div>
    );
};

export const Row = React.memo(({
    item,
    columns,
    groupColor,
    itemColumnWidth = 240,
    dragHandleProps
}: {
    item: Item,
    columns: Column[],
    groupColor?: string,
    itemColumnWidth?: number,
    dragHandleProps?: any
}) => {
    const { can } = usePermission();
    const rowRef = useRef<HTMLDivElement>(null);
    const highlightedItemId = useBoardStore(state => state.highlightedItemId);
    // Local state for flash animation - Disabled for now as per user request
    // const [isFlashing, setIsFlashing] = useState(false);

    useEffect(() => {
        if (highlightedItemId === item.id && rowRef.current) {
            rowRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
            // setIsFlashing(true); // Disabled highlight visuals

            // Clear highlights immediately after scroll action is acknowledged
            const timer = setTimeout(() => {
                // setIsFlashing(false);
                useBoardStore.getState().setHighlightedItem(null);
            }, 1000); // 1s reset
            return () => clearTimeout(timer);
        }
    }, [highlightedItemId, item.id]);

    const isSelected = useBoardStore(state => state.selectedItemIds.includes(item.id));
    // const isHighlighted = highlightedItemId === item.id; // Disabled

    return (
        <div ref={rowRef} className={`table-row ${isSelected ? 'selected' : ''}`} style={{
            height: '30px',
            maxHeight: '30px',
            boxSizing: 'border-box',
            position: 'relative',
            display: 'flex',
            opacity: item.isHidden ? 0.5 : 1,
            backgroundColor: isSelected
                ? 'hsl(var(--color-brand-primary-subtle))'
                : (item.isHidden ? 'hsl(var(--color-bg-subtle))' : 'transparent'),
            transition: 'background-color 0.5s ease'
        }}>
            {/* Visual Left Border */}
            {groupColor && (
                <div style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    bottom: '-1px', // Extends over the row border
                    width: '6px',
                    backgroundColor: groupColor,
                    zIndex: 65
                }} />
            )}

            {/* Frozen First Column: Item Name */}
            <div className="table-cell sticky-col" style={{
                width: `${itemColumnWidth}px`,
                position: 'sticky',
                left: 0,
                zIndex: 5,
                backgroundColor: isSelected ? 'hsl(var(--color-brand-primary-subtle))' : (item.isHidden ? 'hsl(var(--color-bg-subtle))' : 'hsl(var(--color-bg-canvas))'),
                borderRight: '1px solid hsl(var(--color-border))',
                paddingLeft: groupColor ? '18px' : '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
            }}>
                {/* Drag Handle (Visible on Hover via CSS) */}
                {can('edit_items') && (
                    <div
                        {...dragHandleProps}
                        className="drag-handle"
                        style={{
                            cursor: 'grab',
                            color: 'hsl(var(--color-text-tertiary))',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            opacity: 0, // Hidden by default, shown on hover via CSS
                            transition: 'opacity 0.2s',
                            width: '16px',
                            marginLeft: '-4px'
                        }}
                    >
                        <GripVertical size={14} />
                    </div>
                )}

                {/* Row Checkbox */}
                <div
                    className="row-checkbox"
                    onClick={(e) => {
                        e.stopPropagation();
                        import('../../store/useBoardStore').then(({ useBoardStore }) => {
                            const isSelected = useBoardStore.getState().selectedItemIds.includes(item.id);
                            useBoardStore.getState().toggleItemSelection(item.id, !isSelected);
                        });
                    }}
                    style={{
                        width: '14px',
                        height: '14px',
                        border: '1px solid hsl(var(--color-border))',
                        borderRadius: '3px',
                        cursor: 'pointer',
                        backgroundColor: 'transparent',
                        flexShrink: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        // Dynamic styling based on selection would require reactivity, 
                        // better to use a hook in the component or pass it down.
                        // For now, let's use a subscribed component for the checkbox to avoid re-rendering the whole row?
                        // Or just subscribe Row to the specific selection state.
                    }}
                >
                    <CheckboxState itemId={item.id} />
                </div>

                <div style={{ flex: 1, overflow: 'hidden', position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <input
                        defaultValue={item.title}
                        readOnly={!can('edit_items')}
                        onBlur={(e) => {
                            if (!can('edit_items')) return;
                            const val = e.target.value.trim();
                            if (val && val !== item.title) {
                                import('../../store/useBoardStore').then(({ useBoardStore }) => {
                                    useBoardStore.getState().updateItemTitle(item.id, val, true);
                                });
                            } else {
                                // Reset if empty
                                e.target.value = item.title;
                            }
                        }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.currentTarget.blur();
                            }
                        }}
                        style={{
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            border: 'none',
                            background: 'transparent',
                            width: '100%',
                            fontSize: '13px',
                            color: 'inherit',
                            outline: 'none',
                            cursor: can('edit_items') ? 'text' : 'default',
                            pointerEvents: can('edit_items') ? 'auto' : 'none' // Disable interaction cleanly
                        }}
                    />

                </div>

                {/* Chat/Open Icon (Always Visible) - Moved outside overflow container */}
                <div
                    onClick={(e) => {
                        e.stopPropagation();
                        import('../../store/useBoardStore').then(({ useBoardStore }) => {
                            useBoardStore.getState().setActiveItem(item.id);
                        });
                    }}
                    title="Open Updates"
                    style={{
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '24px',
                        height: '24px',
                        borderRadius: '4px',
                        // Blue if updates, else gray
                        color: (item.updates && item.updates.length > 0) ? 'hsl(var(--color-brand-primary))' : 'hsl(var(--color-text-tertiary))',
                        transition: 'background-color 0.2s, color 0.2s',
                        zIndex: 10,
                        flexShrink: 0, // Prevent shrinking
                        marginRight: '8px' // Right spacing
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-hover))';
                        if (!item.updates?.length) e.currentTarget.style.color = 'hsl(var(--color-brand-primary))';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent';
                        if (!item.updates?.length) e.currentTarget.style.color = 'hsl(var(--color-text-tertiary))';
                    }}
                >
                    <div style={{ position: 'relative', display: 'flex' }}>
                        <MessageSquare size={18} />

                        {/* Update Count Badge */}
                        {item.updates && item.updates.length > 0 && (
                            <div style={{
                                position: 'absolute',
                                top: '-4px', // Adjusted top
                                right: '-4px', // Adjusted right to be closer
                                backgroundColor: 'hsl(var(--color-brand-primary))',
                                color: 'white',
                                fontSize: '8px', // Smaller font
                                fontWeight: 700,
                                width: '12px', // Fixed equal width
                                height: '12px', // Fixed equal height
                                borderRadius: '50%', // Perfect Circle
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                border: '2px solid white',
                                boxSizing: 'content-box',
                                zIndex: 20,
                                lineHeight: '1' // Center vertically
                            }}>
                                {item.updates.length}
                            </div>
                        )}
                    </div>
                </div>


            </div>

            {
                columns.map((col) => (
                    <div key={col.id} style={{
                        width: `${col.width || 150}px`,
                        height: '100%',
                        display: 'flex',
                        flexDirection: 'column'
                    }}>
                        <Cell item={item} column={col} />
                    </div>
                ))
            }

            <div className="table-cell" style={{ width: '50px' }}></div>

            {/* Inline Style for Hover Effect (simpler than global CSS for now) */}
            <style>{`
                .table-row:hover .drag-handle {
                    opacity: 1 !important;
                }
                .table-row:hover .open-btn {
                    opacity: 1 !important;
                    display: flex !important;
                }
            `}</style>
        </div>
    );
});
