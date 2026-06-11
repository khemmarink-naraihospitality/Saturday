import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    DndContext,
    closestCorners,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragOverlay,
    defaultDropAnimationSideEffects,
    type DragStartEvent,
    type DragEndEvent,
} from '@dnd-kit/core';
import {
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useBoardStore } from '../../store/useBoardStore';
import { Plus, MoreHorizontal, MessageSquare, ChevronRight, ChevronDown, CornerDownRight } from 'lucide-react';
import type { Item, Column } from '../../types';

const KanbanAvatars = ({ userIds, activeBoardMembers, size = 22 }: { userIds: string[]; activeBoardMembers: any[]; size?: number }) => {
    if (!userIds || userIds.length === 0) return null;

    return (
        <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
            {userIds.slice(0, 3).map((userId, idx) => {
                const member = activeBoardMembers.find(m => m.user_id === userId);
                const profileData = Array.isArray(member?.profiles) ? member.profiles[0] : member?.profiles;
                const profile = profileData || {};
                const name = profile.full_name || profile.email || 'Unknown';
                const initial = (name[0] || '?').toUpperCase();

                return (
                    <div key={userId} title={name} style={{
                        width: size,
                        height: size,
                        borderRadius: '50%',
                        backgroundColor: profile.avatar_url ? 'transparent' : '#0073ea',
                        color: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '10px',
                        fontWeight: 600,
                        border: '2px solid white',
                        marginLeft: idx > 0 ? '-8px' : '0',
                        zIndex: idx + 1,
                        overflow: 'hidden',
                        position: 'relative',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                    }}>
                        {profile.avatar_url ? (
                            <img src={profile.avatar_url} alt="" referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : initial}
                    </div>
                );
            })}
            {userIds.length > 3 && (
                <div style={{
                    width: size,
                    height: size,
                    borderRadius: '50%',
                    backgroundColor: '#e5e7eb',
                    color: '#6b7280',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '10px',
                    fontWeight: 600,
                    border: '2px solid white',
                    marginLeft: '-8px',
                    zIndex: 10,
                    position: 'relative'
                }}>
                    +{userIds.length - 3}
                </div>
            )}
        </div>
    );
};

interface KanbanCardProps {
    item: Item;
    subItems: Item[];
    peopleColumn?: Column;
    statusColumn?: Column;
    activeBoardMembers: any[];
    isExpanded: boolean;
    onToggleExpand: () => void;
    onClick: () => void;
    onItemClick: (itemId: string) => void;
}

const KanbanCard = ({ item, subItems, peopleColumn, statusColumn, activeBoardMembers, isExpanded, onToggleExpand, onClick, onItemClick }: KanbanCardProps) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({
        id: item.id,
        data: {
            type: 'item',
            item,
        },
    });

    const style = {
        transform: CSS.Translate.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    const peopleValue = peopleColumn ? item.values?.[peopleColumn.id] : null;
    const userIds: string[] = Array.isArray(peopleValue) ? peopleValue : (peopleValue ? [peopleValue] : []);

    const statusValue = statusColumn ? item.values?.[statusColumn.id] : null;
    const statusOption = statusColumn?.options?.find(opt => opt.id === statusValue || opt.label === statusValue);

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
            onClick={onClick}
            className="kanban-card"
        >
            <div className="kanban-card-content">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <span style={{ fontSize: '14px', fontWeight: 500, color: 'hsl(var(--color-text-primary))' }}>
                        {item.title}
                    </span>
                    <button className="icon-btn-small">
                        <MoreHorizontal size={14} />
                    </button>
                </div>

                {statusOption && (
                    <div className="kanban-status-bar" style={{ backgroundColor: statusOption.color }}>
                        {statusOption.label}
                    </div>
                )}

                {peopleColumn && (
                    <div className="kanban-field-row">
                        <span className="kanban-field-label">{peopleColumn.title}</span>
                        {userIds.length > 0 ? (
                            <KanbanAvatars userIds={userIds} activeBoardMembers={activeBoardMembers} />
                        ) : (
                            <span className="kanban-field-empty">+</span>
                        )}
                    </div>
                )}

                {item.updates && item.updates.length > 0 && (
                    <div className="kanban-field-row">
                        <span className="kanban-field-label">Updates</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: 'hsl(var(--color-text-tertiary))' }}>
                            <MessageSquare size={12} />
                            <span>{item.updates.length}</span>
                        </div>
                    </div>
                )}
            </div>

            {subItems.length > 0 && (
                <div
                    className="kanban-field-row kanban-field-row-clickable"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                        e.stopPropagation();
                        onToggleExpand();
                    }}
                >
                    <span className="kanban-field-label">Sub-items</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        <span className="kanban-subitem-count-badge">{subItems.length}</span>
                    </div>
                </div>
            )}

            {isExpanded && subItems.length > 0 && (
                <div className="kanban-card-subitems-list">
                    {subItems.map(sub => {
                        const subPeopleValue = peopleColumn ? sub.values?.[peopleColumn.id] : null;
                        const subUserIds: string[] = Array.isArray(subPeopleValue) ? subPeopleValue : (subPeopleValue ? [subPeopleValue] : []);

                        return (
                            <div
                                key={sub.id}
                                className="kanban-subitem-row"
                                onPointerDown={(e) => e.stopPropagation()}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onItemClick(sub.id);
                                }}
                            >
                                <CornerDownRight size={12} className="kanban-subitem-icon" />
                                <span className="kanban-subitem-title">{sub.title}</span>
                                {subUserIds.length > 0 && <KanbanAvatars userIds={subUserIds} activeBoardMembers={activeBoardMembers} size={18} />}
                            </div>
                        );
                    })}
                </div>
            )}

            <style>{`
                .kanban-card {
                    background-color: white;
                    border: 1px solid hsl(var(--color-border));
                    border-radius: 6px;
                    padding: 12px;
                    cursor: pointer;
                    box-shadow: 0 2px 6px rgba(0,0,0,0.08);
                    margin-bottom: 8px;
                    transition: box-shadow 0.2s, border-color 0.2s;
                }
                .kanban-card:hover {
                    box-shadow: 0 6px 16px rgba(0,0,0,0.12);
                    border-color: hsl(var(--color-border-strong));
                }
                .kanban-card-content {
                    pointer-events: none;
                }
                .icon-btn-small {
                    background: none;
                    border: none;
                    color: hsl(var(--color-text-tertiary));
                    cursor: pointer;
                    padding: 2px;
                    border-radius: 4px;
                }
                .icon-btn-small:hover {
                    background-color: hsl(var(--color-bg-hover));
                    color: hsl(var(--color-text-primary));
                }
                .kanban-status-bar {
                    margin-top: 10px;
                    padding: 4px 10px;
                    border-radius: 4px;
                    color: white;
                    font-size: 12px;
                    font-weight: 500;
                    text-align: center;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                .kanban-field-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    gap: 8px;
                    margin-top: 8px;
                    font-size: 12px;
                    color: hsl(var(--color-text-secondary));
                }
                .kanban-field-label {
                    color: hsl(var(--color-text-tertiary));
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                .kanban-field-empty {
                    width: 22px;
                    height: 22px;
                    border-radius: 50%;
                    border: 1px dashed hsl(var(--color-border-strong));
                    color: hsl(var(--color-text-tertiary));
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 14px;
                    flex-shrink: 0;
                }
                .kanban-subitem-count-badge {
                    min-width: 20px;
                    padding: 1px 6px;
                    border-radius: 10px;
                    background-color: hsl(var(--color-bg-subtle));
                    color: hsl(var(--color-text-secondary));
                    font-size: 11px;
                    font-weight: 600;
                    text-align: center;
                }
                .kanban-field-row-clickable {
                    pointer-events: auto;
                    margin: 8px -12px -12px -12px;
                    padding: 8px 12px;
                    border-top: 1px solid hsl(var(--color-border));
                    cursor: pointer;
                    transition: color 0.2s, background-color 0.2s;
                }
                .kanban-field-row-clickable:hover {
                    color: hsl(var(--color-brand-primary));
                    background-color: hsl(var(--color-bg-hover));
                }
                .kanban-field-row-clickable:hover .kanban-field-label {
                    color: hsl(var(--color-brand-primary));
                }
                .kanban-card-subitems-list {
                    pointer-events: auto;
                    margin: 0 -12px -12px -12px;
                    padding: 4px 0;
                    border-top: 1px solid hsl(var(--color-border));
                    background-color: hsl(var(--color-bg-canvas));
                }
                .kanban-subitem-row {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    padding: 6px 12px 6px 28px;
                    cursor: pointer;
                    transition: background-color 0.2s;
                }
                .kanban-subitem-row:hover {
                    background-color: hsl(var(--color-bg-hover));
                }
                .kanban-subitem-row:hover .kanban-subitem-icon {
                    color: hsl(var(--color-brand-primary));
                }
                .kanban-subitem-icon {
                    flex-shrink: 0;
                    color: hsl(var(--color-text-tertiary));
                    transition: color 0.2s;
                }
                .kanban-subitem-title {
                    flex: 1;
                    font-size: 12px;
                    color: hsl(var(--color-text-secondary));
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
            `}</style>
        </div>
    );
};

