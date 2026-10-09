import { motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { useRef, useMemo, useState, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useBoardStore } from '../../store/useBoardStore';
import { usePermission } from '../../hooks/usePermission';
import { Header } from './Header';
import { Row } from './Row';
import { GroupRow } from './GroupRow';
import { groupItems } from '../../utils/grouping';
import type { VirtualItemData } from '../../utils/grouping';
import { linkDisplayText } from '../../lib/utils';
import { itemColumns, subitemColumns, scopeOf } from '../../lib/columnScope';
import type { Column } from '../../types';
import { SummaryCell } from './SummaryCell';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragOverlay,
    defaultDropAnimationSideEffects,
    type DragStartEvent,
    type DragEndEvent
} from '@dnd-kit/core';
import {
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { createPortal } from 'react-dom';

// Wrapper for Sortable Items
const SortableItemWrapper = ({
    id,
    children,
    disabled,
    style: propStyle
}: {
    id: string;
    children: (vals: any) => React.ReactNode;
    disabled?: boolean;
    style?: React.CSSProperties
}) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id, disabled });

    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.3 : 1,
        ...propStyle,
        height: '100%',
        width: '100%',
        position: 'relative',
        // Prevent gaps during drag
        margin: 0,
        padding: 0,
        boxSizing: 'border-box'
    };

    return (
        <div ref={setNodeRef} style={style} {...(disabled ? {} : attributes)}>
            {children({ listeners })}
        </div>
    );
};

const NO_COLUMNS: Column[] = [];

// The real group a dropped-on row belongs to, for reordering groups by drag — a
// group row is itself, everything else falls under the group its own data
// carries (an item or footer's `groupId`, or a sub-item row's `columnGroupId`,
// since a sub-item's group is its parent's — see columnScope in CLAUDE.md).
// Dropping a dragged group onto anything this doesn't recognise returns null and
// the caller no-ops, which is exactly how a group used to silently snap back to
// its old spot when released on its own footer row or on any sub-item row (the
// "+ Add subitem" row, a sub-item, its header or its summary) — only 'group' and
// 'item' targets were ever resolved.
const groupIdOfRow = (vi: VirtualItemData | undefined): string | null => {
    if (!vi) return null;
    switch (vi.type) {
        case 'group': return vi.id;
        case 'item':
        case 'footer': return (vi.data as { groupId?: string })?.groupId ?? null;
        case 'subitem-header':
        case 'subitem':
        case 'subitem-footer':
        case 'subitem-summary': return vi.columnGroupId ?? null;
        default: return null;
    }
};

// Header.tsx's row height. The item header lives outside the virtualizer (it's
// one frozen bar now, not one per group — see the scrollMargin/translateY note
// below), so this has to be known up front rather than read off a measured row.
const ITEM_HEADER_HEIGHT = 34;

