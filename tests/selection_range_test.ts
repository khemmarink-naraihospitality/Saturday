/**
 * Manual verification for src/lib/selectionRange.ts — Shift-click range
 * selection over the rows the table draws.
 * Run with:  npx tsx tests/selection_range_test.ts
 */
import { checkableRows, rangeBetween, type CheckableRow } from '../src/lib/selectionRange';

let passed = 0;
let failed = 0;
const eq = (name: string, got: unknown, want: unknown) => {
    if (JSON.stringify(got) === JSON.stringify(want)) passed++;
    else { failed++; console.log(`FAIL ${name} — ${JSON.stringify(got)} vs ${JSON.stringify(want)}`); }
};

const item = (id: string): CheckableRow => ({ id, level: 'item' });
const sub = (id: string): CheckableRow => ({ id, level: 'subitem' });

// What the table draws: group bars, items, sub-item rows with their own header / add row / summary, footers.
const drawn = [
    { type: 'group', id: 'g1' }, { type: 'item', id: 'i1' }, { type: 'item', id: 'i2' },
    { type: 'subitem-header', id: 'i2-sub-header' }, { type: 'subitem', id: 's1' }, { type: 'subitem', id: 's2' }, { type: 'subitem-footer', id: 'i2-sub-footer' },
    { type: 'item', id: 'i3' }, { type: 'item', id: 'i4' }, { type: 'footer', id: 'g1-footer' },
    { type: 'group', id: 'g2' }, { type: 'item', id: 'i5' }, { type: 'footer', id: 'g2-footer' },
] as const;
const rows = checkableRows([...drawn]);

eq('only items and sub-items have a checkbox', rows.map(r => r.id), ['i1', 'i2', 's1', 's2', 'i3', 'i4', 'i5']);
eq('their level is kept', rows.map(r => r.level), ['item', 'item', 'subitem', 'subitem', 'item', 'item', 'item']);

// The case from the report: first item, Shift, fourth item — all four.
const four = [item('a'), item('b'), item('c'), item('d'), item('e')];
eq('first to fourth selects all four', rangeBetween(four, 'a', 'd'), ['a', 'b', 'c', 'd']);
eq('the other way round (fourth, then Shift on the first)', rangeBetween(four, 'd', 'a'), ['a', 'b', 'c', 'd']);
eq('the same row is a range of one', rangeBetween(four, 'c', 'c'), ['c']);
eq('neighbours', rangeBetween(four, 'b', 'c'), ['b', 'c']);
eq('to the very end', rangeBetween(four, 'b', 'e'), ['b', 'c', 'd', 'e']);

// Sub-items drawn between top-level items are not swept up, and a parent is not mixed with its own sub-items.
eq('top-level range skips the sub-items between', rangeBetween(rows, 'i1', 'i4'), ['i1', 'i2', 'i3', 'i4']);
eq('range across groups takes what is drawn between', rangeBetween(rows, 'i3', 'i5'), ['i3', 'i4', 'i5']);
eq('sub-item range stays among sub-items', rangeBetween(rows, 's1', 's2'), ['s1', 's2']);
eq('item to sub-item is no range', rangeBetween(rows, 'i1', 's2'), null);
eq('sub-item to item is no range', rangeBetween(rows, 's1', 'i3'), null);

// Rows that are not on screen (filtered out, in a collapsed group, deleted) give no range.
eq('an end that is not drawn', rangeBetween(four, 'a', 'zzz'), null);
eq('a start that is not drawn', rangeBetween(four, 'gone', 'c'), null);
eq('nothing drawn', rangeBetween([], 'a', 'b'), null);

// A filter or a sort changes the order: the range follows what is drawn, not the ids.
const sorted = [item('d'), item('b'), item('a'), item('c')];
eq('follows the displayed order', rangeBetween(sorted, 'b', 'c'), ['b', 'a', 'c']);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
