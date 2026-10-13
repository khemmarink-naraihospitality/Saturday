/**
 * Manual verification for the dashboard Timeline widget's row logic
 * (src/lib/workspaceTimeline.ts).
 * Run with:  npx tsx tests/workspace_timeline_test.ts
 */
import {
    buildTimelineRows, resolveItemDates, orderRows,
    type TimelineSourceItem, type TimelineSourceColumn
} from '../src/lib/workspaceTimeline';

let passed = 0;
let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) passed++;
    else {
        failed++;
        console.log(`FAIL ${name}${detail ? ` — ${detail}` : ''}`);
    }
};
const day = (s: string) => new Date(s).getTime();

// ---- fixtures ----------------------------------------------------------------
const boards = [{ id: 'B1', title: 'Marketing' }, { id: 'B2', title: 'Finance' }];
const groupsByBoard = new Map([
    ['B1', [{ id: 'G1', title: 'Q1', color: '#00c875' }, { id: 'G2', title: 'Q2', color: '#fdab3d' }]],
    ['B2', [{ id: 'G3', title: 'Audit', color: '#579bfc' }]]
]);
const columns: TimelineSourceColumn[] = [
    // listed out of order on purpose: the builder sorts by `order`
    { id: 'B1-date', board_id: 'B1', type: 'date', order: 2 },
    { id: 'B1-tl', board_id: 'B1', type: 'timeline', order: 1 },
    { id: 'B2-due', board_id: 'B2', type: 'due_date', order: 1 },
    { id: 'B2-text', board_id: 'B2', type: 'text', order: 2 }
];
const item = (over: Partial<TimelineSourceItem> & { id: string }): TimelineSourceItem => ({
    title: over.id, board_id: 'B1', group_id: 'G1', values: {}, is_hidden: false, parent_id: null, order: 0, ...over
});
const items: TimelineSourceItem[] = [
    item({ id: 'a', title: 'Launch page', values: { 'B1-tl': { from: '2026-03-01', to: '2026-03-31' } }, order: 2 }),
    item({ id: 'b', title: 'Banner', group_id: 'G2', values: { 'B1-date': '2026-05-10' }, order: 1 }),
    item({ id: 'c', title: 'Audit prep', board_id: 'B2', group_id: 'G3', values: { 'B2-due': '2026-02-15' } }),
    item({ id: 'd', title: 'No dates at all', values: {} }),
    item({ id: 'e', title: 'Hidden one', is_hidden: true, values: { 'B1-date': '2026-06-01' } }),
    item({ id: 'f', title: 'A sub-item', parent_id: 'a', values: { 'B1-date': '2026-03-05' } }),
    item({ id: 'g', title: 'Timeline without an end', values: { 'B1-tl': { from: '2026-04-01' } } }),
    item({ id: 'h', title: 'Garbage date', values: { 'B1-date': 'not a date' } }),
    item({ id: 'i', title: 'Both date columns', values: { 'B1-tl': { from: '2026-07-01', to: '2026-07-10' }, 'B1-date': '2026-01-01' }, order: 3 })
];

// ---- resolveItemDates ----------------------------------------------------------
const b1Dates = columns.filter(c => c.board_id === 'B1' && ['timeline', 'date', 'due_date'].includes(c.type)).sort((x, y) => (x.order ?? 0) - (y.order ?? 0));
const r1 = resolveItemDates(b1Dates, { 'B1-tl': { from: '2026-03-01', to: '2026-03-31' } });
check('timeline gives from → to', !!r1 && r1.start.getTime() === day('2026-03-01') && r1.end.getTime() === day('2026-03-31'));
const r2 = resolveItemDates(b1Dates, { 'B1-date': '2026-05-10' });
check('a single date is a one-day bar', !!r2 && r2.start.getTime() === r2.end.getTime());
check('first column with a value wins (timeline before date)', resolveItemDates(b1Dates, { 'B1-tl': { from: '2026-07-01', to: '2026-07-10' }, 'B1-date': '2026-01-01' })?.start.getTime() === day('2026-07-01'));
check('no values → null', resolveItemDates(b1Dates, {}) === null && resolveItemDates(b1Dates, null) === null);
check('timeline with no end → null (as on the board)', resolveItemDates(b1Dates, { 'B1-tl': { from: '2026-04-01' } }) === null);
check('unparseable date → null', resolveItemDates(b1Dates, { 'B1-date': 'not a date' }) === null);
check('empty timeline falls through to the date column', resolveItemDates(b1Dates, { 'B1-tl': { from: '', to: '' }, 'B1-date': '2026-05-10' })?.start.getTime() === day('2026-05-10'));

// ---- buildTimelineRows ---------------------------------------------------------
const rows = buildTimelineRows({ items, columns, boards, groupsByBoard });
const ids = (rs: { id: string }[]) => rs.map(r => r.id).sort().join(',');
check('dated top-level, visible items only', ids(rows) === 'a,b,c,i', ids(rows));
check('hidden items are left out', !rows.some(r => r.id === 'e'));
const rowA = rows.find(r => r.id === 'a')!;
check('row carries board and group', rowA.boardTitle === 'Marketing' && rowA.groupTitle === 'Q1' && rowA.groupColor === '#00c875');
check('due_date column is used', rows.find(r => r.id === 'c')!.start.getTime() === day('2026-02-15'));
check('unknown group is tolerated', buildTimelineRows({ items: [item({ id: 'x', group_id: 'GONE', values: { 'B1-date': '2026-05-10' } })], columns, boards, groupsByBoard })[0].groupTitle === '');
check('empty input', buildTimelineRows({ items: [], columns: [], boards: [], groupsByBoard: new Map() }).length === 0);
check('missing title becomes Untitled', buildTimelineRows({ items: [item({ id: 'x', title: null, values: { 'B1-date': '2026-05-10' } })], columns, boards, groupsByBoard })[0].title === 'Untitled');

// ---- orderRows -----------------------------------------------------------------
check('board, then group, then item order', orderRows(rows).map(r => r.id).join(',') === 'a,i,b,c', orderRows(rows).map(r => r.id).join(','));
const before = rows.map(r => r.id).join(',');
orderRows(rows);
check('ordering does not mutate its input', rows.map(r => r.id).join(',') === before);
check('ordering an empty list', orderRows([]).length === 0);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