export const Table = ({ boardId }: { boardId: string }) => {
    const board = useBoardStore(state => state.boards.find(b => b.id === boardId));
    const toggleGroup = useBoardStore(state => state.toggleGroup);
    const moveItem = useBoardStore(state => state.moveItem);
    const reorderGroups = useBoardStore(state => state.reorderGroups);
    const parentRef = useRef<HTMLDivElement>(null);
    const { can } = usePermission();

    const searchQuery = useBoardStore(state => state.searchQuery);
    const showHiddenItems = useBoardStore(state => state.showHiddenItems);
    const itemColumnWidth = board?.itemColumnWidth || 350;

    const [activeId, setActiveId] = useState<string | null>(null);

    if (board && !board.isDataLoaded) {
        return (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'hsl(var(--color-text-tertiary))' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                    <div className="spinner" style={{ width: '24px', height: '24px', border: '2px solid hsl(var(--color-border))', borderTopColor: 'hsl(var(--color-brand-primary))', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                    <p style={{ fontSize: '14px' }}>Loading board content...</p>
                </div>
                <style>{`
                    @keyframes spin { to { transform: rotate(360deg); } }
                `}</style>
            </div>
        );
    }

    const virtualItems = useMemo(() => {
        if (!board) return [];
        let items = [...board.items]; // Clone to sort

        // 1. Search
        if (searchQuery) {
            items = items.filter(item => item.title.toLowerCase().includes(searchQuery.toLowerCase()));
        }

        // Filter Hidden Items
        if (!showHiddenItems) {
            items = items.filter(item => !item.isHidden);
        }

        // 2. Column Filter and Group Filter
        if (board.filters && board.filters.length > 0) {
            board.filters.forEach(filter => {
                if (filter.values && filter.values.length > 0) {
                    items = items.filter(item => {
                        if (filter.columnId === '__group__') {
                            return filter.values.includes(item.groupId);
                        }

                        const val = item.values[filter.columnId];

                        // Handle Array values (Dropdown) -> Intersection Check
                        if (Array.isArray(val)) {
                            // If ANY of the item's labels match ANY of the filter values, keep it.
                            return val.some(v => filter.values.includes(v));
                        }

                        // Handle Boolean values (Checkbox) -> String Conversion Check
                        if (typeof val === 'boolean') {
                            return filter.values.includes(String(val));
                        }

                        // Default: Single Value Check
                        return filter.values.includes(val);
                    });
                }
            });
        }

        // 3. Sort
        if (board.sort) {
            const { columnId, direction } = board.sort;
            const col = board.columns.find(c => c.id === columnId);
            if (col && direction) {
                items.sort((a, b) => {
                    let valA = a.values[columnId];
                    let valB = b.values[columnId];

                    // Handle different types
                    // Priority sorts with the numbers: it is a 1-5 rating, and
                    // sorting it as text would order 10 before 2 if the scale
                    // ever grows.
                    if (col.type === 'number' || col.type === 'priority') {
                        valA = parseFloat(valA) || 0;
                        valB = parseFloat(valB) || 0;
                    } else if (col.type === 'date' || col.type === 'due_date') {
                        // Date strings usually sortable if ISO, otherwise parse
                        valA = valA || '';
                        valB = valB || '';
                    } else if (col.type === 'link') {
                        // A labelled link is an object; sort it the way it reads.
                        valA = linkDisplayText(valA).toLowerCase();
                        valB = linkDisplayText(valB).toLowerCase();
                    } else if (col.type === 'status' || col.type === 'dropdown') {
                        // Try to find option label if val maps to an option ID
                        const options = Array.isArray(col.options) ? col.options : [];
                        const optA = options.find(o => o.id === valA || o.label === valA);
                        const optB = options.find(o => o.id === valB || o.label === valB);
                        valA = (optA ? optA.label : (valA || '')).toString().toLowerCase();
                        valB = (optB ? optB.label : (valB || '')).toString().toLowerCase();
                    } else {
                        // String (Text, etc)
                        valA = (valA || '').toString().toLowerCase();
                        valB = (valB || '').toString().toLowerCase();
                    }

                    if (valA < valB) return direction === 'asc' ? -1 : 1;
                    if (valA > valB) return direction === 'asc' ? 1 : -1;
                    return 0;
                });
            }
        }

        return groupItems(items, board.groups || [], board.groupByColumnId || null, board.collapsedGroups || [], board.expandedItemIds || [], itemColumns(board.columns), groupId => subitemColumns(board.columns, groupId));
    }, [board?.items, board?.groups, board?.groupByColumnId, board?.collapsedGroups, board?.expandedItemIds, board?.columns, searchQuery, board?.sort, board?.filters, showHiddenItems]);

    const rowVirtualizer = useVirtualizer({
        count: virtualItems.length,
        getScrollElement: () => parentRef.current,
        estimateSize: (index) => {
            const type = virtualItems[index]?.type;
            const gap = 32; // var(--spacing-group-gap)
            if (type === 'group') return (index === 0 ? 44 : 44 + gap); 
            if (type === 'subitem-header') return 34;
            if (type === 'subitem-footer' || type === 'subitem-summary') return 40;
            if (type === 'footer') return 80;
            return 30;
        },
        overscan: 5,
        // The frozen header above sits in normal flow, pushing the virtualized
        // rows down by its own height; this tells the virtualizer about that
        // offset so it maps scrollTop to the right rows. Row positions below are
        // then shifted back by the same amount (virtualRow.start is margin-relative,
        // the rows div they're drawn in isn't).
        scrollMargin: ITEM_HEADER_HEIGHT,
    });

    // Force remeasure after items change to prevent gaps
    useEffect(() => {
        rowVirtualizer.measure();
    }, [virtualItems, rowVirtualizer]);

    // SCROLL TO HIGHLIGHTED ITEM
    const highlightedItemId = useBoardStore(state => state.highlightedItemId);

    useEffect(() => {
        if (highlightedItemId) {
            const index = virtualItems.findIndex(i => i.id === highlightedItemId);
            if (index !== -1) {
                rowVirtualizer.scrollToIndex(index, { align: 'center', behavior: 'smooth' });
                // We rely on Row.tsx to handle the flashing class, 
                // IF the row is rendered.
            }
        }
    }, [highlightedItemId, virtualItems, rowVirtualizer]);

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 5, // Prevent accidental drags
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const handleDragStart = (event: DragStartEvent) => {
        setActiveId(event.active.id as string);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveId(null);

        if (active.id !== over?.id && over) {
            const activeVItem = virtualItems.find(i => i.id === active.id);
            const overVItem = virtualItems.find(i => i.id === over.id);

            if (activeVItem?.type === 'group') {
                const targetGroupId = groupIdOfRow(overVItem);
                if (targetGroupId && active.id !== targetGroupId) {
                    reorderGroups(active.id as string, targetGroupId);
                }
            } else {
                moveItem(active.id as string, over.id as string);
            }
        }
    };

    // Debug: Log Virtual Items
    // useEffect(() => {
    //     console.log('[DnD] VirtualItems:', virtualItems.map(i => i.id));
    // }, [virtualItems.length]); // logs too often?


    // The width of the columns alone. Shared by the header, the add-item row and
    // the group summary row so that all three are measured from one number
    // rather than each re-deriving its own.
    // Items have one set of columns, and the sub-items under each group's items
    // another, so every set is sized on its own. The table is as wide as the
    // widest of them, so narrower rows simply end earlier instead of the page
    // scrolling short.
    const itemCols = useMemo(() => itemColumns(board?.columns || []), [board?.columns]);
    // One array per group, built once per change to the columns, so a sub-item
    // row gets the same array every render and its memoised cells stay put.
    const subColsByGroup = useMemo(() => {
        const byGroup = new Map<string, Column[]>();
        (board?.columns || []).forEach(c => {
            if (scopeOf(c) !== 'subitem' || !c.groupId) return;
            const list = byGroup.get(c.groupId);
            if (list) list.push(c); else byGroup.set(c.groupId, [c]);
        });
        return byGroup;
    }, [board?.columns]);
    const subColsFor = (groupId?: string): Column[] => (groupId && subColsByGroup.get(groupId)) || NO_COLUMNS;
    const widthOf = (cols: Column[]) => cols.reduce((total, col) => total + (col.width || 150), 0);
    const columnsWidth = useMemo(() => {
        // Only groups on screen: archived groups keep their columns for a restore.
        const shown = new Set((board?.groups || []).map(g => g.id));
        let widest = widthOf(itemCols);
        subColsByGroup.forEach((cols, groupId) => { if (shown.has(groupId)) widest = Math.max(widest, widthOf(cols)); });
        return widest;
    }, [itemCols, subColsByGroup, board?.groups]);
    // The summary/footer rows belong to the items, so they use the item set's own width.
    const itemColumnsWidth = useMemo(
        () => itemCols.reduce((total, col) => total + (col.width || 150), 0),
        [itemCols]
    );

    const totalWidth = useMemo(() => {
        if (!board) return 0;
        return itemColumnWidth + columnsWidth + 50; // Add 50 for the add column btn/last spacer
    }, [board, itemColumnWidth, columnsWidth]);

    if (!board) return null;

    const activeItem = activeId ? board.items.find(i => i.id === activeId) : null;

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
        >
            <div
                ref={parentRef}
                className="table-container"
                // A stacking context of its own, so the z-indexes inside the table
                // (the frozen header's 100, a dragged row's 99, sticky columns) only
                // order things within the table and can't lift any of it above the
                // rest of the page. Without it the frozen header rose above modal
                // backdrops and dropdowns opened elsewhere: dimmed page, bright bar.
                // Every menu the table opens is portaled to <body>, so nothing
                // inside needs to escape.
                style={{ height: '100%', overflow: 'auto', width: '100%', isolation: 'isolate' }}
            >
                {/* The item columns' header. One bar for the whole table rather than one
                    per group — item columns are the same set everywhere — pinned to the
                    top of the scroll container so it stays visible past every group. */}
                <div style={{
                    position: 'sticky',
                    top: 0,
                    zIndex: 100,
                    backgroundColor: 'hsl(var(--color-table-header-bg))'
                }}>
                    <Header columns={itemCols} />
                </div>

                <div
                    className="table-content"
                    style={{
                        height: `${rowVirtualizer.getTotalSize()}px`,
                        width: `${totalWidth}px`, // Use calculated total width
                        position: 'relative',
                    }}
                >

                    <SortableContext
                        items={virtualItems.map(i => i.id)}
                        strategy={verticalListSortingStrategy}
                    >
                        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                            const vItem = virtualItems[virtualRow.index];
                            const isGroup = vItem.type === 'group';
                            const isFooter = vItem.type === 'footer';

                            const isDragging = activeId === vItem.id;
                            return (
                                <div
                                    key={vItem.id}
                                    style={{
                                        position: 'absolute',
                                        top: 0,
                                        left: 0,
                                        width: `${totalWidth}px`, // Ensure row wrapper spans full content width
                                        height: `${virtualRow.size}px`,
                                        transform: `translateY(${virtualRow.start - ITEM_HEADER_HEIGHT}px)`,
                                        zIndex: isDragging ? 99 : 1
                                    }}
                                >
                                    <SortableItemWrapper
                                        id={vItem.id}
                                        // We enable sortable for everything so they can be valid drop targets,
                                        // but we only attach listeners to Items (in Row.tsx), so only items are draggable.
                                        disabled={!can('edit_items')}
                                    >
                                        {({ listeners }) => (
                                            <motion.div
                                                initial={{ opacity: 0, y: -20 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={{ duration: 0.2, ease: "easeOut" }}
                                                style={{ height: '100%' }}
                                            >
                                                {isGroup ? (
                                                    <div style={{ 
                                                        position: 'relative', 
                                                        height: '100%', 
                                                        display: 'flex', 
                                                        flexDirection: 'column', 
                                                        justifyContent: 'flex-end',
                                                        paddingTop: virtualRow.index === 0 ? 0 : '32px' 
                                                    }}>
                                                        <GroupRow
                                                            data={vItem.data as any}
                                                            groupColor={vItem.groupColor}
                                                            isCollapsed={(board.collapsedGroups || []).includes(vItem.id)}
                                                            onToggle={() => toggleGroup(board.id, vItem.id)}
                                                            dragHandleProps={listeners}
                                                        />
                                                    </div>
                                                ) : isFooter ? (
                                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                        <div style={{
                                                            display: 'flex',
                                                            height: '36px',
                                                            position: 'relative',
                                                        }}>
                                                            {vItem.groupColor && (
                                                                <div style={{
                                                                    position: 'absolute',
                                                                    left: '0px',
                                                                    top: '0px',
                                                                    bottom: '-44px',
                                                                    width: '6px',
                                                                    backgroundColor: vItem.groupColor,
                                                                    zIndex: 80,
                                                                    borderTopLeftRadius: '0px',
                                                                    borderBottomLeftRadius: '6px'
                                                                }} />
                                                            )}
                                                            <div className="sticky-col" style={{
                                                                width: `${itemColumnWidth}px`,
                                                                position: 'sticky',
                                                                left: 0,
                                                                zIndex: 55,
                                                                backgroundColor: 'hsl(var(--color-bg-canvas))',
                                                                borderRight: 'none',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                paddingLeft: vItem.groupColor ? '24px' : '8px',
                                                                borderBottom: '1px solid hsl(var(--color-border))',
                                                                boxSizing: 'border-box',
                                                                flexShrink: 0,
                                                                gap: '8px',
                                                                boxShadow: '2px 0 5px -2px rgba(0,0,0,0.1)'
                                                            }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', width: '100%', height: '100%', gap: '8px' }}>
                                                                    <div style={{
                                                                        width: '16px',
                                                                        height: '16px',
                                                                        flexShrink: 0
                                                                    }} />
                                                                    {can('edit_items') && (
                                                                        <input
                                                                            type="text"
                                                                            placeholder=" + Add Item"
                                                                            className="cell-input"
                                                                            style={{ fontSize: '13px', color: 'hsl(var(--color-text-secondary))', width: '100%', background: 'transparent', height: '100%' }}
                                                                            onKeyDown={(e) => {
                                                                                if (e.key === 'Enter') {
                                                                                    const val = (e.currentTarget as HTMLInputElement).value;
                                                                                    if (val.trim()) {
                                                                                        useBoardStore.getState().addItem(val.trim(), vItem.data.groupId);
                                                                                        (e.currentTarget as HTMLInputElement).value = '';
                                                                                    }
                                                                                }
                                                                            }}
                                                                        />
                                                                    )}
                                                                </div>
                                                            </div>
                                                            {itemCols.map(col => (
                                                                <div key={col.id} style={{
                                                                    width: `${col.width || 150}px`,
                                                                    borderRight: 'none',
                                                                    borderBottom: '1px solid hsl(var(--color-border))',
                                                                    boxSizing: 'border-box',
                                                                    flexShrink: 0
                                                                }} />
                                                            ))}
                                                            <div style={{ width: '50px', borderBottom: '1px solid hsl(var(--color-border))', flexShrink: 0 }} />
                                                        </div>

                                                        <div style={{
                                                            display: 'flex',
                                                            height: '40px',
                                                            position: 'relative',
                                                            marginTop: '4px'
                                                        }}>
                                                            <div className="sticky-col" style={{
                                                                width: `${itemColumnWidth}px`,
                                                                position: 'sticky',
                                                                left: 0,
                                                                zIndex: 70,
                                                                backgroundColor: 'hsl(var(--color-bg-canvas))',
                                                                flexShrink: 0,
                                                                borderRight: 'none',
                                                                boxShadow: 'none',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'flex-end',
                                                                paddingRight: 0,
                                                            }}>
                                                                <div style={{
                                                                    height: '36px',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center',
                                                                    padding: '0 16px',
                                                                    // Nudged up 2px so its frame lines up with the top edge
                                                                    // of the aggregate box beside it (the row centres this
                                                                    // 36px pill in 40px, the aggregate box sits at the top).
                                                                    // position/top rather than a margin: a margin on a
                                                                    // centred flex item only moves it half as far, and this
                                                                    // must not shift layout.
                                                                    position: 'relative',
                                                                    top: '-2px',
                                                                    backgroundColor: 'hsl(var(--color-bg-surface))',
                                                                    borderRadius: '8px 0 0 8px',
                                                                    border: `1px solid ${vItem.groupColor || 'hsl(var(--color-border))'}`,
                                                                    borderRight: 'none',
                                                                    boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
                                                                    color: 'hsl(var(--color-text-secondary))',
                                                                    fontSize: '12px',
                                                                    minWidth: '100px',
                                                                }}>
                                                                    {board.items.filter(i => i.groupId === vItem.data.groupId).length} items
                                                                </div>
                                                            </div>
                                                            <div style={{
                                                                display: 'flex',
                                                                border: `1px solid ${vItem.groupColor || 'hsl(var(--color-border))'}`,
                                                                borderLeft: 'none',
                                                                borderRadius: '0 8px 8px 0',
                                                                backgroundColor: 'hsl(var(--color-bg-surface))',

                                                                overflow: 'hidden',
                                                                height: '36px',
                                                                marginTop: '0px',
                                                                boxSizing: 'border-box',
                                                                flexShrink: 0,
                                                                // Pinned to the column grid rather than fit-content. The
                                                                // box is already border-box above, so its 1px frame is
                                                                // drawn inside this width: fit-content plus that border
                                                                // made the row finish a pixel right of every other row.
                                                                width: `${itemColumnsWidth}px`,
                                                                minWidth: '100px' // Ensure it has some width
                                                            }}>
                                                                {itemCols.map((col, idx) => {
                                                                    const agg = vItem.data.aggregates?.[col.id];
                                                                    const totalCount = vItem.data.count || 0;
                                                                    return (
                                                                        <div key={col.id} style={{
                                                                            width: `${col.width || 150}px`,
                                                                            display: 'flex',
                                                                            alignItems: 'center',
                                                                            justifyContent: 'center',
                                                                            padding: '0 8px',
                                                                            borderRight: idx < itemCols.length - 1 ? '1px solid hsl(var(--color-border))' : 'none',
                                                                            height: '100%',
                                                                            boxSizing: 'border-box',
                                                                            flexShrink: 0
                                                                        }}>
                                                                            <SummaryCell col={col} agg={agg} totalCount={totalCount} color={vItem.groupColor} />
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                            {/* The header and the add-item row both end with this 50px
                                                                add-column cell, and totalWidth counts it. The summary
                                                                row did not have it, so it stopped 50px short and its
                                                                right edge sat inside every other row's. */}
                                                            <div style={{ width: '50px', flexShrink: 0 }} />
                                                        </div>
                                                    </div>
                                                ) : vItem.type === 'subitem-header' ? (
                                                    // The sub-items' own header: their columns, editable like the
                                                    // main one. Previously this re-drew the item columns with a
                                                    // hard-coded title mapping to fake different labels.
                                                    <Header scope="subitem" columns={subColsFor(vItem.columnGroupId)} groupId={vItem.columnGroupId} groupColor={vItem.groupColor} />
                                                ) : vItem.type === 'subitem-summary' ? (
                                                    // Totals for this parent's sub-items, over the sub-item columns.
                                                    <div className="table-row subitem-summary" style={{ display: 'flex', height: '40px', position: 'relative', alignItems: 'center' }}>
                                                        {vItem.groupColor && (
                                                            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '6px', backgroundColor: vItem.groupColor, zIndex: 80 }} />
                                                        )}
                                                        <div className="sticky-col" style={{
                                                            width: `${itemColumnWidth}px`,
                                                            position: 'sticky',
                                                            left: 0,
                                                            zIndex: 55,
                                                            backgroundColor: 'hsl(var(--color-bg-canvas))',
                                                            flexShrink: 0,
                                                            height: '100%',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'flex-end',
                                                            paddingRight: '12px',
                                                            boxSizing: 'border-box',
                                                            fontSize: '11px',
                                                            color: 'hsl(var(--color-text-tertiary))'
                                                        }}>
                                                            {vItem.data.count} {vItem.data.count === 1 ? 'subitem' : 'subitems'}
                                                        </div>
                                                        <div style={{
                                                            display: 'flex',
                                                            height: '32px',
                                                            width: `${widthOf(subColsFor(vItem.columnGroupId))}px`,
                                                            flexShrink: 0,
                                                            boxSizing: 'border-box',
                                                            overflow: 'hidden',
                                                            border: `1px solid ${vItem.groupColor || 'hsl(var(--color-border))'}`,
                                                            borderRadius: '8px',
                                                            backgroundColor: 'hsl(var(--color-bg-surface))'
                                                        }}>
                                                            {subColsFor(vItem.columnGroupId).map((col, idx, cols) => (
                                                                <div key={col.id} style={{
                                                                    width: `${col.width || 150}px`,
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center',
                                                                    padding: '0 8px',
                                                                    borderRight: idx < cols.length - 1 ? '1px solid hsl(var(--color-border))' : 'none',
                                                                    height: '100%',
                                                                    boxSizing: 'border-box',
                                                                    flexShrink: 0,
                                                                    fontSize: '12px'
                                                                }}>
                                                                    <SummaryCell col={col} agg={vItem.data.aggregates?.[col.id]} totalCount={vItem.data.count || 0} color={vItem.groupColor} />
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                ) : vItem.type === 'subitem-footer' ? (
                                                    <div className="table-row subitem-footer" style={{
                                                        height: '40px',
                                                        display: 'flex',
                                                        paddingLeft: 0,
                                                        backgroundColor: 'transparent',
                                                        position: 'relative',
                                                        alignItems: 'center'
                                                    }}>
                                                        {vItem.groupColor && (
                                                            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '6px', backgroundColor: vItem.groupColor, opacity: 1, zIndex: 80 }} />
                                                        )}
                                                        <div
                                                            onClick={() => useBoardStore.getState().addItem('New Sub-item', vItem.data.groupId, vItem.data.parentId)}
                                                            style={{
                                                                cursor: 'pointer',
                                                                fontSize: '13px',
                                                                color: 'hsl(var(--color-text-tertiary))',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: '8px',
                                                                padding: '4px 8px',
                                                                borderRadius: '4px',
                                                                marginLeft: vItem.groupColor ? '116px' : '106px' // Indent further to match new Row.tsx (86px/76px + base margin)
                                                            }}
                                                            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-hover))'; e.currentTarget.style.color = 'hsl(var(--color-text-secondary))'; }}
                                                            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'hsl(var(--color-text-tertiary))'; }}
                                                        >
                                                            <span style={{ fontSize: '18px', lineHeight: 1 }}>+</span> Add subitem
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <Row
                                                        item={vItem.data as any}
                                                        columns={vItem.type === 'subitem' ? subColsFor(vItem.columnGroupId) : itemCols}
                                                        groupColor={vItem.groupColor}
                                                        itemColumnWidth={itemColumnWidth}
                                                        dragHandleProps={listeners}
                                                        isSubItem={vItem.type === 'subitem'}
                                                        isExpanded={(board.expandedItemIds || []).includes(vItem.id)}
                                                        onToggleExpand={() => useBoardStore.getState().toggleItemExpansion(board.id, vItem.id)}
                                                    />
                                                )}
                                            </motion.div>
                                        )}
                                    </SortableItemWrapper>
                                </div>
                            );
                        })}
                    </SortableContext>
                </div>

                {/* Drag Overlay */}
                {createPortal(
                    <DragOverlay dropAnimation={{
                        sideEffects: defaultDropAnimationSideEffects({
                            styles: {
                                active: { opacity: '0.3' },
                            },
                        }),
                    }}>
                        {activeItem && (
                            <div style={{
                                height: '40px',
                                background: 'hsl(var(--color-bg-surface))',
                                border: '1px solid hsl(var(--color-brand-primary))',
                                borderRadius: '4px',
                                display: 'flex',
                                alignItems: 'center',
                                paddingLeft: '8px',
                                boxShadow: '0 8px 16px rgba(0,0,0,0.1)'
                            }}>
                                <span style={{ fontWeight: 600 }}>{activeItem.title}</span>
                            </div>
                        )}
                    </DragOverlay>,
                    document.body
                )}

                <div style={{
                    paddingTop: '24px',
                    paddingBottom: '40px',
                    paddingLeft: '32px',
                    display: 'flex',
                    justifyContent: 'flex-start'
                }}>
                    {can('group_ungroup') && (
                        <button
                            onClick={() => {
                                useBoardStore.getState().addGroup("Group Title");
                            }}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '6px 16px',
                                borderRadius: '6px',
                                border: '1px solid #c3c6d4',
                                backgroundColor: '#ffffff',
                                color: '#323338',
                                cursor: 'pointer',
                                transition: 'background-color 0.2s',
                                fontWeight: 400,
                                fontSize: '14px'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f5f6f8'}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#ffffff'}
                        >
                            <Plus size={16} strokeWidth={1.5} />
                            <span>Add new group</span>
                        </button>
                    )}
                </div>
            </div>
        </DndContext>
    );
};
