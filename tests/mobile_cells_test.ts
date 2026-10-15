/**
 * Manual verification for the phone layout's cell text helpers
 * (src/mobile/cells/format.ts): dates read and written as local calendar days,
 * "this year" formatting, overdue, timeline ranges.
 * Run with:  npx tsx tests/mobile_cells_test.ts
 * (Also worth running with TZ=America/Los_Angeles and TZ=Asia/Bangkok: no
 * answer below may move with the time zone.)
 */
import { formatDateCell, formatTimelineRange, isOverdue, parseDay, timelineDays, toDayString } from '../src/mobile/cells/format';

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

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
