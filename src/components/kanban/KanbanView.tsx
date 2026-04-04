import { useMemo } from 'react';
import {
    DndContext,
    closestCorners,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
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

        // Column Filters
        if (activeBoard.filters && activeBoard.filters.length > 0) {
            activeBoard.filters.forEach(filter => {
                if (filter.values && filter.values.length > 0) {
                    items = items.filter(item => {
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
    
    // Find the first status column
    const statusColumn = useMemo(() => activeBoard?.columns.find(c => c.type === 'status'), [activeBoard]);
    
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
        if (!statusColumn || !activeBoard) return [];
        
        const options = statusColumn.options || [];
        const itemsByStatus: Record<string, Item[]> = {};
        
        options.forEach(opt => {
            itemsByStatus[opt.id] = [];
        });
        itemsByStatus['no-status'] = [];

        filteredItems.forEach(item => {
            const statusId = item.values?.[statusColumn.id];
            if (statusId && itemsByStatus[statusId]) {
                itemsByStatus[statusId].push(item);
            } else {
                itemsByStatus['no-status'].push(item);
            }
        });

        const availableColumns = options.map(opt => ({
            id: opt.id,
            label: opt.label,
            color: opt.color,
            items: itemsByStatus[opt.id]
        }));

        if (itemsByStatus['no-status'].length > 0) {
            availableColumns.unshift({
                id: 'no-status',
                label: 'No Status',
                color: 'hsl(var(--color-text-tertiary))',
                items: itemsByStatus['no-status']
            });
        }

        return availableColumns;
    }, [statusColumn, activeBoard, filteredItems]);

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || !activeBoard || !statusColumn) return;

        const activeId = active.id as string;
        const activeItem = activeBoard.items.find(i => i.id === activeId);
        if (!activeItem) return;

        const overData = over.data.current;
        if (overData?.type === 'column') {
            const newStatusId = overData.statusId === 'no-status' ? null : overData.statusId;
            if (activeItem.values?.[statusColumn.id] !== newStatusId) {
                updateItemValue(activeId, statusColumn.id, newStatusId);
            }
        } else if (overData?.type === 'item') {
            const overItem = overData.item as Item;
            const newStatusId = overItem.values?.[statusColumn.id] || null;
            if (activeItem.values?.[statusColumn.id] !== newStatusId) {
                updateItemValue(activeId, statusColumn.id, newStatusId);
            }
        }
    };

    if (!statusColumn || !activeBoard) {
        return (
            <div style={{ padding: '40px', textAlign: 'center', color: 'hsl(var(--color-text-tertiary))' }}>
                <p>No status column found for this board. Kanban view requires a status column.</p>
            </div>
        );
    }

    return (
        <div className="kanban-view-container">
            <DndContext
                sensors={sensors}
                collisionDetection={closestCorners}
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
                                const firstGroup = activeBoard.groups[0];
                                if (firstGroup) {
                                    addItem("New Item", firstGroup.id);
                                }
                            }}
                        />
                    ))}
                </div>
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

