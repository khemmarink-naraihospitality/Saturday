/**
 * Manual verification for the phone board table's geometry
 * (src/mobile/board/table/layout.ts): which rows are drawn, where each starts,
 * which group header is pinned at a given scroll, and how wide the frozen name
 * column is when scrolled sideways.
 * Run with:  npx tsx tests/mobile_table_test.ts
 */
import { GUTTER, ROW_HEIGHT, nameColumnWidth, rowOffsets, stickyGroupIndex, toTableRows } from '../src/mobile/board/table/layout';
import type { VirtualItemData } from '../src/utils/grouping';

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

const row = (type: VirtualItemData['type'], id: string): VirtualItemData => ({ type, id, data: {}, depth: 0 });

// groupItems' output for two groups, the first with an expanded parent.
const grouped: VirtualItemData[] = [
    row('group', 'A'),
    row('item', 'a1'),
    row('subitem-header', 'a1-h'),
    row('subitem', 'a1-s1'),
    row('subitem-footer', 'a1-f'),
    row('subitem-summary', 'a1-sum'),
    row('item', 'a2'),
    row('footer', 'A-foot'),
    row('group', 'B'),
    row('item', 'b1'),
    row('footer', 'B-foot'),
];

// toTableRows
const rows = toTableRows(grouped);
eq('summary rows dropped, a gap before every group but the first',
    rows.map(r => `${r.type}:${r.id}`),
    ['group:A', 'item:a1', 'subitem-header:a1-h', 'subitem:a1-s1', 'subitem-footer:a1-f', 'item:a2', 'footer:A-foot', 'gap:gap-B', 'group:B', 'item:b1', 'footer:B-foot']);
eq('no rows, no gaps', toTableRows([]), []);
eq('a single group gets no gap', toTableRows([row('group', 'X'), row('footer', 'X-f')]).map(r => r.type), ['group', 'footer']);

// rowOffsets
const { offsets, total } = rowOffsets(rows);
const expectedTotal = rows.reduce((sum, r) => sum + ROW_HEIGHT[r.type], 0);
eq('total height is the sum of fixed heights', total, expectedTotal);
eq('first row starts at 0', offsets[0], 0);
check('offsets are prefix sums', offsets.every((y, i) => i === 0 || y === offsets[i - 1] + ROW_HEIGHT[rows[i - 1].type]));
eq('empty table', rowOffsets([]), { offsets: [], total: 0 });

// stickyGroupIndex
const groupB = rows.findIndex(r => r.id === 'B');
eq('at the very top nothing is pinned (the real header is in place)', stickyGroupIndex(rows, offsets, 0), null);
eq('a pixel down, group A pins', stickyGroupIndex(rows, offsets, 1), 0);
eq('inside A (over its sub-items), A stays pinned', stickyGroupIndex(rows, offsets, offsets[3] + 5), 0);
eq('over the gap before B, A is still pinned', stickyGroupIndex(rows, offsets, offsets[groupB - 1] + 2), 0);
eq('B exactly at the top: its own header shows, no copy', stickyGroupIndex(rows, offsets, offsets[groupB]), null);
eq('past B\'s header, B pins', stickyGroupIndex(rows, offsets, offsets[groupB] + 1), groupB);
eq('scrolled past the end, the last group pins', stickyGroupIndex(rows, offsets, total + 500), groupB);
eq('no rows', stickyGroupIndex([], [], 100), null);
eq('rows without a group header (defensive)', stickyGroupIndex([row('item', 'x')], [0], 10), null);

// nameColumnWidth
const BASE = 318;
const MIN = 166;
eq('at rest: full width', nameColumnWidth(0, BASE, MIN), BASE);
eq('while the gutter scrolls away: still full width', nameColumnWidth(GUTTER, BASE, MIN), BASE);
eq('then one pixel narrower per pixel', nameColumnWidth(GUTTER + 40, BASE, MIN), BASE - 40);
eq('never below the minimum', nameColumnWidth(5000, BASE, MIN), MIN);
eq('exactly reaches the minimum', nameColumnWidth(GUTTER + (BASE - MIN), BASE, MIN), MIN);
eq('negative scroll (iOS rubber band) keeps full width', nameColumnWidth(-30, BASE, MIN), BASE);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
