import React, { useMemo } from 'react';
import { useBoardStore } from '../../store/useBoardStore';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths, startOfYear, endOfYear, eachMonthOfInterval, eachYearOfInterval, isSameMonth, isSameYear, addYears, subYears } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export const TimelineView = () => {
    const activeBoardId = useBoardStore(state => state.activeBoardId);
    const activeBoard = useBoardStore(state => state.boards.find(b => b.id === activeBoardId));
    
    // For now, we use a fixed range (current month)
    const [viewDate, setViewDate] = React.useState(new Date());
    const [viewType, setViewType] = React.useState<'day' | 'month' | 'year'>('day');
    
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
            // Year view: 5 years (2 before, 2 after current)
            const start = subYears(viewDate, 2);
            const end = addYears(viewDate, 2);
            return eachYearOfInterval({ start, end });
        }
    }, [viewDate, viewType]);

    const unitWidth = viewType === 'day' ? 40 : (viewType === 'month' ? 80 : 120);

    if (!activeBoard) return null;

    // Detect Timeline/Date columns
    const timelineCols = activeBoard.columns.filter(c => c.type === 'timeline' || c.type === 'date');
    const items = activeBoard.groups.flatMap(g => g.items.map(i => ({ ...i, groupColor: g.color })));

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

                    {/* View Type Switcher */}
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
            <div style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
                <div style={{ display: 'flex', minWidth: 'max-content', minHeight: '100%', flexDirection: 'column' }}>
                    
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
                                backgroundColor: '#f00', // Red line
                                zIndex: 8,
                                pointerEvents: 'none',
                                opacity: 0.6
                            }} />
                        );
                    })()}

                    {/* Timeline Data Rows */}
                    <div style={{ flex: 1 }}>
                        {items.map(item => {
                            // Find the first available timeline/date value
                            let startDate: Date | null = null;
                            let endDate: Date | null = null;

                            for (const col of timelineCols) {
                                const val = item.values[col.id];
                                if (val) {
                                    if (col.type === 'timeline') {
                                        if (val.from) startDate = new Date(val.from);
                                        if (val.to) endDate = new Date(val.to);
                                    } else if (col.type === 'date') {
                                        startDate = new Date(val);
                                        endDate = new Date(val);
                                    }
                                    if (startDate) break;
                                }
                            }

                            return (
                                <div key={item.id} style={{ display: 'flex', borderBottom: '1px solid #f5f5f5', minHeight: '36px', alignItems: 'center' }}>
                                    <div style={{ width: '200px', flexShrink: 0, borderRight: '1px solid #f5f5f5', padding: '8px 16px', fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {item.title}
                                    </div>
                                    <div style={{ display: 'flex', position: 'relative', flex: 1 }}>
                                        {/* Background Grid Lines */}
                                        {timeGrid.map(unit => (
                                            <div key={unit.toISOString()} style={{ width: `${unitWidth}px`, height: '36px', borderRight: '1px solid #f5f5f5', flexShrink: 0 }} />
                                        ))}

                                        {/* Duration Bar */}
                                        {startDate && endDate && (() => {
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

                                            if (startIndex === -1 && endDate < timeGrid[0]) return null;
                                            if (endIndex === -1 && startDate > timeGrid[timeGrid.length - 1]) return null;

                                            const left = startIndex === -1 ? 0 : startIndex * unitWidth;
                                            const effectiveEndIndex = endIndex === -1 ? timeGrid.length - 1 : endIndex;
                                            const width = (effectiveEndIndex - (startIndex === -1 ? 0 : startIndex) + 1) * unitWidth;

                                            return (
                                                <div style={{
                                                    position: 'absolute',
                                                    top: '8px',
                                                    bottom: '8px',
                                                    left: `${left}px`,
                                                    width: `${width}px`,
                                                    backgroundColor: item.groupColor || 'hsl(var(--color-brand-primary))',
                                                    borderRadius: '12px',
                                                    opacity: 0.8,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    color: 'white',
                                                    fontSize: '11px',
                                                    fontWeight: 500,
                                                    padding: '0 8px',
                                                    whiteSpace: 'nowrap',
                                                    overflow: 'hidden',
                                                    zIndex: 5
                                                }}>
                                                    {item.title}
                                                </div>
                                            );
                                        })()}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
};

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
