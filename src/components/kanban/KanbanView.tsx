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
import { Plus, MoreHorizontal, MessageSquare } from 'lucide-react';
import type { Item } from '../../types';

interface KanbanCardProps {
    item: Item;
    onClick: () => void;
}

const KanbanCard = ({ item, onClick }: KanbanCardProps) => {
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
                
                <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: '4px' }}>
                        {item.updates && item.updates.length > 0 && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: 'hsl(var(--color-text-tertiary))' }}>
                                <MessageSquare size={12} />
                                <span>{item.updates.length}</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <style>{`
                .kanban-card {
                    background-color: white;
                    border: 1px solid hsl(var(--color-border));
                    border-radius: 6px;
                    padding: 12px;
                    cursor: pointer;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.05);
                    margin-bottom: 8px;
                    transition: box-shadow 0.2s, border-color 0.2s;
                }
                .kanban-card:hover {
                    box-shadow: 0 4px 8px rgba(0,0,0,0.08);
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
            `}</style>
        </div>
    );
};

interface KanbanColumnProps {
    id: string;
    label: string;
    color: string;
    items: Item[];
    onAddItem: () => void;
    onItemClick: (itemId: string) => void;
}

const KanbanColumn = ({ id, label, color, items, onAddItem, onItemClick }: KanbanColumnProps) => {
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
                        <KanbanCard key={item.id} item={item} onClick={() => onItemClick(item.id)} />
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
    const searchQuery = useBoardStore(state => state.searchQuery);
    const setActiveItem = useBoardStore(state => state.setActiveItem);

    const activeBoard = useMemo(() => boards.find(b => b.id === activeBoardId), [boards, activeBoardId]);
    
    // 1. Filtered Items
    const filteredItems = useMemo(() => {
        if (!activeBoard) return [];
        let items = [...activeBoard.items];

        // Search
        if (searchQuery) {
            items = items.filter(item => (item.title || '').toLowerCase().includes(searchQuery.toLowerCase()));
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
    }, [activeBoard, searchQuery]);
    
    // Determine the grouping column (null = group by the board's own Groups, the "Default (Groups)" mode)
    const groupingColumn = useMemo(() => {
        if (!activeBoard || !activeBoard.groupByColumnId) return null;
        return activeBoard.columns.find(c => c.id === activeBoard.groupByColumnId) || null;
    }, [activeBoard]);
    
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
            columnDefs = Array.from(uniqueValues).map(val => ({
                id: val,
                label: val, // In a real app we might look up user names here
                color: 'hsl(var(--color-bg-subtle))'
            }));
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


