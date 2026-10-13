/**
 * Manual verification for src/lib/timelineScale.ts, the time scale shared by the
 * board's Timeline view and the dashboard's Timeline widget.
 *
 * `reference*` below is the logic exactly as it stood inline in TimelineView
 * before it was extracted; the new functions must agree with it on every input.
 * Run with:  npx tsx tests/timeline_scale_test.ts
 */
import {
    format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, startOfYear, endOfYear, eachMonthOfInterval,
    eachYearOfInterval, isSameMonth, isSameYear, addYears, subYears, addDays, getDate, getDaysInMonth, getDayOfYear, getDaysInYear
} from 'date-fns';
import { buildTimeGrid, computeBarSpan, todayOffset, unitWidthFor, isCurrentUnit, type TimelineViewType } from '../src/lib/timelineScale';

let passed = 0;
let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) passed++;
    else {
        failed++;
        console.log(`FAIL ${name}${detail ? ` — ${detail}` : ''}`);
    }
};

// ---- the original, verbatim ------------------------------------------------
const referenceGrid = (viewDate: Date, viewType: TimelineViewType) => {
    if (viewType === 'day') {
        const start = startOfMonth(viewDate);
        const end = addDays(start, 45 - 1);
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
};
const referenceUnitWidth = (viewType: TimelineViewType) => viewType === 'day' ? 40 : (viewType === 'month' ? 80 : 120);
const referenceBar = (startDate: Date, endDate: Date, timeGrid: Date[], viewType: TimelineViewType, unitWidth: number) => {
    const lastUnit = timeGrid[timeGrid.length - 1];
    const windowStart = timeGrid[0];
    const windowEnd = viewType === 'day' ? lastUnit
        : viewType === 'month' ? endOfMonth(lastUnit)
            : endOfYear(lastUnit);
    const columnOffset = (date: Date): number | null => {
        if (viewType === 'day') {
            const i = timeGrid.findIndex(u => isSameDay(u, date));
            return i === -1 ? null : i;
        }
        if (viewType === 'month') {
            const i = timeGrid.findIndex(u => isSameMonth(u, date));
            return i === -1 ? null : i + (getDate(date) - 1) / getDaysInMonth(date);
        }
        const i = timeGrid.findIndex(u => isSameYear(u, date));
        return i === -1 ? null : i + (getDayOfYear(date) - 1) / getDaysInYear(date);
    };
    const dayWidthInColumns = (date: Date): number => {
        if (viewType === 'day') return 1;
        if (viewType === 'month') return 1 / getDaysInMonth(date);
        return 1 / getDaysInYear(date);
    };
    if (endDate < windowStart || startDate > windowEnd) return null;
    const clippedStart = startDate < windowStart;
    const clippedEnd = endDate > windowEnd;
    const from = clippedStart ? 0 : columnOffset(startDate) ?? 0;
    const to = clippedEnd
        ? timeGrid.length
        : (columnOffset(endDate) ?? timeGrid.length) + dayWidthInColumns(endDate);
    const left = from * unitWidth;
    const width = Math.max(8, (to - from) * unitWidth);
    return { left, width, clippedStart, clippedEnd };
};
const referenceToday = (timeGrid: Date[], viewType: TimelineViewType, unitWidth: number, today: Date) => {
    const startIndex = timeGrid.findIndex(u => {
        if (viewType === 'day') return isSameDay(u, today);
        if (viewType === 'month') return isSameMonth(u, today);
        return isSameYear(u, today);
    });
    if (startIndex === -1) return null;
    return startIndex * unitWidth + (viewType === 'day' ? 0 :
        (viewType === 'month' ? (today.getDate() / endOfMonth(today).getDate()) * unitWidth :
            (today.getMonth() / 12) * unitWidth));
};

// ---- deterministic pseudo-random --------------------------------------------
let seed = 20261013;
const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
};
const randomDate = (from: Date, spanDays: number) => addDays(from, Math.floor(rand() * spanDays) - Math.floor(spanDays / 2));