interface KanbanColumnProps {
    id: string;
    label: string;
    color: string;
    items: Item[];
    subItemsByParent: Map<string, Item[]>;
    peopleColumn?: Column;
    statusColumn?: Column;
    activeBoardMembers: any[];
    expandedItemIds: string[];
    onToggleExpand: (itemId: string) => void;
    onAddItem: () => void;
    onItemClick: (itemId: string) => void;
}

const KanbanColumn = ({ id, label, color, items, subItemsByParent, peopleColumn, statusColumn, activeBoardMembers, expandedItemIds, onToggleExpand, onAddItem, onItemClick }: KanbanColumnProps) => {
    const { setNodeRef } = useSortable({
        id,
        data: {
            type: 'column',
            statusId: id,
        },
    });

    return (
        <div className="kanban-column" ref={setNodeRef}>
            <div className="kanban-column-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ 
                        width: '12px', 
                        height: '12px', 
                        borderRadius: '3px', 
                        backgroundColor: color 
                    }} />
                    <h3 style={{ fontSize: '14px', fontWeight: 600, margin: 0 }}>
                        {label} <span style={{ fontWeight: 400, color: 'hsl(var(--color-text-tertiary))', marginLeft: '4px' }}>{items.length}</span>
                    </h3>
                </div>
                <button className="icon-btn-small">
                    <MoreHorizontal size={14} />
                </button>
            </div>

            <div className="kanban-column-content">
                <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
                    {items.map(item => (
                        <KanbanCard
                            key={item.id}
                            item={item}
                            subItems={subItemsByParent.get(item.id) || []}
                            peopleColumn={peopleColumn}
                            statusColumn={statusColumn}
                            activeBoardMembers={activeBoardMembers}
                            isExpanded={expandedItemIds.includes(item.id)}
                            onToggleExpand={() => onToggleExpand(item.id)}
                            onClick={() => onItemClick(item.id)}
                            onItemClick={onItemClick}
                        />
                    ))}
                </SortableContext>
                
                <button 
                    onClick={onAddItem}
                    className="kanban-add-btn"
                >
                    <Plus size={16} />
                    <span>Add Item</span>
                </button>
            </div>

            <style>{`
                .kanban-column {
                    width: 280px;
                    min-width: 280px;
                    display: flex;
                    flex-direction: column;
                    background-color: hsl(var(--color-bg-canvas));
                    border-radius: 8px;
                    height: 100%;
                    max-height: 100%;
                }
                .kanban-column-header {
                    padding: 12px 16px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .kanban-column-content {
                    flex: 1;
                    padding: 14px 8px 16px 8px;
                    overflow-y: auto;
                }
                .kanban-add-btn {
                    width: 100%;
                    padding: 8px;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    background: none;
                    border: 1px dashed transparent;
                    border-radius: 6px;
                    color: hsl(var(--color-text-tertiary));
                    font-size: 14px;
                    cursor: pointer;
                    transition: all 0.2s;
                    margin-top: 4px;
                }
                .kanban-add-btn:hover {
                    background-color: hsl(var(--color-bg-hover));
                    border-color: hsl(var(--color-border));
                    color: hsl(var(--color-text-secondary));
                }
            `}</style>
        </div>
    );
};

