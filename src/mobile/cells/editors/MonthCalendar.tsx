import { useRef, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { monthGrid, sameDay, type DayRange, rangePart } from '../calendar';

const WEEKDAYS_SHORT = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const WEEKDAYS_LETTER = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export const monthTitle = (month: Date, style: 'year-first' | 'month-first' = 'month-first') => {
    const name = month.toLocaleDateString('en-US', { month: 'long' });
    return style === 'year-first' ? `${month.getFullYear()} ${name}` : `${name} ${month.getFullYear()}`;
};

/** Left / right swipes on the grid turn the month, as on a phone calendar. */
const useSwipe = (onSwipe: (direction: 1 | -1) => void) => {
    const start = useRef<{ x: number; y: number } | null>(null);
    return {
        onPointerDown: (e: React.PointerEvent) => { start.current = { x: e.clientX, y: e.clientY }; },
        onPointerUp: (e: React.PointerEvent) => {
            const s = start.current;
            start.current = null;
            if (!s) return;
            const dx = e.clientX - s.x;
            const dy = e.clientY - s.y;
            if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.5) onSwipe(dx < 0 ? 1 : -1);
        },
        onPointerCancel: () => { start.current = null; },
    };
};

/**
 * One month of days, Monday first. Either one chosen day (`selected`, the date
 * sheet) or a range (`range`, the timeline sheet) is drawn; today is marked.
 */
export const MonthCalendar = ({ month, direction, today, selected, range, weekdays, size, onTap, onSwipe }: {
    month: Date;
    /** Which way the last turn went, for the slide. */
    direction: 1 | -1;
    today: Date;
    selected?: Date | null;
    range?: DayRange | null;
    weekdays: 'short' | 'letter';
    size: 'large' | 'compact';
    onTap: (day: Date) => void;
    onSwipe: (direction: 1 | -1) => void;
}) => {
    const swipe = useSwipe(onSwipe);
    const weeks = monthGrid(month.getFullYear(), month.getMonth());
    const labels = weekdays === 'short' ? WEEKDAYS_SHORT : WEEKDAYS_LETTER;

    return (
        <div className={`m-cal m-cal--${size}`} {...swipe}>
            <div className={`m-cal__weekdays m-cal__weekdays--${weekdays}`} aria-hidden="true">
                {labels.map((label, i) => <span key={i}>{label}</span>)}
            </div>
            <motion.div
                key={`${month.getFullYear()}-${month.getMonth()}`}
                className="m-cal__grid"
                role="grid"
                aria-label={monthTitle(month)}
                initial={{ x: direction * 36, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
            >
                {weeks.flat().map((day, i) => {
                    if (!day) return <span key={i} className="m-cal__blank" />;
                    const part = range !== undefined ? rangePart(range ?? null, day) : (sameDay(day, selected) ? 'single' : null);
                    const isToday = sameDay(day, today);
                    let cls = 'm-cal__day';
                    if (part) cls += ` m-cal__day--${part}`;
                    if (isToday) cls += ' m-cal__day--today';
                    return (
                        <button
                            key={i}
                            type="button"
                            className={cls}
                            onClick={() => onTap(day)}
                            aria-pressed={!!part && part !== 'inside'}
                            aria-label={day.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                        >
                            {(part === 'start' || part === 'end' || part === 'inside') && <span className="m-cal__band" aria-hidden="true" />}
                            <span className="m-cal__num">{day.getDate()}</span>
                        </button>
                    );
                })}
            </motion.div>
        </div>
    );
};

/** A row of quick choices under the sheet header ("Today", "Clear"…). */
export const ChipRow = ({ children }: { children: ReactNode }) => <div className="m-cal-chips">{children}</div>;
