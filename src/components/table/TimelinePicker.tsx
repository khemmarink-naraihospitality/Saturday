import { format, setMonth, setYear } from 'date-fns';
import { DayPicker } from 'react-day-picker';
import type { DateRange } from 'react-day-picker';
import { useRef, useEffect, useState, useMemo } from 'react';
import 'react-day-picker/style.css';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Plus, X, ArrowRight } from 'lucide-react';
import { useBoardStore } from '../../store/useBoardStore';
import { wouldCreateCycle } from '../../lib/dependencyUtils';

interface TimelinePickerProps {
    itemId: string;
    dateRange: { from: string; to: string } | null;
    onSelect: (range: { from: string; to: string } | null) => void;
    onClose: () => void;
    position: { top: number, left: number };
}

export const TimelinePicker = ({ itemId, dateRange, onSelect, onClose, position }: TimelinePickerProps) => {
    const pickerRef = useRef<HTMLDivElement>(null);
    const [style, setStyle] = useState({ top: position.top, left: position.left });

    // Finish to Start — lets you point this item at whatever should start once
    // it finishes, right from the same popup where its own dates are set.
    const activeBoardId = useBoardStore(state => state.activeBoardId);
    const board = useBoardStore(state => state.boards.find(b => b.id === activeBoardId));
    const itemDependencies = useBoardStore(state => state.itemDependencies);
    const addItemDependency = useBoardStore(state => state.addItemDependency);
    const removeItemDependency = useBoardStore(state => state.removeItemDependency);

    const [isAddingSuccessor, setIsAddingSuccessor] = useState(false);
    const [successorQuery, setSuccessorQuery] = useState('');
    const [successorError, setSuccessorError] = useState<string | null>(null);
    const successorBoxRef = useRef<HTMLDivElement>(null);

    const boardDeps = useMemo(
        () => itemDependencies.filter(d => d.boardId === activeBoardId),
        [itemDependencies, activeBoardId]
    );
    const successors = useMemo(
        () => boardDeps.filter(d => d.predecessorItemId === itemId),
        [boardDeps, itemId]
    );
    const successorCandidates = useMemo(() => {
        if (!board) return [];
        const existing = new Set(successors.map(d => d.successorItemId));
        const q = successorQuery.trim().toLowerCase();
        return board.items
            .filter(i =>
                i.id !== itemId &&
                !i.parentId &&
                !existing.has(i.id) &&
                !wouldCreateCycle(boardDeps, itemId, i.id) &&
                (!q || (i.title || '').toLowerCase().includes(q))
            )
            .slice(0, 30);
    }, [board, boardDeps, successors, itemId, successorQuery]);

    useEffect(() => {
        if (!isAddingSuccessor) return;
        const onClickOutside = (e: MouseEvent) => {
            if (successorBoxRef.current && !successorBoxRef.current.contains(e.target as Node)) {
                setIsAddingSuccessor(false);
                setSuccessorQuery('');
                setSuccessorError(null);
            }
        };
        document.addEventListener('mousedown', onClickOutside);
        return () => document.removeEventListener('mousedown', onClickOutside);
    }, [isAddingSuccessor]);

    const handlePickSuccessor = async (successorId: string) => {
        setSuccessorError(null);
        const result = await addItemDependency(itemId, successorId);
        if (!result.success) {
            setSuccessorError(result.error || 'Could not link these items');
            return;
        }
        setIsAddingSuccessor(false);
        setSuccessorQuery('');
    };

    // Parse initial range
    const initialRange: DateRange | undefined = dateRange?.from && dateRange?.to
        ? { from: new Date(dateRange.from), to: new Date(dateRange.to) }
        : undefined;

    const [selectedRange, setSelectedRange] = useState<DateRange | undefined>(initialRange);

    // View State
    const [view, setView] = useState<'calendar' | 'years' | 'months'>('calendar');
    const [month, setMonthInPicker] = useState<Date>(initialRange?.from || new Date());

    useEffect(() => {
        if (pickerRef.current) {
            const rect = pickerRef.current.getBoundingClientRect();
            let newTop = position.top;
            let newLeft = position.left;

            if (newTop + rect.height + 16 > window.innerHeight) {
                newTop = position.top - rect.height - 40;
            }
            if (newLeft + rect.width + 16 > window.innerWidth) {
                newLeft = window.innerWidth - rect.width - 16;
            }

            if (newTop < 16) newTop = 16;
            if (newLeft < 16) newLeft = 16;

            setStyle({ top: newTop, left: newLeft });
        }
    }, [position, view, month, successors.length, isAddingSuccessor]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    const handleSelect = (range: DateRange | undefined) => {
        setSelectedRange(range);

        if (range?.from && range?.to) {
            // Adjust for timezone to ensure we store YYYY-MM-DD correctly
            const formatDate = (d: Date) => {
                const offset = d.getTimezoneOffset();
                const localDate = new Date(d.getTime() - (offset * 60 * 1000));
                return localDate.toISOString().split('T')[0];
            };

            onSelect({
                from: formatDate(range.from),
                to: formatDate(range.to)
            });
        } else if (!range) {
            onSelect(null);
        }
    };

    // Calendar Navigation
    const handlePrevMonth = () => setMonthInPicker(prev => new Date(prev.getFullYear(), prev.getMonth() - 1));
    const handleNextMonth = () => setMonthInPicker(prev => new Date(prev.getFullYear(), prev.getMonth() + 1));

    const years = Array.from({ length: 201 }, (_, i) => 1900 + i);
    const months = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];

    return createPortal(
        <div
            ref={pickerRef}
            style={{
                position: 'fixed',
                top: style.top,
                left: style.left,
                backgroundColor: 'hsl(var(--color-bg-surface))',
                borderRadius: '8px',
                boxShadow: '0 6px 24px rgba(0,0,0,0.12)',
                border: '1px solid hsl(var(--color-border))',
                zIndex: 9999,
                width: '320px',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                fontFamily: 'Inter, sans-serif',
                color: 'hsl(var(--color-text-primary))'
            }}
            onClick={(e) => e.stopPropagation()}
        >
            {/* Manual Date Inputs */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '11px', color: 'hsl(var(--color-text-secondary))', fontWeight: 500, display: 'block', marginBottom: '4px' }}>From</label>
                    <input
                        type="date"
                        value={selectedRange?.from ? format(selectedRange.from, 'yyyy-MM-dd') : ''}
                        onChange={(e) => {
                            const d = e.target.valueAsDate; // UTC Midnight
                            if (d) {
                                // Fix timezone offset for display/store
                                const offset = d.getTimezoneOffset();
                                const localDate = new Date(d.getTime() + (offset * 60 * 1000));
                                handleSelect({ ...selectedRange, from: localDate });
                            } else {
                                handleSelect({ ...selectedRange, from: undefined });
                            }
                        }}
                        style={{
                            width: '100%',
                            padding: '6px 8px',
                            borderRadius: '4px',
                            border: '1px solid #c3c6d4',
                            fontSize: '13px',
                            color: '#323338',
                            outline: 'none',
                            fontFamily: 'inherit'
                        }}
                    />
                </div>
                <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '11px', color: 'hsl(var(--color-text-secondary))', fontWeight: 500, display: 'block', marginBottom: '4px' }}>To</label>
                    <input
                        type="date"
                        min={selectedRange?.from ? format(selectedRange.from, 'yyyy-MM-dd') : undefined}
                        value={selectedRange?.to ? format(selectedRange.to, 'yyyy-MM-dd') : ''}
                        onChange={(e) => {
                            const d = e.target.valueAsDate;
                            if (d) {
                                const offset = d.getTimezoneOffset();
                                const localDate = new Date(d.getTime() + (offset * 60 * 1000));
                                handleSelect({ from: selectedRange?.from, to: localDate });
                            } else {
                                handleSelect({ from: selectedRange?.from, to: undefined });
                            }
                        }}
                        style={{
                            width: '100%',
                            padding: '6px 8px',
                            borderRadius: '4px',
                            border: '1px solid #c3c6d4',
                            fontSize: '13px',
                            color: '#323338',
                            outline: 'none',
                            fontFamily: 'inherit'
                        }}
                    />
                </div>
            </div>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <button onClick={handlePrevMonth} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', borderRadius: '4px', color: 'hsl(var(--color-text-secondary))' }} className="hover-bg"><ChevronLeft size={20} /></button>
                <div style={{ display: 'flex', gap: '4px' }}>
                    <button onClick={() => setView('months')} style={{ background: 'transparent', border: 'none', fontWeight: 600, cursor: 'pointer', color: 'hsl(var(--color-text-primary))' }}>{format(month, 'MMMM')}</button>
                    <button onClick={() => setView('years')} style={{ background: 'transparent', border: 'none', fontWeight: 600, cursor: 'pointer', color: 'hsl(var(--color-text-primary))' }}>{format(month, 'yyyy')}</button>
                </div>
                <button onClick={handleNextMonth} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', borderRadius: '4px', color: 'hsl(var(--color-text-secondary))' }} className="hover-bg"><ChevronRight size={20} /></button>
            </div>

            <style>{`
                .hover-bg:hover { background-color: hsl(var(--color-bg-surface-hover)) !important; }
                .rdp-nav { display: none; }
                .rdp-caption { display: none; } 
                .rdp-day_selected:not([disabled]) { 
                    background-color: hsl(var(--color-brand-primary)) !important; 
                    color: white;
                }
                .rdp-day_range_middle {
                    background-color: hsl(var(--color-brand-light)) !important;
                    color: hsl(var(--color-brand-primary)) !important;
                }
                .rdp-day:hover:not(.rdp-day_selected) { background-color: hsl(var(--color-bg-surface-hover)); }
                .rdp { margin: 0; --rdp-cell-size: 36px; } 
            `}</style>

            {view === 'calendar' && (
                <DayPicker
                    mode="range"
                    selected={selectedRange}
                    month={month}
                    onMonthChange={setMonthInPicker}
                    onSelect={handleSelect}
                    showOutsideDays
                />
            )}

            {/* Years View */}
            {view === 'years' && (
                <div style={{ height: '300px', overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', paddingRight: '4px' }}>
                    {years.map(year => (
                        <button
                            key={year}
                            onClick={() => {
                                setMonthInPicker(current => setYear(current, year));
                                setView('calendar');
                            }}
                            style={{
                                padding: '8px 4px',
                                border: 'none',
                                borderRadius: '4px',
                                backgroundColor: month.getFullYear() === year ? 'hsl(var(--color-brand-primary))' : 'transparent',
                                color: month.getFullYear() === year ? 'white' : 'hsl(var(--color-text-primary))',
                                cursor: 'pointer',
                                fontSize: '14px',
                                fontWeight: month.getFullYear() === year ? 600 : 400
                            }}
                            ref={month.getFullYear() === year ? (el) => el?.scrollIntoView({ block: 'center' }) : null}
                        >
                            {year}
                        </button>
                    ))}
                </div>
            )}

            {/* Months View */}
            {view === 'months' && (
                <div style={{ height: '300px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', alignContent: 'start', paddingTop: '16px' }}>
                    {months.map((m, index) => (
                        <button
                            key={m}
                            onClick={() => {
                                setMonthInPicker(current => setMonth(current, index));
                                setView('calendar');
                            }}
                            style={{
                                padding: '12px 8px',
                                border: 'none',
                                borderRadius: '6px',
                                backgroundColor: month.getMonth() === index ? 'hsl(var(--color-brand-primary))' : 'transparent',
                                color: month.getMonth() === index ? 'white' : 'hsl(var(--color-text-primary))',
                                cursor: 'pointer',
                                fontSize: '14px',
                                fontWeight: month.getMonth() === index ? 600 : 400,
                                textAlign: 'center'
                            }}
                            className="hover-bg"
                        >
                            {m}
                        </button>
                    ))}
                </div>
            )}

            {/* Finish to Start */}
            <div style={{
                marginTop: '16px',
                paddingTop: '12px',
                borderTop: '1px solid hsl(var(--color-border))'
            }}>
                <div style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    color: 'hsl(var(--color-text-secondary))',
                    textTransform: 'uppercase',
                    letterSpacing: '0.4px',
                    marginBottom: '8px'
                }}>
                    Finish to Start
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                    {successors.map(dep => {
                        const successorItem = board?.items.find(i => i.id === dep.successorItemId);
                        return (
                            <span
                                key={dep.id}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '5px',
                                    padding: '3px 8px',
                                    borderRadius: '12px',
                                    backgroundColor: 'hsl(var(--color-bg-subtle))',
                                    border: '1px solid hsl(var(--color-border))',
                                    fontSize: '12px',
                                    maxWidth: '150px'
                                }}
                            >
                                <ArrowRight size={11} style={{ flexShrink: 0, color: 'hsl(var(--color-text-tertiary))' }} />
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={successorItem?.title}>
                                    {successorItem?.title || 'Unknown item'}
                                </span>
                                <button
                                    onClick={() => removeItemDependency(dep.id)}
                                    title="Remove dependency"
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', color: 'hsl(var(--color-text-tertiary))' }}
                                >
                                    <X size={11} />
                                </button>
                            </span>
                        );
                    })}

                    <div style={{ position: 'relative' }} ref={successorBoxRef}>
                        <button
                            onClick={() => setIsAddingSuccessor(open => !open)}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '3px 8px',
                                borderRadius: '12px',
                                border: '1px dashed hsl(var(--color-border))',
                                background: 'transparent',
                                cursor: 'pointer',
                                fontSize: '12px',
                                color: 'hsl(var(--color-text-secondary))'
                            }}
                        >
                            <Plus size={11} />
                            Add item
                        </button>

                        {isAddingSuccessor && (
                            <div style={{
                                position: 'absolute',
                                bottom: 'calc(100% + 6px)',
                                left: 0,
                                width: '240px',
                                backgroundColor: 'hsl(var(--color-bg-surface))',
                                border: '1px solid hsl(var(--color-border))',
                                borderRadius: '8px',
                                boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                                zIndex: 1,
                                overflow: 'hidden'
                            }}>
                                <input
                                    autoFocus
                                    value={successorQuery}
                                    onChange={(e) => setSuccessorQuery(e.target.value)}
                                    placeholder="Search items on this board…"
                                    style={{
                                        width: '100%',
                                        padding: '8px 10px',
                                        border: 'none',
                                        borderBottom: '1px solid hsl(var(--color-border))',
                                        outline: 'none',
                                        fontSize: '12px',
                                        boxSizing: 'border-box',
                                        fontFamily: 'inherit'
                                    }}
                                />

                                {successorError && (
                                    <div style={{ padding: '6px 10px', fontSize: '11px', color: '#b91c1c', backgroundColor: '#fef2f2' }}>
                                        {successorError}
                                    </div>
                                )}

                                <div style={{ maxHeight: '160px', overflowY: 'auto' }}>
                                    {successorCandidates.length === 0 ? (
                                        <div style={{ padding: '10px', fontSize: '11px', color: 'hsl(var(--color-text-tertiary))' }}>
                                            No eligible items
                                        </div>
                                    ) : successorCandidates.map(candidate => (
                                        <button
                                            key={candidate.id}
                                            onClick={() => handlePickSuccessor(candidate.id)}
                                            style={{
                                                width: '100%',
                                                textAlign: 'left',
                                                padding: '7px 10px',
                                                border: 'none',
                                                background: 'transparent',
                                                cursor: 'pointer',
                                                fontSize: '12px',
                                                color: 'hsl(var(--color-text-primary))',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap'
                                            }}
                                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-hover))'}
                                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                        >
                                            {candidate.title || 'Untitled'}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <p style={{ fontSize: '11px', color: 'hsl(var(--color-text-tertiary))', margin: '6px 0 0' }}>
                    When this item's dates move, the items above shift with it.
                </p>
            </div>

            {/* Footer */}
            <div style={{ 
                marginTop: '16px', 
                paddingTop: '12px', 
                borderTop: '1px solid hsl(var(--color-border))', 
                display: 'flex', 
                justifyContent: 'space-between',
                alignItems: 'center'
            }}>
                <button
                    onClick={() => {
                        onSelect(null);
                        onClose();
                    }}
                    style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'hsl(var(--color-text-secondary))',
                        fontSize: '13px',
                        fontWeight: 500,
                        cursor: 'pointer',
                        padding: '4px 8px',
                        borderRadius: '4px'
                    }}
                    className="hover-bg"
                >
                    Clear
                </button>
                <button
                    onClick={onClose}
                    style={{
                        backgroundColor: 'hsl(var(--color-brand-primary))',
                        border: 'none',
                        color: 'white',
                        fontSize: '13px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        padding: '6px 16px',
                        borderRadius: '4px',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                    }}
                >
                    Save
                </button>
            </div>
        </div>,
        document.body
    );
};