export const KanbanView = () => {
    const activeBoardId = useBoardStore(state => state.activeBoardId);
    const boards = useBoardStore(state => state.boards);
    const addItem = useBoardStore(state => state.addItem);
    const updateItemValue = useBoardStore(state => state.updateItemValue);
    const moveItem = useBoardStore(state => state.moveItem);
    const activeBoardMembers = useBoardStore(state => state.activeBoardMembers);
    const searchQuery = useBoardStore(state => state.searchQuery);
    const showHiddenItems = useBoardStore(state => state.showHiddenItems);
    const setActiveItem = useBoardStore(state => state.setActiveItem);
    const toggleItemExpansion = useBoardStore(state => state.toggleItemExpansion);

    const activeBoard = useMemo(() => boards.find(b => b.id === activeBoardId), [boards, activeBoardId]);
    
    // 1. Filtered Items
    const filteredItems = useMemo(() => {
        if (!activeBoard) return [];
        let items = [...activeBoard.items];

        // Search
        if (searchQuery) {
            items = items.filter(item => (item.title || '').toLowerCase().includes(searchQuery.toLowerCase()));
        }

        // Hidden Items
        if (!showHiddenItems) {
            items = items.filter(item => !item.isHidden);
        }

        // Column Filters and Group Filter
        if (activeBoard.filters && activeBoard.filters.length > 0) {
            activeBoard.filters.forEach(filter => {
                if (filter.values && filter.values.length > 0) {
                    items = items.filter(item => {
                        if (filter.columnId === '__group__') {
                            return filter.values.includes(item.groupId);
                        }
                        
                        const val = item.values[filter.columnId];
                        return Array.isArray(val) ? val.some(v => filter.values.includes(v)) : filter.values.includes(val);
                    });
                }
            });
        }

        // Sort (if any)
        if (activeBoard.sort) {
            const { columnId, direction } = activeBoard.sort;
            const col = activeBoard.columns.find(c => c.id === columnId);
            if (col && direction) {
                items.sort((a, b) => {
                    let valA = a.values[columnId];
                    let valB = b.values[columnId];
                    if (col.type === 'number') {
                        valA = Number(valA) || 0;
                        valB = Number(valB) || 0;
                    }
                    if (valA < valB) return direction === 'asc' ? -1 : 1;
                    if (valA > valB) return direction === 'asc' ? 1 : -1;
                    return 0;
                });
            }
        }

        return items;
    }, [activeBoard, searchQuery, showHiddenItems]);
    
    // Determine the grouping column (null = group by the board's own Groups, the "Default (Groups)" mode)
    const groupingColumn = useMemo(() => {
        if (!activeBoard || !activeBoard.groupByColumnId) return null;
        return activeBoard.columns.find(c => c.id === activeBoard.groupByColumnId) || null;
    }, [activeBoard]);

    // The "Person" column shown as avatars on each card
    const peopleColumn = useMemo(() => {
        return activeBoard?.columns.find(c => c.type === 'people');
    }, [activeBoard]);

    // The "Status" column shown as a colored bar on each card (skip if it's already the grouping column)
    const statusColumn = useMemo(() => {
        return activeBoard?.columns.find(c => c.type === 'status' && c.id !== activeBoard.groupByColumnId);
    }, [activeBoard]);

    // Map of parentId -> visible sub-items, for the "Sub-items" expand toggle on each card
    const subItemsByParent = useMemo(() => {
        const map = new Map<string, Item[]>();
        if (!activeBoard) return map;
        activeBoard.items.forEach(item => {
            if (!item.parentId) return;
            if (!showHiddenItems && item.isHidden) return;
            const list = map.get(item.parentId) || [];
            list.push(item);
            map.set(item.parentId, list);
        });
        return map;
    }, [activeBoard, showHiddenItems]);

    const expandedItemIds = activeBoard?.expandedItemIds || [];

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 5,
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const columns = useMemo(() => {
        if (!activeBoard) return [];

        // "Default (Groups)" mode - one Kanban column per board Group
        if (!activeBoard.groupByColumnId) {
            return activeBoard.groups.map(group => ({
                id: group.id,
                label: group.title,
                color: group.color,
                items: filteredItems.filter(item => !item.parentId && item.groupId === group.id)
            }));
        }

        if (!groupingColumn) return [];

        let columnDefs: { id: string; label: string; color: string }[] = [];
        
        if (groupingColumn.options && groupingColumn.options.length > 0) {
            columnDefs = groupingColumn.options.map(opt => ({
                id: opt.id,
                label: opt.label,
                color: opt.color
            }));
        } else {
            // Derive columns from unique values in items (e.g. for Person column without explicit options)
            const uniqueValues = new Set<string>();
            filteredItems.forEach(item => {
                const val = item.values[groupingColumn.id];
                if (val) {
                    if (Array.isArray(val)) val.forEach(v => uniqueValues.add(String(v)));
                    else uniqueValues.add(String(val));
                }
            });
            columnDefs = Array.from(uniqueValues).map(val => {
                let label = val;
                if (groupingColumn.type === 'people') {
                    const member = activeBoardMembers.find(m => m.user_id === val);
                    const profileData = Array.isArray(member?.profiles) ? member.profiles[0] : member?.profiles;
                    label = profileData?.full_name || profileData?.email || val;
                }
                return {
                    id: val,
                    label,
                    color: 'hsl(var(--color-bg-subtle))'
                };
            });
        }

        const itemsByGroup: Record<string, Item[]> = {};
        columnDefs.forEach(col => { itemsByGroup[col.id] = []; });
        itemsByGroup['no-value'] = [];

        filteredItems.forEach(item => {
            const val = item.values?.[groupingColumn.id];
            if (val) {
                if (Array.isArray(val)) {
                    val.forEach(v => { if (itemsByGroup[v]) itemsByGroup[v].push(item); });
                } else if (itemsByGroup[val]) {
                    itemsByGroup[val].push(item);
                } else {
                    itemsByGroup['no-value'].push(item);
                }
            } else {
                itemsByGroup['no-value'].push(item);
            }
        });

        const availableColumns = columnDefs.map(def => ({
            ...def,
            items: itemsByGroup[def.id]
        }));

        if (itemsByGroup['no-value'].length > 0) {
            availableColumns.unshift({
                id: 'no-value',
                label: 'None',
                color: 'hsl(var(--color-text-tertiary))',
                items: itemsByGroup['no-value']
            });
        }

        return availableColumns;
    }, [groupingColumn, activeBoard, filteredItems]);

    const [draggingId, setDraggingId] = useState<string | null>(null);

    const handleDragStart = (event: DragStartEvent) => {
        setDraggingId(event.active.id as string);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        setDraggingId(null);
        if (!over || !activeBoard) return;

        const activeId = active.id as string;
        const activeItem = activeBoard.items.find(i => i.id === activeId);
        if (!activeItem) return;

        // "Default (Groups)" mode - move the item between board Groups
        if (!activeBoard.groupByColumnId) {
            moveItem(activeId, over.id as string);
            return;
        }

        if (!groupingColumn) return;

        const overData = over.data.current;
        if (overData?.type === 'column') {
            const newValue = overData.statusId === 'no-value' ? null : overData.statusId;
            if (activeItem.values?.[groupingColumn.id] !== newValue) {
                updateItemValue(activeId, groupingColumn.id, newValue);
            }
        } else if (overData?.type === 'item') {
            const overItem = overData.item as Item;
            const newValue = overItem.values?.[groupingColumn.id] || null;
            if (activeItem.values?.[groupingColumn.id] !== newValue) {
                updateItemValue(activeId, groupingColumn.id, newValue);
            }
        }
    };

    const draggingItem = draggingId ? activeBoard?.items.find(i => i.id === draggingId) : null;

    if (!activeBoard) {
        return null;
    }

    if (activeBoard.groupByColumnId && !groupingColumn) {
        return (
            <div style={{ padding: '40px', textAlign: 'center', color: 'hsl(var(--color-text-tertiary))' }}>
                <p>No valid grouping column found for this board. Kanban view requires a Status, Dropdown, or People column.</p>
            </div>
        );
    }

    return (
        <div className="kanban-view-container">
            <DndContext
                sensors={sensors}
                collisionDetection={closestCorners}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
            >
                <div className="kanban-board">
                    {columns.map(col => (
                        <KanbanColumn
                            key={col.id}
                            id={col.id}
                            label={col.label}
                            color={col.color}
                            items={col.items}
                            subItemsByParent={subItemsByParent}
                            peopleColumn={peopleColumn}
                            statusColumn={statusColumn}
                            activeBoardMembers={activeBoardMembers}
                            expandedItemIds={expandedItemIds}
                            onToggleExpand={(itemId) => toggleItemExpansion(activeBoard.id, itemId)}
                            onItemClick={setActiveItem}
                            onAddItem={() => {
                                if (!activeBoard.groupByColumnId) {
                                    addItem("New Item", col.id);
                                    return;
                                }
                                const firstGroup = activeBoard.groups[0];
                                if (firstGroup) {
                                    addItem("New Item", firstGroup.id);
                                }
                            }}
                        />
                    ))}
                </div>

                {createPortal(
                    <DragOverlay dropAnimation={{
                        sideEffects: defaultDropAnimationSideEffects({
                            styles: {
                                active: { opacity: '0.4' },
                            },
                        }),
                    }}>
                        {draggingItem && (
                            <div className="kanban-card" style={{ width: '264px', cursor: 'grabbing', boxShadow: '0 8px 16px rgba(0,0,0,0.15)' }}>
                                <div className="kanban-card-content">
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <span style={{ fontSize: '14px', fontWeight: 500, color: 'hsl(var(--color-text-primary))' }}>
                                            {draggingItem.title}
                                        </span>
                                    </div>
                                    {draggingItem.updates && draggingItem.updates.length > 0 && (
                                        <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: 'hsl(var(--color-text-tertiary))' }}>
                                            <MessageSquare size={12} />
                                            <span>{draggingItem.updates.length}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </DragOverlay>,
                    document.body
                )}
            </DndContext>

            <style>{`
                .kanban-view-container {
                    flex: 1;
                    overflow: hidden;
                    display: flex;
                    flex-direction: column;
                    padding: 24px 32px;
                }
                .kanban-board {
                    flex: 1;
                    display: flex;
                    gap: 16px;
                    overflow-x: auto;
                    align-items: flex-start;
                    padding-bottom: 32px;
                }
            `}</style>
        </div>
    );
};


