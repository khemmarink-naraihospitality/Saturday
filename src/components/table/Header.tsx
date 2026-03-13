import React, { useMemo } from 'react';
import { Plus, MoreHorizontal, Eye, EyeOff } from 'lucide-react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import type { Column } from '../../types';
import { useBoardStore } from '../../store/useBoardStore';
import { usePermission } from '../../hooks/usePermission';
import { AddColumnMenu } from './AddColumnMenu';
import { ColumnMenu } from './ColumnMenu';
import { FilterMenu } from './FilterMenu';
import { ConfirmModal } from '../ui/ConfirmModal';

const ShowHiddenState = () => {
    const showHiddenItems = useBoardStore(state => state.showHiddenItems);
    return showHiddenItems ? <Eye size={14} color="hsl(var(--color-brand-primary))" /> : <EyeOff size={14} />;
};

// Sortable Header Cell Component
const SortableHeaderCell = ({
    col,
    canManage,
    editingColId,
    activeMenuColId,
    activeSort,
    activeFilters,
    startEditing,
    openMenu,
    handleResizeStart,
    // input props
    editValue,
    setEditValue,
    saveTitle,
    handleKeyDown
}: any) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: col.id, disabled: editingColId === col.id || !canManage });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        width: `${col.width || 150}px`,
        justifyContent: 'space-between',
        position: 'relative' as const,
        cursor: (editingColId === col.id || !canManage) ? 'default' : 'grab',
        opacity: isDragging ? 0.4 : 1,
        backgroundColor: isDragging ? 'hsl(var(--color-bg-subtle))' : 'transparent'
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
            className="table-cell table-header-cell"
        >
            {editingColId === col.id ? (
                <input
                    autoFocus
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={saveTitle}
                    onKeyDown={handleKeyDown}
                    className="cell-input"
                    onMouseDown={(e) => e.stopPropagation()} // Prevent drag start on input
                    style={{ fontWeight: 500 }}
                />
            ) : (
                <span
                    onDoubleClick={() => {
                        if (canManage) startEditing(col);
                    }}
                    title={canManage ? "Double click to rename" : "Read only"}
                    style={{ cursor: canManage ? 'text' : 'default', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                    {col.title}
                </span>
            )}

            {/* Sort Indicator */}
            {activeSort?.columnId === col.id && (
                <div style={{ marginRight: '4px', color: '#0073ea', fontSize: '10px' }}>
                    {activeSort.direction === 'asc' ? '▲' : '▼'}
                </div>
            )}

            {/* Filter Indicator */}
            {activeFilters.some((f: any) => f.columnId === col.id) && (
                <div style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    backgroundColor: '#0073ea',
                    marginRight: 4
                }} />
            )}

            {editingColId !== col.id && (
                <button
                    onClick={(e) => openMenu(e, col.id)}
                    className="icon-btn"
                    style={{ opacity: activeMenuColId === col.id ? 1 : 0.5 }}
                    title="Column Actions"
                    onMouseDown={(e) => e.stopPropagation()} // Prevent drag
                >
                    <MoreHorizontal size={16} />
                </button>
            )}

            {/* Resize Handle - Needs stopPropagation */}
            {canManage && (
                <div
                    onMouseDown={(e) => handleResizeStart(e, col.id, col.width || 150)}
                    style={{
                        position: 'absolute',
                        right: 0,
                        top: 0,
                        bottom: 0,
                        width: '4px',
                        cursor: 'col-resize',
                        zIndex: 10,
                    }}
                    className="resize-handle"
                />
            )}
        </div>
    );
};