const views: TimelineViewType[] = ['day', 'month', 'year'];
const anchors = [new Date(2026, 0, 1), new Date(2026, 9, 13), new Date(2026, 11, 31), new Date(2024, 1, 29), new Date(2030, 5, 15)];

let barCases = 0;
for (const viewType of views) {
    for (const anchor of anchors) {
        const grid = buildTimeGrid(anchor, viewType);
        const ref = referenceGrid(anchor, viewType);
        check(`grid ${viewType} ${format(anchor, 'yyyy-MM-dd')}`,
            grid.length === ref.length && grid.every((d, i) => d.getTime() === ref[i].getTime()));

        const w = unitWidthFor(viewType);
        check(`unit width ${viewType}`, w === referenceUnitWidth(viewType));

        for (let n = 0; n < 400; n++) {
            const start = randomDate(anchor, viewType === 'year' ? 3000 : viewType === 'month' ? 900 : 200);
            const end = addDays(start, Math.floor(rand() * (viewType === 'year' ? 900 : 120)));
            const got = computeBarSpan(start, end, grid, viewType, w);
            const want = referenceBar(start, end, ref, viewType, referenceUnitWidth(viewType));
            barCases++;
            check(`bar ${viewType} ${format(start, 'yyyy-MM-dd')}→${format(end, 'yyyy-MM-dd')}`,
                JSON.stringify(got) === JSON.stringify(want), `${JSON.stringify(got)} vs ${JSON.stringify(want)}`);
        }

        for (const today of [anchor, addDays(anchor, 40), addDays(anchor, -400), new Date(2026, 1, 28), new Date(2026, 11, 31)]) {
            check(`today ${viewType} ${format(anchor, 'yyyy-MM-dd')}/${format(today, 'yyyy-MM-dd')}`,
                todayOffset(grid, viewType, w, today) === referenceToday(ref, viewType, w, today));
        }
    }
}

// ---- a few hand-checked values ----------------------------------------------
const monthGrid = buildTimeGrid(new Date(2026, 5, 1), 'month');
const sep = computeBarSpan(new Date(2026, 8, 1), new Date(2026, 8, 30), monthGrid, 'month', 80);
check('Sep 1–30 fills the September column', !!sep && sep.left === 8 * 80 && Math.abs(sep.width - 80) < 1e-9, JSON.stringify(sep));
check('one-day bar has the minimum width', computeBarSpan(new Date(2026, 2, 3), new Date(2026, 2, 3), monthGrid, 'month', 80)?.width === 8);
check('before the window is dropped', computeBarSpan(new Date(2025, 0, 1), new Date(2025, 11, 31), monthGrid, 'month', 80) === null);
check('after the window is dropped', computeBarSpan(new Date(2027, 0, 1), new Date(2027, 0, 5), monthGrid, 'month', 80) === null);
const clipped = computeBarSpan(new Date(2025, 10, 1), new Date(2026, 1, 10), monthGrid, 'month', 80);
check('starts before the window: clipped to the left edge', !!clipped && clipped.clippedStart && !clipped.clippedEnd && clipped.left === 0);
const clippedEnd = computeBarSpan(new Date(2026, 10, 1), new Date(2027, 2, 1), monthGrid, 'month', 80);
check('runs past the window: clipped to the right edge', !!clippedEnd && clippedEnd.clippedEnd && clippedEnd.left + clippedEnd.width === 12 * 80);
check('late-December bar is kept (window ends at the end of Dec)', computeBarSpan(new Date(2026, 11, 20), new Date(2027, 0, 3), monthGrid, 'month', 80) !== null);
check('current unit', isCurrentUnit('month', new Date(2026, 9, 1), new Date(2026, 9, 28)) && !isCurrentUnit('month', new Date(2026, 8, 1), new Date(2026, 9, 28)));

console.log(`${barCases} bar cases compared\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
