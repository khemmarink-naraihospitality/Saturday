import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useBoardStore } from '../../../store/useBoardStore';
import { BottomSheet, PrimaryButton } from '../../ui';
import { parseDay, toDayString } from '../format';
import { addDays, addMonths, sameDay, startOfDay } from '../calendar';
import { ChipRow, MonthCalendar, monthTitle } from './MonthCalendar';
import type { EditorProps } from './types';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * A date or due date — reference screenshots 22 and 24: the month with Monday
 * first, the chosen day filled, Save in the header. Stored as 'YYYY-MM-DD' of
 * the local calendar day, exactly as the desktop DateCell writes it; an empty
 * cell opens on today, as monday's does. The quick chips replace the
 * reference's "Time" (our date columns carry no time of day).
 */
export const DateEditor = ({ open, onClose, item, column, value }: EditorProps) => {
    const updateItemValue = useBoardStore(state => state.updateItemValue);
    const today = startOfDay(new Date());
    const stored = typeof value === 'string' ? parseDay(value) : null;

    const [selected, setSelected] = useState<Date | null>(stored || today);
    const [month, setMonth] = useState<Date>(addMonths(stored || today, 0));
    const [direction, setDirection] = useState<1 | -1>(1);
    const [pickingMonth, setPickingMonth] = useState(false);

    useEffect(() => {
        if (!open) return;
        setSelected(stored || today);
        setMonth(addMonths(stored || today, 0));
        setPickingMonth(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const turn = (delta: 1 | -1) => {
        setDirection(delta);
        setMonth(m => addMonths(m, delta));
    };

    const pick = (day: Date | null) => {
        setSelected(day);
        if (day && (day.getMonth() !== month.getMonth() || day.getFullYear() !== month.getFullYear())) {
            setDirection(day > month ? 1 : -1);
            setMonth(addMonths(day, 0));
        }
    };

    const save = () => {
        onClose();
        const next = selected ? toDayString(selected) : null;
        const current = stored ? toDayString(stored) : null;
        if (next !== current) void updateItemValue(item.id, column.id, next);
    };

    const chip = (label: string, day: Date | null) => {
        const on = day ? sameDay(day, selected) : !selected;
        return (
            <button key={label} type="button" className={`m-cal-chip${on ? ' m-cal-chip--on' : ''}`} onClick={() => pick(day)}>
                {label}
            </button>
        );
    };

    return (
        <BottomSheet
            open={open}
            onClose={onClose}
            title={column.title}
            size="medium"
            headerRight={<PrimaryButton onClick={save} style={{ minHeight: 38, padding: '0 20px', fontSize: 16 }}>Save</PrimaryButton>}
            testId="m-cell-editor"
        >
            <ChipRow>
                {chip('Today', today)}
                {chip('Tomorrow', addDays(today, 1))}
                {chip('Next week', addDays(today, 7))}
                {stored && chip('Clear', null)}
            </ChipRow>

            <div className="m-cal-head">
                <button type="button" className="m-cal-head__title" onClick={() => setPickingMonth(v => !v)} aria-expanded={pickingMonth}>
                    {monthTitle(month, 'year-first')}
                    <ChevronRight size={22} strokeWidth={2.4} className="m-cal-head__chev" style={{ transform: pickingMonth ? 'rotate(90deg)' : undefined }} />
                </button>
                {!pickingMonth && (
                    <span className="m-cal-head__arrows">
                        <button type="button" onClick={() => turn(-1)} aria-label="Previous month"><ChevronLeft size={26} strokeWidth={2.2} /></button>
                        <button type="button" onClick={() => turn(1)} aria-label="Next month"><ChevronRight size={26} strokeWidth={2.2} /></button>
                    </span>
                )}
            </div>

            {pickingMonth ? (
                <div className="m-cal-months">
                    <div className="m-cal-months__year">
                        <button type="button" onClick={() => setMonth(m => new Date(m.getFullYear() - 1, m.getMonth(), 1))} aria-label="Previous year"><ChevronLeft size={24} /></button>
                        <span>{month.getFullYear()}</span>
                        <button type="button" onClick={() => setMonth(m => new Date(m.getFullYear() + 1, m.getMonth(), 1))} aria-label="Next year"><ChevronRight size={24} /></button>
                    </div>
                    <div className="m-cal-months__grid">
                        {MONTHS.map((name, i) => (
                            <button
                                key={name}
                                type="button"
                                className={`m-cal-months__month${i === month.getMonth() ? ' m-cal-months__month--on' : ''}`}
                                onClick={() => { setMonth(new Date(month.getFullYear(), i, 1)); setPickingMonth(false); }}
                            >
                                {name}
                            </button>
                        ))}
                    </div>
                </div>
            ) : (
                <MonthCalendar
                    month={month}
                    direction={direction}
                    today={today}
                    selected={selected}
                    weekdays="short"
                    size="large"
                    onTap={pick}
                    onSwipe={turn}
                />
            )}
        </BottomSheet>
    );
};
