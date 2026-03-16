import React, { useMemo } from 'react';
import { useBoardStore } from '../../store/useBoardStore';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths, startOfWeek, endOfWeek } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export const TimelineView = () => {
    const activeBoardId = useBoardStore(state => state.activeBoardId);
    const activeBoard = useBoardStore(state => state.boards.find(b => b.id === activeBoardId));
    
    // For now, we use a fixed range (current month)
    const [viewDate, setViewDate] = React.useState(new Date());
    
    const days = useMemo(() => {
        const start = startOfMonth(viewDate);
        const end = endOfMonth(viewDate);
        return eachDayOfInterval({ start, end });
    }, [viewDate]);

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
                        {format(viewDate, 'MMMM yyyy')}
                    </h3>
                    <div style={{ display: 'flex', gap: '4px' }}>
                        <button 
                            onClick={() => setViewDate(subMonths(viewDate, 1))}
                            style={navBtnStyle}
                        >
                            <ChevronLeft size={18} />
                        </button>
                        <button 
                            onClick={() => setViewDate(addMonths(viewDate, 1))}
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
                </div>
            </div>

            {/* Timeline Grid */}
            <div style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
                <div style={{ display: 'flex', minWidth: 'max-content', height: '100%', flexDirection: 'column' }}>
                    
                    {/* Calendar Day Headers */}
                    <div style={{ display: 'flex', borderBottom: '1px solid hsl(var(--color-border))', position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'white' }}>
                        <div style={{ width: '200px', flexShrink: 0, borderRight: '1px solid hsl(var(--color-border))', padding: '12px 16px', fontWeight: 600, fontSize: '13px' }}>Item Name</div>
                        {days.map(day => (
                            <div key={day.toISOString()} style={{
                                width: '40px',
                                textAlign: 'center',
                                padding: '12px 0',
                                fontSize: '12px',
                                borderRight: '1px solid hsl(var(--color-border-subtle, #eee))',
                                color: isSameDay(day, new Date()) ? 'hsl(var(--color-brand-primary))' : 'inherit',
                                fontWeight: isSameDay(day, new Date()) ? 700 : 400
                            }}>
                                <div>{format(day, 'd')}</div>
                                <div style={{ fontSize: '10px', opacity: 0.5 }}>{format(day, 'EEE')}</div>
                            </div>
                        ))}
                    </div>

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
                                        {days.map(day => (
                                            <div key={day.toISOString()} style={{ width: '40px', height: '36px', borderRight: '1px solid #f5f5f5', flexShrink: 0 }} />
                                        ))}

                                        {/* Duration Bar */}
                                        {startDate && endDate && (
                                            <div style={{
                                                position: 'absolute',
                                                top: '8px',
                                                bottom: '8px',
                                                left: `${Math.max(0, days.findIndex(d => isSameDay(d, startDate!)) * 40)}px`,
                                                width: `${Math.max(40, (days.findIndex(d => isSameDay(d, endDate!)) - days.findIndex(d => isSameDay(d, startDate!)) + 1) * 40)}px`,
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
                                                overflow: 'hidden'
                                            }}>
                                                {item.title}
                                            </div>
                                        )}
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