export const Header = ({ columns, groupColor }: { columns: Column[], groupColor?: string }) => {
    const addColumn = useBoardStore(state => state.addColumn);
    const deleteColumn = useBoardStore(state => state.deleteColumn);
    const updateColumnTitle = useBoardStore(state => state.updateColumnTitle);
    const moveColumn = useBoardStore(state => state.moveColumn);
    const duplicateColumn = useBoardStore(state => state.duplicateColumn);
    const { can } = usePermission();

    // Sort/Filter
    const setColumnSort = useBoardStore(state => state.setColumnSort);
    const setColumnFilter = useBoardStore(state => state.setColumnFilter);

    // Active Board Info
    const activeBoard = useBoardStore(state => state.boards.find(b => b.id === state.activeBoardId));
    const activeSort = activeBoard?.sort;
    const items = activeBoard?.items || [];
    const activeFilters = activeBoard?.filters || [];

    const [editingColId, setEditingColId] = React.useState<string | null>(null);
    const [editValue, setEditValue] = React.useState('');

    // Menu State
    const [activeMenuColId, setActiveMenuColId] = React.useState<string | null>(null);
    const [activeFilterColId, setActiveFilterColId] = React.useState<string | null>(null);
    const [menuPos, setMenuPos] = React.useState<{ top: number, left: number } | null>(null);
    const [confirmDeleteColId, setConfirmDeleteColId] = React.useState<string | null>(null);
    const [showAddMenu, setShowAddMenu] = React.useState(false);
    const addBtnRef = React.useRef<HTMLButtonElement>(null);

    const [insertColIndex, setInsertColIndex] = React.useState<number | null>(null);
    const [addMenuPos, setAddMenuPos] = React.useState<{ top: number, bottom: number, left: number } | null>(null);

    // Dnd Sensors
    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 5, // 5px movement required for drag
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (active.id !== over?.id) {
            const oldIndex = columns.findIndex((c) => c.id === active.id);
            const newIndex = columns.findIndex((c) => c.id === over?.id);
            if (oldIndex !== -1 && newIndex !== -1) {
                moveColumn(oldIndex, newIndex);
            }
        }
    };

    const startEditing = (col: Column) => {
        setEditingColId(col.id);
        setEditValue(col.title);
    };

    const saveTitle = () => {
        if (editingColId && editValue.trim()) {
            updateColumnTitle(editingColId, editValue.trim());
        }
        setEditingColId(null);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') saveTitle();
        if (e.key === 'Escape') setEditingColId(null);
    };

    const handleAddColumn = (type: any) => {
        const typeMap: Record<string, string> = {
            'text': 'Text',
            'status': 'Status',
            'date': 'Date',
            'number': 'Numbers',
            'people': 'Person',
            'checkbox': 'Check',
            'timeline': 'Timeline',
            'files': 'Files',
            'link': 'Link',
            'dropdown': 'Dropdown'
        };
        const newTitle = typeMap[type] || "New Column";
        addColumn(newTitle, type === 'people' ? 'text' : type, insertColIndex !== null ? insertColIndex : undefined);
        setShowAddMenu(false);
        setInsertColIndex(null);
        setAddMenuPos(null);
    };

    const updateBoardItemColumnTitle = useBoardStore(state => state.updateBoardItemColumnTitle);
    const updateBoardItemColumnWidth = useBoardStore(state => state.updateBoardItemColumnWidth);

    const itemColumnTitle = useBoardStore(state => {
        const board = state.boards.find(b => b.id === state.activeBoardId);
        return board?.itemColumnTitle || 'Item';
    });
    const itemColumnWidth = useBoardStore(state => {
        const board = state.boards.find(b => b.id === state.activeBoardId);
        return board?.itemColumnWidth || 500;
    });

    const [isEditingItemCol, setIsEditingItemCol] = React.useState(false);
    const [itemColValue, setItemColValue] = React.useState(itemColumnTitle);

    React.useEffect(() => {
        setItemColValue(itemColumnTitle);
    }, [itemColumnTitle]);

    const saveItemColTitle = () => {
        if (itemColValue.trim()) {
            updateBoardItemColumnTitle(itemColValue.trim());
        }
        setIsEditingItemCol(false);
    };

    const updateColumnWidth = useBoardStore(state => state.updateColumnWidth);
    const [_resizingColId, setResizingColId] = React.useState<string | null>(null);
    const startXRef = React.useRef(0);
    const startWidthRef = React.useRef(0);

    const handleResizeStart = (e: React.MouseEvent, colId: string, currentWidth: number, isItemCol = false) => {
        e.preventDefault();
        e.stopPropagation(); // Crucial for not triggering dnd
        setResizingColId(colId);
        startXRef.current = e.clientX;
        startWidthRef.current = currentWidth;

        const handleMouseMove = (moveEvent: MouseEvent) => {
            // ... (keep existing logic)
            const diff = moveEvent.clientX - startXRef.current;
            const newWidth = Math.max(100, startWidthRef.current + diff);
            if (isItemCol) {
                updateBoardItemColumnWidth(newWidth);
            } else {
                updateColumnWidth(colId, newWidth);
            }
        };

        const handleMouseUp = () => {
            setResizingColId(null);
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    const openMenu = (e: React.MouseEvent, colId: string) => {
        e.stopPropagation(); // Stop drag start
        e.preventDefault();
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        setMenuPos({ top: rect.bottom + 4, left: rect.left });
        setActiveMenuColId(colId);
    };

    const activeMenuColumn = activeMenuColId ? columns.find(c => c.id === activeMenuColId) : null;
    const activeFilterColumn = activeFilterColId ? columns.find(c => c.id === activeFilterColId) : null;

    const filterOptions = useMemo(() => {
        if (!activeFilterColumn) return [];
        // ... (keep existing logic)
        if (activeFilterColumn.type === 'status' || activeFilterColumn.type === 'dropdown') {
            return (activeFilterColumn.options || []).map((opt: any) => ({ ...opt, id: opt.label }));
        }
        if (activeFilterColumn.type === 'checkbox') {
            return [{ id: 'true', label: 'Checked', color: '#00c875' }, { id: 'false', label: 'Unchecked', color: '#e2445c' }];
        }
        const values = new Set<string>();
        items.forEach(i => {
            const val = i.values[activeFilterColumn.id];
            if (val) values.add(String(val));
        });
        return Array.from(values).sort().map(v => ({ id: v, label: v }));
    }, [activeFilterColumn, items]);

    const activeFilterValues = useMemo(() => {
        if (!activeFilterColumn) return [];
        const filter = activeFilters.find(f => f.columnId === activeFilterColumn.id);
        return filter?.values || [];
    }, [activeFilters, activeFilterColumn]);


    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
        >
                <div className="table-header-row" style={{
                    position: 'relative',
                    display: 'flex',
                    backgroundColor: 'hsl(var(--color-table-header-bg))',
                    borderBottom: '1px solid hsl(var(--color-border))',
                    boxSizing: 'border-box',
                    height: '36px',
                    alignItems: 'center'
                }}>
                {groupColor && (
                    <div style={{
                        position: 'absolute', left: 0, top: 0, bottom: 0, width: '6px',
                        backgroundColor: groupColor, zIndex: 65
                    }} />
                )}

                {/* Frozen First Column */}
                <div className="table-cell table-header-cell sticky-col" style={{
                    width: `${itemColumnWidth}px`,
                    position: 'sticky', left: 0, zIndex: 60,
                    backgroundColor: 'hsl(var(--color-table-header-bg))',
                    borderRight: '1px solid hsl(var(--color-border))',
                    paddingLeft: groupColor ? '14px' : '8px',
                    display: 'flex', alignItems: 'center', gap: '8px'
                }}>
                    {isEditingItemCol ? (
                        <input
                            autoFocus
                            value={itemColValue}
                            onChange={(e) => setItemColValue(e.target.value)}
                            onBlur={saveItemColTitle}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') saveItemColTitle();
                                if (e.key === 'Escape') { setItemColValue(itemColumnTitle); setIsEditingItemCol(false); }
                            }}
                            className="cell-input"
                            style={{ fontWeight: 500, padding: 0 }}
                        />
                    ) : (
                        <span
                            onDoubleClick={() => setIsEditingItemCol(true)}
                            title="Double click to rename"
                            style={{ cursor: 'text', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        >
                            {itemColumnTitle}
                        </span>
                    )}

                    <button
                        onClick={() => {
                            import('../../store/useBoardStore').then(({ useBoardStore }) => {
                                useBoardStore.getState().toggleShowHiddenItems();
                            });
                        }}
                        title="Show/Hide Hidden Items"
                        className="icon-btn"
                        style={{ opacity: 0.5, marginRight: '8px' }}
                    >
                        <ShowHiddenState />
                    </button>

                    {can('manage_columns') && (
                        <div
                            onMouseDown={(e) => handleResizeStart(e, 'item-col', itemColumnWidth, true)}
                            style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '4px', cursor: 'col-resize', zIndex: 10 }}
                            className="resize-handle"
                        />
                    )}
                </div>

                <SortableContext items={columns} strategy={horizontalListSortingStrategy}>
                    {columns.map((col, index) => (
                        <SortableHeaderCell
                            key={col.id}
                            col={col}
                            index={index}
                            canManage={can('manage_columns')}
                            editingColId={editingColId}
                            activeMenuColId={activeMenuColId}
                            activeSort={activeSort}
                            activeFilters={activeFilters}
                            startEditing={startEditing}
                            openMenu={openMenu}
                            handleResizeStart={handleResizeStart}
                            editValue={editValue}
                            setEditValue={setEditValue}
                            saveTitle={saveTitle}
                            handleKeyDown={handleKeyDown}
                        />
                    ))}
                </SortableContext>

                {/* Render Menu */}
                {activeMenuColId && menuPos && activeMenuColumn && (
                    <ColumnMenu
                        isOpen={true}
                        onClose={() => setActiveMenuColId(null)}
                        position={menuPos}
                        columnType={activeMenuColumn.type}
                        currentSort={activeSort?.columnId === activeMenuColId ? activeSort.direction : null}
                        onSort={(dir) => setColumnSort(activeMenuColId!, dir)}
                        onFilter={() => {
                            setActiveFilterColId(activeMenuColId);
                            setActiveMenuColId(null);
                        }}
                        onDuplicate={() => duplicateColumn(activeMenuColId!)}
                        onAddRight={() => {
                            const idx = columns.findIndex(c => c.id === activeMenuColId);
                            setInsertColIndex(idx + 1);
                            setAddMenuPos({ top: menuPos.top, bottom: menuPos.top, left: menuPos.left });
                            setShowAddMenu(true);
                            setActiveMenuColId(null);
                        }}
                        onRename={() => startEditing(activeMenuColumn)}
                        onDelete={() => setConfirmDeleteColId(activeMenuColId!)}
                    />
                )}

                {/* Filter Menu */}
                {activeFilterColId && menuPos && activeFilterColumn && (
                    <FilterMenu
                        isOpen={true}
                        onClose={() => setActiveFilterColId(null)}
                        position={menuPos}
                        options={filterOptions}
                        selectedValues={activeFilterValues}
                        onFilterChange={(values) => setColumnFilter(activeFilterColId, values)}
                        title={activeFilterColumn.title}
                    />
                )}

                {/* Add Column Button */}
                {can('manage_columns') && (
                    <div className="table-cell table-header-cell" style={{ width: '50px', justifyContent: 'center', padding: 0, position: 'relative' }}>
                        <button
                            ref={addBtnRef}
                            className="icon-btn"
                            onClick={() => {
                                setShowAddMenu(true);
                                setInsertColIndex(null); // Default to end
                                setAddMenuPos(null); // Use button ref
                            }}
                            title="Add Column"
                            style={{ width: '100%', height: '100%', borderRadius: 0 }}
                        >
                            <Plus size={16} />
                        </button>
                        {showAddMenu && (
                            <AddColumnMenu
                                onSelect={handleAddColumn}
                                onClose={() => {
                                    setShowAddMenu(false);
                                    setInsertColIndex(null);
                                    setAddMenuPos(null);
                                }}
                                position={addMenuPos || (addBtnRef.current ? {
                                    top: addBtnRef.current.getBoundingClientRect().top,
                                    bottom: addBtnRef.current.getBoundingClientRect().bottom,
                                    left: addBtnRef.current.getBoundingClientRect().left
                                } : { top: 0, bottom: 0, left: 0 })}
                            />
                        )}
                    </div>
                )}

                <ConfirmModal
                    isOpen={!!confirmDeleteColId}
                    title="Delete Column"
                    message="Are you sure you want to delete this column?"
                    onConfirm={() => {
                        if (confirmDeleteColId) deleteColumn(confirmDeleteColId);
                        setConfirmDeleteColId(null);
                    }}
                    onCancel={() => setConfirmDeleteColId(null)}
                    confirmText="Delete Column"
                    variant="danger"
                />

            </div>
        </DndContext>
    );
};


