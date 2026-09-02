import React, { useMemo, useRef, useState } from 'react';
import { useBoardStore } from '../../store/useBoardStore';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths, startOfYear, endOfYear, eachMonthOfInterval, eachYearOfInterval, isSameMonth, isSameYear, addYears, subYears, addDays, parseISO } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { usePermission } from '../../hooks/usePermission';
import { useToast } from '../../hooks/useToast';
import { ToastContainer } from '../ui/Toast';
import { DependencyOverlay } from './DependencyOverlay';
import { NAME_COL_WIDTH, ROW_INNER_HEIGHT, ROW_HEIGHT, BAR_V_INSET, type BarGeometry } from './timelineGeometry';

export const TimelineView = () => {
    const activeBoardId = useBoardStore(state => state.activeBoardId);
    const activeBoard = useBoardStore(state => state.boards.find(b => b.id === activeBoardId));
    const setActiveItem = useBoardStore(state => state.setActiveItem);
    const updateItemValue = useBoardStore(state => state.updateItemValue);
    const searchQuery = useBoardStore(state => state.searchQuery);
    const showHiddenItems = useBoardStore(state => state.showHiddenItems);

    // Navigation and View state
    const [viewDate, setViewDate] = useState(new Date());
    const [viewType, setViewType] = useState<'day' | 'month' | 'year'>('day');

    // Drag move state (Local state for better perf).
    // originalFrom/originalTo hold the RAW stored strings, so the commit can
    // re-emit them in the same "YYYY-MM-DD" shape every other reader expects.
    // rawPx accumulates the pointer delta and offsetDays is derived from the
    // total — rounding each mousemove instead loses sub-unit motion on slow drags.
    const [draggingItem, setDraggingItem] = useState<{
        id: string;
        colId: string;
        rawPx: number;
        offsetDays: number;
        originalFrom: string;
        originalTo: string;
    } | null>(null);

    // Drag-to-connect state for creating a dependency, in rows-wrapper coordinates.
    const [linkDraft, setLinkDraft] = useState<{ fromItemId: string; x: number; y: number } | null>(null);
    const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);
    const rowsRef = useRef<HTMLDivElement>(null);

    const { can } = usePermission();
    const canEdit = can('edit_items');
    const { toasts, showToast, removeToast } = useToast();

    const itemDependencies = useBoardStore(state => state.itemDependencies);
    const addItemDependency = useBoardStore(state => state.addItemDependency);
    const removeItemDependency = useBoardStore(state => state.removeItemDependency);

    const timeGrid = useMemo(() => {
        if (viewType === 'day') {
            const start = startOfMonth(viewDate);
            const end = endOfMonth(viewDate);
            return eachDayOfInterval({ start, end });
        } else if (viewType === 'month') {
            const start = startOfYear(viewDate);
            const end = endOfYear(viewDate);
            return eachMonthOfInterval({ start, end });
        } else {
            const start = subYears(viewDate, 2);
            const end = addYears(viewDate, 2);
            return eachYearOfInterval({ start, end });
        }
    }, [viewDate, viewType]);

    const unitWidth = viewType === 'day' ? 40 : (viewType === 'month' ? 80 : 120);

    // Apply Filter/Sort/Search logic
    const items = useMemo(() => {
        if (!activeBoard) return [];
        let filtered = activeBoard.groups.flatMap(g => g.items.map(i => ({ ...i, groupColor: g.color })));

        // 1. Search Query
        if (searchQuery) {
            filtered = filtered.filter(i => (i.title || '').toLowerCase().includes(searchQuery.toLowerCase()));
        }

        // 2. Hidden Items
        if (!showHiddenItems) {
            filtered = filtered.filter(i => !i.isHidden);
        }

        // 3. Board Filters and Group Filter
        if (activeBoard.filters && activeBoard.filters.length > 0) {
            activeBoard.filters.forEach(filter => {
                if (filter.values && filter.values.length > 0) {
                    filtered = filtered.filter(item => {
                        if (filter.columnId === '__group__') {
                            return filter.values.includes(item.groupId);
                        }

                        const val = item.values[filter.columnId];
                        return Array.isArray(val) ? val.some(v => filter.values.includes(v)) : filter.values.includes(val);
                    });
                }
            });
        }

        // 4. Sort
        if (activeBoard.sort) {
            const { columnId, direction } = activeBoard.sort;
            const col = activeBoard.columns.find(c => c.id === columnId);
            if (col && direction) {
                filtered.sort((a, b) => {
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

        // 5. Group by
        if (activeBoard.groupByColumnId) {
            const groupCol = activeBoard.columns.find(c => c.id === activeBoard.groupByColumnId);
            if (groupCol) {
                filtered.sort((a, b) => {
                    const valA = String(a.values[groupCol.id] || '');
                    const valB = String(b.values[groupCol.id] || '');
                    return valA.localeCompare(valB);
                });
            }
        }

        return filtered;
    }, [activeBoard, searchQuery, showHiddenItems]);

    /**
     * Where every bar sits, computed once and shared by the bars themselves and
     * by the dependency arrows — if the two derived positions independently they
     * could drift apart. Items whose dates fall entirely outside the visible
     * window get no entry (and so no arrows).
     */
    const barGeometry = useMemo(() => {
        const map = new Map<string, BarGeometry>();
        if (!activeBoard) return map;

        const cols = activeBoard.columns.filter(c => c.type === 'timeline' || c.type === 'date' || c.type === 'due_date');

        items.forEach((item, rowIndex) => {
            let startDate: Date | null = null;
            let endDate: Date | null = null;
            let colId = '';

            for (const col of cols) {
                const val = item.values[col.id];
                if (!val) continue;
                if (col.type === 'timeline') {
                    if (val.from) startDate = new Date(val.from);
                    if (val.to) endDate = new Date(val.to);
                    colId = col.id;
                } else {
                    startDate = new Date(val);
                    endDate = new Date(val);
                    colId = col.id;
                }
                if (startDate) break;
            }

            if (!startDate || !endDate) return;

            const startIndex = timeGrid.findIndex(u => {
                if (viewType === 'day') return isSameDay(u, startDate!);
                if (viewType === 'month') return isSameMonth(u, startDate!);
                return isSameYear(u, startDate!);
            });
            const endIndex = timeGrid.findIndex(u => {
                if (viewType === 'day') return isSameDay(u, endDate!);
                if (viewType === 'month') return isSameMonth(u, endDate!);
                return isSameYear(u, endDate!);
            });

            if (startIndex === -1 && endDate < timeGrid[0]) return;
            if (endIndex === -1 && startDate > timeGrid[timeGrid.length - 1]) return;

            const clampedStart = startIndex === -1 ? 0 : startIndex;
            const effectiveEndIndex = endIndex === -1 ? timeGrid.length - 1 : endIndex;
            const left = clampedStart * unitWidth;
            const width = Math.max(unitWidth, (effectiveEndIndex - clampedStart + 1) * unitWidth);

            map.set(item.id, { rowIndex, left, width, colId });
        });

        return map;
    }, [activeBoard, items, timeGrid, unitWidth, viewType]);

    const boardDependencies = useMemo(
        () => itemDependencies.filter(d => d.boardId === activeBoardId),
        [itemDependencies, activeBoardId]
    );

    if (!activeBoard) return null;

    const navBtnStyle: React.CSSProperties = {
        height: '32px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '4px',
        border: '1px solid hsl(var(--color-border))',
        background: 'white',
        cursor: 'pointer',
        color: 'hsl(var(--color-text-secondary))',
        padding: '0 8px'
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: 'white' }}>
            {/* Timeline Header (Navigator) */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 32px',
                borderBottom: '1px solid hsl(var(--color-border))'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <h3 style={{ fontSize: '18px', fontWeight: 600, margin: 0 }}>
                        {viewType === 'day' ? format(viewDate, 'MMMM yyyy') : 
                         viewType === 'month' ? format(viewDate, 'yyyy') : 
                         `${format(subYears(viewDate, 2), 'yyyy')} - ${format(addYears(viewDate, 2), 'yyyy')}`}
                    </h3>
                    <div style={{ display: 'flex', gap: '4px' }}>
                        <button 
                            onClick={() => {
                                if (viewType === 'day') setViewDate(subMonths(viewDate, 1));
                                else if (viewType === 'month') setViewDate(subYears(viewDate, 1));
                                else setViewDate(subYears(viewDate, 5));
                            }}
                            style={navBtnStyle}
                        >
                            <ChevronLeft size={18} />
                        </button>
                        <button 
                            onClick={() => {
                                if (viewType === 'day') setViewDate(addMonths(viewDate, 1));
                                else if (viewType === 'month') setViewDate(addYears(viewDate, 1));
                                else setViewDate(addYears(viewDate, 5));
                            }}
                            style={navBtnStyle}
                        >
                            <ChevronRight size={18} />
                        </button>
                    </div>
                    <button 
                        onClick={() => setViewDate(new Date())}
                        style={{ ...navBtnStyle, fontSize: '14px', padding: '0 12px' }}
                    >
                        Today
                    </button>

                    <div style={{ display: 'flex', backgroundColor: '#f5f6f8', borderRadius: '6px', padding: '2px', marginLeft: '16px' }}>
                        {(['day', 'month', 'year'] as const).map(type => (
                            <button
                                key={type}
                                onClick={() => setViewType(type)}
                                style={{
                                    border: 'none',
                                    padding: '4px 12px',
                                    borderRadius: '4px',
                                    fontSize: '13px',
                                    fontWeight: viewType === type ? 600 : 400,
                                    backgroundColor: viewType === type ? 'white' : 'transparent',
                                    color: viewType === type ? 'hsl(var(--color-text-primary))' : 'hsl(var(--color-text-tertiary))',
                                    cursor: 'pointer',
                                    boxShadow: viewType === type ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                    textTransform: 'capitalize'
                                }}
                            >
                                {type}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Timeline Grid */}
            <div style={{ flex: 1, overflow: 'auto' }}>
                <div style={{ display: 'flex', minWidth: 'max-content', minHeight: '100%', flexDirection: 'column', position: 'relative' }}>
                    
                    {/* Calendar Day Headers */}
                    <div style={{ display: 'flex', borderBottom: '1px solid hsl(var(--color-border))', position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'white' }}>
                        <div style={{ width: '200px', flexShrink: 0, borderRight: '1px solid hsl(var(--color-border))', padding: '12px 16px', fontWeight: 600, fontSize: '13px' }}>Item Name</div>
                        {timeGrid.map(unit => {
                            const isCurrent = viewType === 'day' ? isSameDay(unit, new Date()) : 
                                             viewType === 'month' ? isSameMonth(unit, new Date()) : 
                                             isSameYear(unit, new Date());
                            return (
                                <div key={unit.toISOString()} style={{
                                    width: `${unitWidth}px`,
                                    textAlign: 'center',
                                    padding: '12px 0',
                                    fontSize: '12px',
                                    borderRight: '1px solid hsl(var(--color-border-subtle, #eee))',
                                    color: isCurrent ? 'hsl(var(--color-brand-primary))' : 'inherit',
                                    fontWeight: isCurrent ? 700 : 400
                                }}>
                                    <div>
                                        {viewType === 'day' ? format(unit, 'd') : 
                                         viewType === 'month' ? format(unit, 'MMM') : 
                                         format(unit, 'yyyy')}
                                    </div>
                                    {viewType === 'day' && <div style={{ fontSize: '10px', opacity: 0.5 }}>{format(unit, 'EEE')}</div>}
                                    {viewType === 'month' && <div style={{ fontSize: '10px', opacity: 0.5 }}>{format(unit, 'yyyy')}</div>}
                                </div>
                            );
                        })}
                    </div>

                    {/* Today Indicator Line (Overlay) */}
                    {(() => {
                        const today = new Date();
                        const startIndex = timeGrid.findIndex(u => {
                            if (viewType === 'day') return isSameDay(u, today);
                            if (viewType === 'month') return isSameMonth(u, today);
                            return isSameYear(u, today);
                        });
                        
                        if (startIndex === -1) return null;
                        
                        const pos = startIndex * unitWidth + (viewType === 'day' ? 0 : 
                            (viewType === 'month' ? (today.getDate() / endOfMonth(today).getDate()) * unitWidth : 
                            (today.getMonth() / 12) * unitWidth));
                        
                        return (
                            <div style={{
                                position: 'absolute',
                                left: `${200 + pos}px`,
                                top: 0,
                                bottom: 0,
                                width: '2px',
                                backgroundColor: '#f00',
                                zIndex: 8,
                                pointerEvents: 'none',
                                opacity: 0.6
                            }} />
                        );
                    })()}

                    <div
                        ref={rowsRef}
                        style={{ flex: 1, position: 'relative' }}
                        onMouseMove={(e) => {
                            if (!linkDraft || !rowsRef.current) return;
                            const rect = rowsRef.current.getBoundingClientRect();
                            setLinkDraft({ ...linkDraft, x: e.clientX - rect.left, y: e.clientY - rect.top });
                        }}
                        onMouseUp={async () => {
                            if (!linkDraft) return;
                            const draft = linkDraft;
                            setLinkDraft(null);
                            const targetIndex = Math.floor(draft.y / ROW_HEIGHT);
                            const target = items[targetIndex];
                            if (!target || target.id === draft.fromItemId) return;
                            const result = await addItemDependency(draft.fromItemId, target.id);
                            if (!result.success) showToast(result.error || 'Could not link these items', 'error');
                        }}
                        onMouseLeave={() => setLinkDraft(null)}
                    >
                        {items.map(item => {
                            const geometry = barGeometry.get(item.id);

                            return (
                                <div
                                    key={item.id}
                                    onMouseEnter={() => setHoveredItemId(item.id)}
                                    onMouseLeave={() => setHoveredItemId(prev => (prev === item.id ? null : prev))}
                                    style={{ display: 'flex', borderBottom: '1px solid #f5f5f5', height: `${ROW_INNER_HEIGHT}px`, alignItems: 'center' }}
                                >
                                    <div
                                        onClick={() => setActiveItem(item.id)}
                                        style={{ width: `${NAME_COL_WIDTH}px`, flexShrink: 0, borderRight: '1px solid #f5f5f5', padding: '8px 16px', fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer', color: 'hsl(var(--color-brand-primary))', fontWeight: 500 }}
                                    >
                                        {item.title}
                                    </div>
                                    <div style={{ display: 'flex', position: 'relative', flex: 1 }}>
                                        {timeGrid.map(unit => (
                                            <div key={unit.toISOString()} style={{ width: `${unitWidth}px`, height: `${ROW_INNER_HEIGHT}px`, borderRight: '1px solid #f5f5f5', flexShrink: 0 }} />
                                        ))}

                                        {geometry && (
                                            <>
                                                <div
                                                    onClick={() => setActiveItem(item.id)}
                                                    onMouseDown={(e) => {
                                                        if (viewType !== 'day' || !canEdit) return;
                                                        const raw = item.values[geometry.colId];
                                                        const col = activeBoard.columns.find(c => c.id === geometry.colId);
                                                        // Carry the stored strings through untouched so the
                                                        // commit can re-emit them in the same format.
                                                        const from = col?.type === 'timeline' ? raw?.from : raw;
                                                        const to = col?.type === 'timeline' ? (raw?.to ?? raw?.from) : raw;
                                                        if (!from || !to) return;
                                                        e.stopPropagation();
                                                        setDraggingItem({
                                                            id: item.id,
                                                            colId: geometry.colId,
                                                            rawPx: 0,
                                                            offsetDays: 0,
                                                            originalFrom: from,
                                                            originalTo: to
                                                        });
                                                    }}
                                                    style={{
                                                        position: 'absolute',
                                                        top: `${BAR_V_INSET}px`,
                                                        bottom: `${BAR_V_INSET}px`,
                                                        left: `${geometry.left}px`,
                                                        width: `${geometry.width}px`,
                                                        backgroundColor: item.groupColor || 'hsl(var(--color-brand-primary))',
                                                        borderRadius: '12px',
                                                        opacity: draggingItem?.id === item.id ? 0.5 : 0.8,
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        color: 'white',
                                                        fontSize: '11px',
                                                        fontWeight: 500,
                                                        padding: '0 8px',
                                                        whiteSpace: 'nowrap',
                                                        overflow: 'hidden',
                                                        zIndex: 5,
                                                        cursor: viewType === 'day' && canEdit ? 'move' : 'pointer',
                                                        transition: 'opacity 0.2s',
                                                        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                                                    }}
                                                >
                                                    {item.title}
                                                </div>

                                                {/* Connector dot — drag from here onto another row to
                                                    make that row depend on this one. */}
                                                {canEdit && (hoveredItemId === item.id || linkDraft?.fromItemId === item.id) && (
                                                    <div
                                                        title="Drag to the item that should start after this one"
                                                        onMouseDown={(e) => {
                                                            e.stopPropagation(); // don't start a bar move
                                                            if (!rowsRef.current) return;
                                                            const rect = rowsRef.current.getBoundingClientRect();
                                                            setLinkDraft({
                                                                fromItemId: item.id,
                                                                x: e.clientX - rect.left,
                                                                y: e.clientY - rect.top
                                                            });
                                                        }}
                                                        style={{
                                                            position: 'absolute',
                                                            left: `${geometry.left + geometry.width - 4}px`,
                                                            top: '50%',
                                                            transform: 'translateY(-50%)',
                                                            width: '10px',
                                                            height: '10px',
                                                            borderRadius: '50%',
                                                            backgroundColor: 'white',
                                                            border: '2px solid #5b5b7b',
                                                            cursor: 'crosshair',
                                                            zIndex: 7
                                                        }}
                                                    />
                                                )}
                                            </>
                                        )}
                                    </div>
                                </div>
                            );
                        })}

                        <DependencyOverlay
                            dependencies={boardDependencies}
                            barGeometry={barGeometry}
                            rowCount={items.length}
                            linkDraft={linkDraft}
                            canEdit={canEdit}
                            onRemove={removeItemDependency}
                        />
                    </div>
                </div>
            </div>

            {draggingItem && (
                <div 
                    onMouseMove={(e) => {
                        // Accumulate raw pixels and derive the day offset from the
                        // running total, so slow drags don't lose sub-unit motion.
                        setDraggingItem(prev => {
                            if (!prev) return null;
                            const rawPx = prev.rawPx + e.movementX;
                            return { ...prev, rawPx, offsetDays: Math.round(rawPx / unitWidth) };
                        });
                    }}
                    onMouseUp={() => {
                        if (draggingItem.offsetDays !== 0) {
                            // Emit "YYYY-MM-DD": every reader (TimelineCell, DateCell,
                            // the due-date reminder SQL) parses that shape, and an ISO
                            // timestamp here silently breaks all three.
                            const shift = (stored: string) =>
                                format(addDays(parseISO(stored), draggingItem.offsetDays), 'yyyy-MM-dd');
                            const col = activeBoard.columns.find(c => c.id === draggingItem.colId);
                            if (col?.type === 'timeline') {
                                const existing = activeBoard.items.find(i => i.id === draggingItem.id)?.values?.[draggingItem.colId];
                                updateItemValue(draggingItem.id, draggingItem.colId, {
                                    ...existing,
                                    from: shift(draggingItem.originalFrom),
                                    to: shift(draggingItem.originalTo)
                                });
                            } else {
                                updateItemValue(draggingItem.id, draggingItem.colId, shift(draggingItem.originalFrom));
                            }
                        }
                        setDraggingItem(null);
                    }}
                    onMouseLeave={() => setDraggingItem(null)}
                    style={{ position: 'fixed', inset: 0, zIndex: 10000, cursor: 'move' }}
                />
            )}

            <ToastContainer toasts={toasts} onRemove={removeToast} />
        </div>
    );
};


