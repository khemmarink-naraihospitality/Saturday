/**
 * Manual verification for the phone layout's cell helpers: dates read and
 * written as local calendar days, "this year" formatting, overdue, timeline
 * ranges (src/mobile/cells/format.ts), and the month grids and range taps of
 * the date / timeline sheets (src/mobile/cells/calendar.ts).
 * Run with:  npx tsx tests/mobile_cells_test.ts
 * (Also worth running with TZ=America/Los_Angeles and TZ=Asia/Bangkok: no
 * answer below may move with the time zone.)
 */
import { formatDateCell, formatTimelineRange, isOverdue, parseDay, timelineDays, toDayString } from '../src/mobile/cells/format';
import { addDays, addMonths, monthGrid, rangePart, sameDay, tapRange } from '../src/mobile/cells/calendar';

let passed = 0;
let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) passed++;
    else {
        failed++;
        console.log(`FAIL ${name}${detail ? ` — ${detail}` : ''}`);
    }
};
const eq = (name: string, got: unknown, want: unknown) =>
    check(name, JSON.stringify(got) === JSON.stringify(want), `${JSON.stringify(got)} vs ${JSON.stringify(want)}`);

const NOW = new Date(2026, 9, 15, 23, 30); // Oct 15 2026, late evening local

// parseDay / toDayString
eq('YYYY-MM-DD round-trips', toDayString(parseDay('2026-02-09')!), '2026-02-09');
eq('an ISO timestamp keeps its calendar day', toDayString(parseDay('2025-12-31T23:59:00Z')!), '2025-12-31');
eq('leap day', toDayString(parseDay('2028-02-29')!), '2028-02-29');
eq('empty', parseDay(''), null);
eq('garbage', parseDay('next tuesday'), null);
eq('non-string', parseDay(42 as unknown as string), null);
eq('toDayString pads', toDayString(new Date(2026, 0, 5)), '2026-01-05');
eq('toDayString at local midnight does not slip a day', toDayString(new Date(2026, 6, 1, 0, 0, 0)), '2026-07-01');

// formatDateCell
eq('this year: no year', formatDateCell('2026-01-15', NOW), 'Jan 15');
eq('another year: with year', formatDateCell('2025-02-09', NOW), 'Feb 9, 2025');
eq('no value', formatDateCell(null, NOW), '');

// isOverdue
check('yesterday is overdue', isOverdue('2026-10-14', NOW));
check('today is not overdue (even late in the day)', !isOverdue('2026-10-15', NOW));
check('tomorrow is not overdue', !isOverdue('2026-10-16', NOW));
check('no date is not overdue', !isOverdue(undefined, NOW));

// formatTimelineRange / timelineDays
eq('range within this year', formatTimelineRange({ from: '2026-10-01', to: '2026-10-20' }, NOW), 'Oct 1 - Oct 20');
eq('range across years', formatTimelineRange({ from: '2026-11-01', to: '2027-01-31' }, NOW), 'Nov 1 - Jan 31, 2027');
eq('half a range shows nothing', formatTimelineRange({ from: '2026-11-01' }, NOW), '');
eq('no range', formatTimelineRange(null, NOW), '');
eq('one-day timeline is 1 day', timelineDays({ from: '2026-10-01', to: '2026-10-01' }), 1);
eq('days counted inclusively', timelineDays({ from: '2026-10-01', to: '2026-10-20' }), 20);
eq('across a DST change still whole days', timelineDays({ from: '2026-03-01', to: '2026-03-31' }), 31);
eq('no range, no days', timelineDays(undefined), 0);

// monthGrid (Monday first)
const oct2026 = monthGrid(2026, 9);
eq('October 2026 starts on a Thursday: three blanks', oct2026[0].slice(0, 4).map(d => d && d.getDate()), [null, null, null, 1]);
eq('…and has five weeks', oct2026.length, 5);
eq('last week ends with the 31st then blanks', oct2026[4].map(d => d && d.getDate()), [26, 27, 28, 29, 30, 31, null]);
eq('February 2021 fits exactly four weeks (Mon 1st, 28 days)', monthGrid(2021, 1).length, 4);
eq('a month starting on Sunday needs six weeks (Aug 2021)', monthGrid(2021, 7).length, 6);
check('every week has seven cells', [monthGrid(2024, 1), monthGrid(2026, 9), monthGrid(2021, 7)].every(g => g.every(w => w.length === 7)));
eq('leap February has 29 days', monthGrid(2028, 1).flat().filter(Boolean).length, 29);

// addMonths / addDays
eq('Jan 31 + 1 month is February, not March', toDayString(addMonths(new Date(2026, 0, 31), 1)), '2026-02-01');
eq('across a year back', toDayString(addMonths(new Date(2026, 0, 15), -1)), '2025-12-01');
eq('addDays over a month end', toDayString(addDays(new Date(2026, 9, 30), 3)), '2026-11-02');
eq('addDays over the March DST change stays on calendar days', toDayString(addDays(new Date(2026, 2, 28), 2)), '2026-03-30');

// tapRange / rangePart
const d = (day: number) => new Date(2026, 9, day);
let range = tapRange(null, d(10));
eq('first tap starts a range', [range.from.getDate(), range.to], [10, null]);
range = tapRange(range, d(14));
eq('second tap ends it', [range.from.getDate(), range.to && range.to.getDate()], [10, 14]);
eq('an earlier second tap becomes the start', (() => { const r = tapRange(tapRange(null, d(10)), d(3)); return [r.from.getDate(), r.to && r.to.getDate()]; })(), [3, 10]);
eq('a tap after a finished range starts again', (() => { const r = tapRange(range, d(20)); return [r.from.getDate(), r.to]; })(), [20, null]);
eq('parts of 10–14', [9, 10, 12, 14, 15].map(n => rangePart(range, d(n))), [null, 'start', 'inside', 'end', null]);
eq('a one-day range', rangePart({ from: d(5), to: d(5) }, d(5)), 'single');
eq('an open range is a single day so far', rangePart({ from: d(5), to: null }, d(5)), 'single');
check('sameDay ignores the time', sameDay(new Date(2026, 9, 5, 23, 59), new Date(2026, 9, 5, 0, 1)));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
