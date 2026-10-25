import { useState, useMemo } from 'react';
import { itemColumns } from '../../lib/columnScope';
import { 
    format, 
    startOfMonth, 
    endOfMonth, 
    startOfWeek, 
    endOfWeek, 
    eachDayOfInterval, 
    isSameMonth, 
    isSameDay, 
    addMonths, 
    subMonths,
    addDays,
    subDays,
    addYears,
    subYears,
    startOfYear,
    endOfYear,
    eachMonthOfInterval
} from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useBoardStore } from '../../store/useBoardStore';

export const CalendarView = () => {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [viewType, setViewType] = useState<'day' | 'month' | 'year'>('month');
    
    const activeBoardId = useBoardStore(state => state.activeBoardId);
    const boards = useBoardStore(state => state.boards);
    const searchQuery = useBoardStore(state => state.searchQuery);
    const showHiddenItems = useBoardStore(state => state.showHiddenItems);
    const setActiveItem = useBoardStore(state => state.setActiveItem);

    const activeBoard = useMemo(() => boards.find(b => b.id === activeBoardId), [boards, activeBoardId]);
    
    const filteredItems = useMemo(() => {
        if (!activeBoard) return [];
        let items = [...activeBoard.items];

        if (searchQuery) {
            items = items.filter(item => (item.title || '').toLowerCase().includes(searchQuery.toLowerCase()));
        }

        if (!showHiddenItems) {
            items = items.filter(item => !item.isHidden);
        }

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

        return items;
    }, [activeBoard, searchQuery, showHiddenItems]);
    
    const timeColumn = useMemo(() => itemColumns(activeBoard?.columns || []).find(c => c.type === 'timeline' || c.type === 'date' || c.type === 'due_date'), [activeBoard]);

    const getItemsForDay = (day: Date) => {
        if (!activeBoard || !timeColumn) return [];
        
        return filteredItems.filter(item => {
            const val = item.values?.[timeColumn.id];
            if (!val) return false;

            let start: Date | null = null;
            let end: Date | null = null;

            if (timeColumn.type === 'timeline') {
                if (val.from) start = new Date(val.from);
                if (val.to) end = new Date(val.to);
            } else if (timeColumn.type === 'date') {
                start = new Date(val);
                end = new Date(val);
            }

            if (!start || !end) return false;

            const d = new Date(day).setHours(0,0,0,0);
            const s = new Date(start).setHours(0,0,0,0);
            const e = new Date(end).setHours(0,0,0,0);

            return d >= s && d <= e;
        });
    };

    const handleNext = () => {
        if (viewType === 'day') setCurrentDate(addDays(currentDate, 1));
        else if (viewType === 'month') setCurrentDate(addMonths(currentDate, 1));
        else setCurrentDate(addYears(currentDate, 1));
    };

    const handlePrev = () => {
        if (viewType === 'day') setCurrentDate(subDays(currentDate, 1));
        else if (viewType === 'month') setCurrentDate(subMonths(currentDate, 1));
        else setCurrentDate(subYears(currentDate, 1));
    };

    if (!activeBoard) return null;

    const renderHeader = () => (
        <div className="calendar-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: 600, margin: 0, minWidth: '150px' }}>
                    {viewType === 'day' ? format(currentDate, 'MMMM d, yyyy') : 
                     viewType === 'month' ? format(currentDate, 'MMMM yyyy') : 
                     format(currentDate, 'yyyy')}
                </h2>
                <div style={{ display: 'flex', gap: '4px' }}>
                    <button onClick={handlePrev} className="nav-btn">
                        <ChevronLeft size={18} />
                    </button>
                    <button 
                        className="nav-btn"
                        style={{ width: 'auto', fontSize: '12px', padding: '0 12px' }}
                        onClick={() => setCurrentDate(new Date())}
                    >
                        Today
                    </button>
                    <button onClick={handleNext} className="nav-btn">
                        <ChevronRight size={18} />
                    </button>
                </div>

                <div style={{ display: 'flex', backgroundColor: 'var(--card-row-hover)', borderRadius: '10px', padding: '2px', marginLeft: '16px' }}>
                    {(['day', 'month', 'year'] as const).map(type => (
                        <button
                            key={type}
                            onClick={() => setViewType(type)}
                            style={{
                                border: 'none',
                                padding: '4px 12px',
                                borderRadius: '8px',
                                fontSize: '13px',
                                fontWeight: viewType === type ? 600 : 400,
                                backgroundColor: viewType === type ? 'var(--card-solid)' : 'transparent',
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
    );

    const renderDayView = () => {
        const dayItems = getItemsForDay(currentDate);
        return (
            <div style={{ flex: 1, padding: '20px', overflowY: 'auto' }}>
                <div style={{ maxWidth: '600px', margin: '0 auto' }}>
                    <h3 style={{ borderBottom: '2px solid hsl(var(--color-brand-primary))', paddingBottom: '8px', color: 'hsl(var(--color-brand-primary))' }}>
                        Tasks for {format(currentDate, 'EEEE')}
                    </h3>
                    {dayItems.length === 0 ? (
                        <p style={{ color: 'hsl(var(--color-text-tertiary))', textAlign: 'center', marginTop: '40px' }}>No tasks scheduled for this day.</p>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '20px' }}>
                            {dayItems.map(item => {
                                const group = activeBoard.groups.find(g => g.id === item.groupId);
                                return (
                                    <div 
                                        key={item.id}
                                        onClick={() => setActiveItem(item.id)}
                                        className="card-surface calendar-pick"
                                        style={{
                                            padding: '16px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '12px'
                                        }}
                                    >
                                        <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: group?.color || '#333' }} />
                                        <span style={{ fontWeight: 500 }}>{item.title}</span>
                                        <span style={{ marginLeft: 'auto', fontSize: '12px', color: 'hsl(var(--color-text-tertiary))' }}>{group?.title}</span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        );
    };

    const renderMonthView = () => {
        const monthStart = startOfMonth(currentDate);
        const monthEnd = endOfMonth(monthStart);
        const startDate = startOfWeek(monthStart);
        const endDate = endOfWeek(monthEnd);
        const calendarDays = eachDayOfInterval({ start: startDate, end: endDate });

        return (
            <div className="board-sheet calendar-sheet">
                <div className="calendar-grid-header">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                        <div key={day} className="weekday-label">{day}</div>
                    ))}
                </div>
                <div className="calendar-grid">
                    {calendarDays.map((day, idx) => {
                        const dayItems = getItemsForDay(day);
                        const isCurrentMonth = isSameMonth(day, monthStart);
                        const isToday = isSameDay(day, new Date());
                        return (
                            <div 
                                key={idx} 
                                className={`calendar-day ${!isCurrentMonth ? 'other-month' : ''} ${isToday ? 'today' : ''}`}
                                onClick={() => {
                                    if (!isCurrentMonth) setCurrentDate(day);
                                    setViewType('day');
                                    setCurrentDate(day);
                                }}
                            >
                                <div className="day-number">{format(day, 'd')}</div>
                                <div className="day-content">
                                    {dayItems.map(item => {
                                        const group = activeBoard.groups.find(g => g.id === item.groupId);
                                        return (
                                            <div 
                                                key={item.id} 
                                                onClick={(e) => { e.stopPropagation(); setActiveItem(item.id); }}
                                                className="calendar-item-bar"
                                                style={{ backgroundColor: group?.color || '#333' }}
                                                title={item.title}
                                            >
                                                {item.title}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    const renderYearView = () => {
        const yearStart = startOfYear(currentDate);
        const yearEnd = endOfYear(yearStart);
        const months = eachMonthOfInterval({ start: yearStart, end: yearEnd });

        return (
            <div style={{ flex: 1, padding: '24px', overflowY: 'auto' }}>
                <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', 
                    gap: '24px' 
                }}>
                    {months.map(month => {
                        const mStart = startOfMonth(month);
                        const mEnd = endOfMonth(mStart);
                        const sDate = startOfWeek(mStart);
                        const eDate = endOfWeek(mEnd);
                        const days = eachDayOfInterval({ start: sDate, end: eDate });

                        return (
                            <div 
                                key={month.toISOString()}
                                onClick={() => {
                                    setCurrentDate(month);
                                    setViewType('month');
                                }}
                                className="card-surface calendar-pick"
                                style={{ padding: '12px' }}
                            >
                                <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px', textAlign: 'center' }}>
                                    {format(month, 'MMMM')}
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
                                    {['S','M','T','W','T','F','S'].map((d, i) => (
                                        <div key={i} style={{ fontSize: '9px', textAlign: 'center', color: 'hsl(var(--color-text-tertiary))' }}>{d}</div>
                                    ))}
                                    {days.map((day, i) => {
                                        const hasItems = getItemsForDay(day).length > 0;
                                        const isM = isSameMonth(day, month);
                                        return (
                                            <div 
                                                key={i} 
                                                style={{ 
                                                    fontSize: '9px', 
                                                    textAlign: 'center', 
                                                    padding: '2px 0',
                                                    color: isM ? 'inherit' : 'hsl(var(--color-text-tertiary) / 0.55)',
                                                    backgroundColor: (isM && hasItems) ? 'hsl(var(--color-brand-primary) / 0.12)' : 'transparent',
                                                    borderRadius: '2px',
                                                    fontWeight: (isM && hasItems) ? 700 : 400
                                                }}
                                            >
                                                {format(day, 'd')}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    return (
        <div className="calendar-container">
            {renderHeader()}
            {viewType === 'day' && renderDayView()}
            {viewType === 'month' && renderMonthView()}
            {viewType === 'year' && renderYearView()}

            <style>{`
                .calendar-container {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    padding: 24px 32px;
                    overflow: hidden;
                    height: 100%;
                }
                .calendar-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 24px;
                }
                .nav-btn {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 28px;
                    height: 28px;
                    border: 1px solid var(--card-border);
                    border-radius: 8px;
                    background: var(--card-solid);
                    cursor: pointer;
                    color: hsl(var(--color-text-secondary));
                }
                .nav-btn:hover {
                    background-color: var(--card-row-hover);
                }
                /* The month grid sits in one sheet (styles/cards.css .board-sheet),
                   whose edge is the grid's outer line */
                .calendar-sheet {
                    flex: 1;
                    min-height: 0;
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                }
                .calendar-grid-header {
                    display: grid;
                    grid-template-columns: repeat(7, 1fr);
                }
                .weekday-label {
                    padding: 8px;
                    text-align: center;
                    font-size: 13px;
                    color: hsl(var(--color-text-tertiary));
                    border-right: 1px solid var(--card-grid);
                    border-bottom: 1px solid var(--card-border);
                    background-color: var(--card-tray);
                    font-weight: 500;
                }
                .weekday-label:last-child {
                    border-right: none;
                }
                .calendar-grid {
                    flex: 1;
                    display: grid;
                    grid-template-columns: repeat(7, 1fr);
                    grid-auto-rows: 1fr;
                    overflow-y: auto;
                }
                .calendar-day {
                    min-height: 100px;
                    border-right: 1px solid var(--card-grid);
                    border-bottom: 1px solid var(--card-grid);
                    padding: 4px;
                    display: flex;
                    flex-direction: column;
                    cursor: pointer;
                }
                /* The sheet's edge is the outer line: no second one on the last column or row */
                .calendar-day:nth-child(7n) {
                    border-right: none;
                }
                .calendar-day:nth-last-child(-n + 7) {
                    border-bottom: none;
                }
                .calendar-day:hover {
                    background-color: var(--card-row-hover);
                }
                .calendar-day.other-month {
                    background-color: var(--card-tray);
                }
                .calendar-day.today {
                    background-color: hsl(var(--color-brand-primary) / 0.06);
                }
                .day-number {
                    font-size: 12px;
                    color: hsl(var(--color-text-secondary));
                    margin-bottom: 4px;
                    font-weight: 500;
                }
                .calendar-day.today .day-number {
                    color: white;
                    background-color: hsl(var(--color-brand-primary));
                    width: 20px;
                    height: 20px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 50%;
                }
                .day-content {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                    overflow: hidden;
                }
                .calendar-item-bar {
                    font-size: 11px;
                    color: white;
                    padding: 2px 6px;
                    border-radius: 3px;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    cursor: pointer;
                }
                .calendar-item-bar:hover {
                    filter: brightness(1.1);
                }
            `}</style>
        </div>
    );
};


