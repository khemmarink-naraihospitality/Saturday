/**
 * Manual verification for the dashboard Timeline widget's row logic
 * (src/lib/workspaceTimeline.ts).
 * Run with:  npx tsx tests/workspace_timeline_test.ts
 */
import {
    buildTimelineRows, resolveItemDates, sortRows, sectionRows, matchesSearch, NO_STATUS_SECTION,
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
    { id: 'B1-status', board_id: 'B1', type: 'status', order: 0, options: [{ id: 'o-done', label: 'Done', color: '#00c875' }, { id: 'o-work', label: 'Working', color: '#fdab3d' }] },
    { id: 'B2-due', board_id: 'B2', type: 'due_date', order: 1 },
    { id: 'B2-status', board_id: 'B2', type: 'status', order: 0, options: [{ id: 'p-done', label: 'done', color: '#00c875' }] },
    { id: 'B2-text', board_id: 'B2', type: 'text', order: 2 }
];
const item = (over: Partial<TimelineSourceItem> & { id: string }): TimelineSourceItem => ({
    title: over.id, board_id: 'B1', group_id: 'G1', values: {}, is_hidden: false, parent_id: null, order: 0, ...over
});
const items: TimelineSourceItem[] = [
    item({ id: 'a', title: 'Launch page', values: { 'B1-tl': { from: '2026-03-01', to: '2026-03-31' }, 'B1-status': 'o-work' }, order: 2 }),
    item({ id: 'b', title: 'Banner', group_id: 'G2', values: { 'B1-date': '2026-05-10', 'B1-status': 'o-done' }, order: 1 }),
    item({ id: 'c', title: 'Audit prep', board_id: 'B2', group_id: 'G3', values: { 'B2-due': '2026-02-15', 'B2-status': 'p-done' } }),
    item({ id: 'd', title: 'No dates at all', values: { 'B1-status': 'o-work' } }),
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
const rows = buildTimelineRows({ items, columns, boards, groupsByBoard, showHidden: false });
const ids = (rs: { id: string }[]) => rs.map(r => r.id).sort().join(',');
check('dated top-level, visible items only', ids(rows) === 'a,b,c,i', ids(rows));
check('hidden items appear when asked', ids(buildTimelineRows({ items, columns, boards, groupsByBoard, showHidden: true })) === 'a,b,c,e,i');
const rowA = rows.find(r => r.id === 'a')!;
check('row carries board and group', rowA.boardTitle === 'Marketing' && rowA.groupTitle === 'Q1' && rowA.groupColor === '#00c875');
check('row carries status label and colour', rowA.statusLabel === 'Working' && rowA.statusColor === '#fdab3d');
check('due_date column is used', rows.find(r => r.id === 'c')!.start.getTime() === day('2026-02-15'));
check('another board has its own options', rows.find(r => r.id === 'c')!.statusLabel === 'done');
check('unknown group is tolerated', buildTimelineRows({ items: [item({ id: 'x', group_id: 'GONE', values: { 'B1-date': '2026-05-10' } })], columns, boards, groupsByBoard, showHidden: false })[0].groupTitle === '');
check('empty input', buildTimelineRows({ items: [], columns: [], boards: [], groupsByBoard: new Map(), showHidden: false }).length === 0);
check('missing title becomes Untitled', buildTimelineRows({ items: [item({ id: 'x', title: null, values: { 'B1-date': '2026-05-10' } })], columns, boards, groupsByBoard, showHidden: false })[0].title === 'Untitled');

// ---- sortRows ------------------------------------------------------------------
check('default: board, then group, then item order', sortRows(rows, null).map(r => r.id).join(',') === 'a,i,b,c', sortRows(rows, null).map(r => r.id).join(','));
check('by name', sortRows(rows, { key: 'name', direction: 'asc' }).map(r => r.id).join(',') === 'c,b,i,a');
check('by name desc', sortRows(rows, { key: 'name', direction: 'desc' }).map(r => r.id).join(',') === 'a,i,b,c');
check('by start asc', sortRows(rows, { key: 'start', direction: 'asc' }).map(r => r.id).join(',') === 'c,a,b,i');
check('by start desc', sortRows(rows, { key: 'start', direction: 'desc' }).map(r => r.id).join(',') === 'i,b,a,c');
check('by end asc', sortRows(rows, { key: 'end', direction: 'asc' }).map(r => r.id).join(',') === 'c,a,b,i');
check('by board desc keeps item order inside a board', sortRows(rows, { key: 'board', direction: 'desc' }).map(r => r.id).join(',') === 'c,a,i,b');
const before = rows.map(r => r.id).join(',');
sortRows(rows, { key: 'name', direction: 'desc' });
check('sorting does not mutate its input', rows.map(r => r.id).join(',') === before);

// ---- sectionRows ---------------------------------------------------------------
const sorted = sortRows(rows, null);
check('none: one headerless section', sectionRows(sorted, 'none').length === 1 && sectionRows(sorted, 'none')[0].label === '');
check('none with no rows: no sections', sectionRows([], 'none').length === 0);
const byBoard = sectionRows(sorted, 'board');
check('by board: sections in board order', byBoard.map(s => s.label).join('|') === 'Marketing|Finance');
check('by board: rows grouped', byBoard[0].rows.length === 3 && byBoard[1].rows.length === 1);
const byGroup = sectionRows(sorted, 'group');
check('by group: board then group order', byGroup.map(s => s.label).join('|') === 'Q1|Q2|Audit', byGroup.map(s => s.label).join('|'));
check('by group: carries the board name and group colour', byGroup[0].sublabel === 'Marketing' && byGroup[0].color === '#00c875');
const byStatus = sectionRows(sorted, 'status');
check('by status: alphabetical, unstatused last', byStatus.map(s => s.label).join('|') === 'Done|Working|No status', byStatus.map(s => s.label).join('|'));
check('by status: "Done" and "done" are one section', byStatus.filter(s => s.label.toLowerCase() === 'done').length === 1 && byStatus.find(s => s.label.toLowerCase() === 'done')!.rows.length === 2);
const withNone = sectionRows(sortRows(buildTimelineRows({ items: [...items, item({ id: 'z', title: 'Z', values: { 'B1-date': '2026-08-01' } })], columns, boards, groupsByBoard, showHidden: false }), null), 'status');
check('by status: items with no status go last', withNone[withNone.length - 1].key === NO_STATUS_SECTION && withNone[withNone.length - 1].label === 'No status');
const sortedByNameBoard = sectionRows(sortRows(rows, { key: 'name', direction: 'desc' }), 'board');
check('an explicit sort does not reorder board sections', sortedByNameBoard.map(s => s.label).join('|') === 'Marketing|Finance');

// ---- search --------------------------------------------------------------------
check('search matches case-insensitively', matchesSearch(rowA, 'LAUNCH') && matchesSearch(rowA, 'page') && !matchesSearch(rowA, 'banner'));
check('blank search matches everything', matchesSearch(rowA, '') && matchesSearch(rowA, '   '));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
