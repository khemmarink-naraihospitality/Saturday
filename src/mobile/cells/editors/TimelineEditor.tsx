import { useEffect, useState } from 'react';
import { useBoardStore } from '../../../store/useBoardStore';
import { BottomSheet, PrimaryButton, TextButton } from '../../ui';
import { parseDay, toDayString } from '../format';
import { addMonths, startOfDay, tapRange, type DayRange } from '../calendar';
import { MonthCalendar, monthTitle } from './MonthCalendar';
import type { EditorProps } from './types';

const DAY = 86400000;

const describe = (range: DayRange | null) => {
    if (!range) return 'Tap the first day';
    const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
    if (!range.to) return `${fmt(range.from)} – tap the last day`;
    const days = Math.round((range.to.getTime() - range.from.getTime()) / DAY) + 1;
    return `${fmt(range.from)} – ${fmt(range.to)} · ${days} ${days === 1 ? 'day' : 'days'}`;
};

/**
 * A timeline — reference screenshot 25: the month with its neighbours peeking
 * at the sides (tap them, or swipe the grid), first tap the start, second tap
 * the end, Clear at the bottom. Saved as { from, to } in 'YYYY-MM-DD', as the
 * desktop TimelinePicker writes it; a single tapped day is a one-day timeline.
 * The store moves dependent items along, as for any timeline change.
 */
export const TimelineEditor = ({ open, onClose, item, column, value }: EditorProps) => {
    const updateItemValue = useBoardStore(state => state.updateItemValue);
    const today = startOfDay(new Date());
    const raw = value as { from?: string; to?: string } | null;
    const storedFrom = parseDay(raw?.from);
    const storedTo = parseDay(raw?.to);
    const stored: DayRange | null = storedFrom && storedTo ? { from: storedFrom, to: storedTo } : null;

    const [range, setRange] = useState<DayRange | null>(stored);
    const [month, setMonth] = useState<Date>(addMonths(stored?.from || today, 0));
    const [direction, setDirection] = useState<1 | -1>(1);

    useEffect(() => {
        if (!open) return;
        setRange(stored);
        setMonth(addMonths(stored?.from || today, 0));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const turn = (delta: 1 | -1) => {
        setDirection(delta);
        setMonth(m => addMonths(m, delta));
    };

    const save = () => {
        onClose();
        const next = range ? { from: toDayString(range.from), to: toDayString(range.to || range.from) } : null;
        const current = stored ? { from: toDayString(stored.from), to: toDayString(stored.to!) } : null;
        if (JSON.stringify(next) !== JSON.stringify(current)) void updateItemValue(item.id, column.id, next);
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
            <div className="m-cal-carousel" aria-live="polite">
                <button type="button" className="m-cal-carousel__side m-cal-carousel__side--prev" onClick={() => turn(-1)} aria-label={`Previous month, ${monthTitle(addMonths(month, -1))}`}>
                    {monthTitle(addMonths(month, -1))}
                </button>
                <span className="m-cal-carousel__title">{monthTitle(month)}</span>
                <button type="button" className="m-cal-carousel__side m-cal-carousel__side--next" onClick={() => turn(1)} aria-label={`Next month, ${monthTitle(addMonths(month, 1))}`}>
                    {monthTitle(addMonths(month, 1))}
                </button>
            </div>

            <MonthCalendar
                month={month}
                direction={direction}
                today={today}
                range={range}
                weekdays="letter"
                size="compact"
                onTap={(day) => setRange(prev => tapRange(prev, day))}
                onSwipe={turn}
            />

            <div className="m-cal-foot">
                <span className="m-cal-foot__summary">{describe(range)}</span>
                <TextButton onClick={() => setRange(null)} disabled={!range}>Clear</TextButton>
            </div>
        </BottomSheet>
    );
};
