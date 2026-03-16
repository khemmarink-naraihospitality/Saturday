import { useState, useMemo } from 'react';
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
    parse,
    isValid
} from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useBoardStore } from '../../store/useBoardStore';

export const CalendarView = () => {
    const [currentDate, setCurrentDate] = useState(new Date());
    const activeBoardId = useBoardStore(state => state.activeBoardId);
    const boards = useBoardStore(state => state.boards);
    const searchQuery = useBoardStore(state => state.searchQuery);

    const activeBoard = useMemo(() => boards.find(b => b.id === activeBoardId), [boards, activeBoardId]);
    
    const filteredItems = useMemo(() => {
        if (!activeBoard) return [];
        let items = [...activeBoard.items];

        // 1. Search
        if (searchQuery) {
            items = items.filter(item => item.title.toLowerCase().includes(searchQuery.toLowerCase()));
        }

        // 2. Filters
        if (activeBoard.filters && activeBoard.filters.length > 0) {
            activeBoard.filters.forEach(filter => {
                if (filter.values && filter.values.length > 0) {
                    items = items.filter(item => {
                        const val = item.values[filter.columnId];
                        if (Array.isArray(val)) return val.some(v => filter.values.includes(v));
                        if (typeof val === 'boolean') return filter.values.includes(String(val));
                        return filter.values.includes(val);
                    });
                }
            });
        }

        return items;
    }, [activeBoard, searchQuery]);
    
    // Find timeline column
    const timelineColumn = useMemo(() => activeBoard?.columns.find(c => c.type === 'timeline'), [activeBoard]);

    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart);
    const endDate = endOfWeek(monthEnd);

    const calendarDays = eachDayOfInterval({
        start: startDate,
        end: endDate,
    });

    const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));
    const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));

    const getItemsForDay = (day: Date) => {
        if (!activeBoard || !timelineColumn) return [];
        
        return filteredItems.filter(item => {
            const timelineValue = item.values?.[timelineColumn.id];
            if (!timelineValue || typeof timelineValue !== 'string') return false;

            // Simple parsing for "Jan 1, 2024 - Jan 5, 2024" or similar
            // Assuming the format is roughly "MMM d - MMM d, yyyy" or "MMM d, yyyy - MMM d, yyyy"
            const parts = timelineValue.split(' - ');
            if (parts.length < 1) return false;

            try {
                // This logic needs to be robust. For now, let's try some common formats.
                const parseDate = (dStr: string) => {
                    // Try parsing with year first
                    let d = parse(dStr, 'MMM d, yyyy', new Date());
                    if (!isValid(d)) {
                        // Try without year, adding current year
                        d = parse(dStr, 'MMM d', new Date());
                    }
                    return d;
                };

                const startParsed = parseDate(parts[0]);
                const endParsed = parts.length > 1 ? parseDate(parts[1]) : startParsed;

                if (!isValid(startParsed)) return false;

                // Set all to midnight for accurate comparison
                const dayMid = new Date(day).setHours(0,0,0,0);
                const startMid = new Date(startParsed).setHours(0,0,0,0);
                const endMid = new Date(endParsed).setHours(0,0,0,0);

                return dayMid >= startMid && dayMid <= endMid;
            } catch (e) {
                return false;
            }
        });
    };

    if (!activeBoard) return null;

    return (
        <div className="calendar-container">
            <div className="calendar-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <h2 style={{ fontSize: '18px', fontWeight: 600, margin: 0 }}>
                        {format(currentDate, 'MMMM yyyy')}
                    </h2>
                    <div style={{ display: 'flex', gap: '4px' }}>
                        <button onClick={prevMonth} className="nav-btn">
                            <ChevronLeft size={18} />
                        </button>
                        <button style={{ fontSize: '12px', padding: '0 8px', borderRadius: '4px', border: '1px solid hsl(var(--color-border))', background: 'none', cursor: 'pointer' }} onClick={() => setCurrentDate(new Date())}>
                            Today
                        </button>
                        <button onClick={nextMonth} className="nav-btn">
                            <ChevronRight size={18} />
                        </button>
                    </div>
                </div>
            </div>

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
                        >
                            <div className="day-number">{format(day, 'd')}</div>
                            <div className="day-content">
                                {dayItems.map(item => {
                                    const group = activeBoard.groups.find(g => g.id === item.groupId);
                                    return (
                                        <div 
                                            key={item.id} 
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

            <style>{`
                .calendar-container {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    padding: 24px 32px;
                    overflow: hidden;
                    background-color: white;
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
                    border: 1px solid hsl(var(--color-border));
                    border-radius: 4px;
                    background: none;
                    cursor: pointer;
                    color: hsl(var(--color-text-secondary));
                }
                .nav-btn:hover {
                    background-color: hsl(var(--color-bg-hover));
                }
                .calendar-grid-header {
                    display: grid;
                    grid-template-columns: repeat(7, 1fr);
                    border-left: 1px solid hsl(var(--color-border));
                    border-top: 1px solid hsl(var(--color-border));
                }
                .weekday-label {
                    padding: 8px;
                    text-align: center;
                    font-size: 13px;
                    color: hsl(var(--color-text-tertiary));
                    border-right: 1px solid hsl(var(--color-border));
                    border-bottom: 1px solid hsl(var(--color-border));
                    background-color: hsl(var(--color-bg-subtle));
                    font-weight: 500;
                }
                .calendar-grid {
                    flex: 1;
                    display: grid;
                    grid-template-columns: repeat(7, 1fr);
                    grid-auto-rows: 1fr;
                    border-left: 1px solid hsl(var(--color-border));
                    overflow-y: auto;
                }
                .calendar-day {
                    min-height: 100px;
                    border-right: 1px solid hsl(var(--color-border));
                    border-bottom: 1px solid hsl(var(--color-border));
                    padding: 4px;
                    display: flex;
                    flex-direction: column;
                }
                .calendar-day.other-month {
                    background-color: hsl(var(--color-bg-canvas));
                }
                .calendar-day.today {
                    background-color: rgba(var(--color-brand-primary-rgb), 0.05);
                }
                .day-number {
                    font-size: 12px;
                    color: hsl(var(--color-text-secondary));
                    margin-bottom: 4px;
                    font-weight: 500;
                }
                .calendar-day.today .day-number {
                    color: hsl(var(--color-brand-primary));
                    background-color: hsl(var(--color-brand-primary));
                    color: white;
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
