/**
 * Manual verification for column scope (items vs sub-items).
 * Run with:  npx tsx tests/column_scope_test.ts
 */
import { arrayMove } from '@dnd-kit/sortable';
import { itemColumns, subitemColumns, insertIndexAfter, scopeOf } from '../src/lib/columnScope';
import type { Column } from '../src/types';

let passed = 0;
let failed = 0;
const check = (label: string, actual: unknown, expected: unknown) => {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (ok) { passed++; console.log(`  PASS  ${label}`); }
    else { failed++; console.log(`  FAIL  ${label}\n        expected ${JSON.stringify(expected)}\n        actual   ${JSON.stringify(actual)}`); }
};
const col = (id: string, scope?: Column['scope']): Column => ({ id, title: id, type: 'text', order: 0, scope });
const ids = (cols: Column[]) => cols.map(c => c.id);

// Full board order: status(both) · price(item) · owner(sub) · date(both) · cost(sub)
const board = [col('status', 'both'), col('price', 'item'), col('owner', 'subitem'), col('date', 'both'), col('cost', 'subitem')];

console.log('\nwhich rows show a column');
check('items see item + both, in board order', ids(itemColumns(board)), ['status', 'price', 'date']);
check('sub-items see subitem + both, in board order', ids(subitemColumns(board)), ['status', 'owner', 'date', 'cost']);
check('a column with no scope counts as both', scopeOf(col('legacy')), 'both');
check('legacy columns appear on both header rows',
    [ids(itemColumns([col('a'), col('b')])), ids(subitemColumns([col('a'), col('b')]))], [['a', 'b'], ['a', 'b']]);

console.log('\n"add column to the right" from a header that hides some columns');
// In the sub-item header the user sees status · owner · date · cost and picks "add right" on owner.
check('lands right after owner in the FULL list, not at its on-screen index + 1', insertIndexAfter(board, 'owner'), 3);
check('the on-screen index would have been wrong', subitemColumns(board).findIndex(c => c.id === 'owner') + 1, 2);
check('no anchor means append', insertIndexAfter(board, null), undefined);

console.log('\ndragging within a filtered header (moveColumn by id over the full list)');
const move = (list: Column[], from: string, to: string) =>
    arrayMove(list, list.findIndex(c => c.id === from), list.findIndex(c => c.id === to));
// Sub-item header: drag "cost" onto "owner". An item-only column (price) sits between.
const moved = move(board, 'cost', 'owner');
check('relative order in the sub-item header is what was dragged', ids(subitemColumns(moved)), ['status', 'cost', 'owner', 'date']);
check('the item header is unaffected', ids(itemColumns(moved)), ['status', 'price', 'date']);
check('nothing is lost or duplicated', ids(moved).sort(), ids(board).sort());

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
