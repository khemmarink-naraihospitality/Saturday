/**
 * Manual verification for column sets: items and each group's sub-items have
 * their own columns.
 * Run with:  npx tsx tests/column_scope_test.ts
 */
import { arrayMove } from '@dnd-kit/sortable';
import { itemColumns, subitemColumns, siblingColumns, replaceSet, scopeOf, hasValue, planCarry, splitSharedColumns } from '../src/lib/columnScope';
import type { Column } from '../src/types';

let passed = 0;
let failed = 0;
// Key order inside objects doesn't matter; array order does.
const canon = (v: unknown): string => JSON.stringify(v, (_k, x) =>
    x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x);
const check = (label: string, actual: unknown, expected: unknown) => {
    const ok = canon(actual) === canon(expected);
    if (ok) { passed++; console.log(`  PASS  ${label}`); }
    else { failed++; console.log(`  FAIL  ${label}\n        expected ${JSON.stringify(expected)}\n        actual   ${JSON.stringify(actual)}`); }
};
let seq = 0;
const newId = () => `new${++seq}`;
const col = (id: string, scope: Column['scope'], groupId?: string, extra: Partial<Column> = {}): Column =>
    ({ id, title: id, type: 'text', order: 0, scope, groupId, ...extra });
const ids = (cols: { id: string }[]) => cols.map(c => c.id);

// Board order: price(item) · ownerA(sub, A) · status(item) · costB(sub, B) · dateA(sub, A)
const board = [col('price', 'item'), col('ownerA', 'subitem', 'A'), col('status', 'item'), col('costB', 'subitem', 'B'), col('dateA', 'subitem', 'A')]
    .map((c, i) => ({ ...c, order: i + 1 }));

console.log('\nwhich rows show a column');
check('items see only item columns', ids(itemColumns(board)), ['price', 'status']);
check("group A's sub-items see only A's columns", ids(subitemColumns(board, 'A')), ['ownerA', 'dateA']);
check("group B's sub-items see only B's", ids(subitemColumns(board, 'B')), ['costB']);
check('a group with none sees none', ids(subitemColumns(board, 'C')), []);
check('no group, no sub-item columns', ids(subitemColumns(board, undefined)), []);
check('a column with no scope is an item column', scopeOf(col('legacy', undefined)), 'item');
check("a column's siblings are its own set", ids(siblingColumns(board, board[1])), ['ownerA', 'dateA']);

console.log('\nreordering one set leaves the others alone');
const movedA = replaceSet(board, arrayMove(subitemColumns(board, 'A'), 1, 0));
check("A's new order", ids(subitemColumns(movedA, 'A')), ['dateA', 'ownerA']);
check('items unchanged', ids(itemColumns(movedA)), ['price', 'status']);
check("B unchanged", ids(subitemColumns(movedA, 'B')), ['costB']);
check('only the set is renumbered', movedA.filter(c => c.id === 'price' || c.id === 'costB').map(c => c.order), [1, 4]);
check('nothing lost or duplicated', ids(movedA).sort(), ids(board).sort());

console.log('\nwhat counts as a value');
check('empty-ish values', [null, undefined, '', '  ', [], {}, { from: null, to: '' }, false].map(hasValue), [false, false, false, false, false, false, false, false]);
check('real values', ['x', 0, ['a'], { from: '2026-01-01' }, true].map(hasValue), [true, true, true, true, true]);

console.log('\ncarrying values to another group\'s columns');
const status = (id: string, groupId: string, labels: [string, string][]) =>
    col(id, 'subitem', groupId, { title: 'Status', type: 'status', options: labels.map(([oid, label]) => ({ id: oid, label, color: '#000' })) });
const fromCols = [status('sA', 'A', [['a-done', 'Done'], ['a-stuck', 'Stuck']]), col('noteA', 'subitem', 'A', { title: 'Note' }), col('emptyA', 'subitem', 'A', { title: 'Empty' })];
const toCols = [status('sB', 'B', [['b-done', 'Done']])];
const rows = [{ values: { sA: 'a-done', noteA: 'hello' } }, { values: { sA: 'a-stuck' } }];
const plan = planCarry(rows, fromCols, toCols, { scope: 'subitem', groupId: 'B' }, newId);
check('same-named column is matched, status mapped by label', plan.remap(rows[0].values), { sB: 'b-done', new1: 'hello' });
check('a label the target lacks is added to it', plan.updated.map(c => (c.options || []).map(o => o.label)), [['Done', 'Stuck']]);
check('...and the value points at the added option', plan.remap(rows[1].values).sB, 'a-stuck');
check('an unmatched column with values is cloned into the target group', plan.created.map(c => [c.title, c.scope, c.groupId]), [['Note', 'subitem', 'B']]);
check('a column with no values is left behind', plan.created.some(c => c.title === 'Empty'), false);
const noCreate = planCarry(rows, fromCols, [], { scope: 'item' }, newId, false);
check('without createMissing nothing is added, values stay put', [noCreate.created.length, noCreate.remap(rows[0].values)], [0, { sA: 'a-done', noteA: 'hello' }]);

console.log('\nsplitting legacy shared columns (backup restore / Excel import)');
const groups = [{ id: 'G1', order: 0 }, { id: 'G2', order: 1 }, { id: 'G3', order: 2 }];
const items = [
    { id: 'p1', group_id: 'G1', parent_id: null, values: { shared: 'item-val' } },
    { id: 'p2', group_id: 'G2', parent_id: null, values: {} },
    { id: 's1', group_id: 'G1', parent_id: 'p1', values: { shared: 'sub-1', subOnly: 'x', subFlag: 'y' } },
    // stale group_id: its parent (p2) is in G2, so it belongs to G2's sub-item columns
    { id: 's2', group_id: 'G1', parent_id: 'p2', values: { shared: 'sub-2' } },
    { id: 'gone', group_id: 'G3', parent_id: 'p2', values: { shared: 'archived' }, is_archived: true },
];
const legacy = [
    { id: 'shared', scope: 'both' }, { id: 'subOnly', scope: 'both' }, { id: 'itemOnly', scope: undefined },
    { id: 'subFlag', scope: 'subitem', group_id: null }, { id: 'kept', scope: 'subitem', group_id: 'G1' },
];
seq = 0;
const split = splitSharedColumns(legacy, items, groups, newId);
const shape = split.columns.map(c => `${c.id}:${c.scope}:${c.group_id ?? '-'}`);
check('shared column: stays the items\', copies for G1 and G2 (by parent)', shape.filter(s => s.startsWith('shared') || s.startsWith('new1') || s.startsWith('new2')), ['shared:item:-', 'new1:subitem:G1', 'new2:subitem:G2']);
check('used only by sub-items: becomes G1\'s, no copy for items', shape.filter(s => s.startsWith('subOnly')), ['subOnly:subitem:G1']);
check('used by nobody: the items\'', shape.filter(s => s.startsWith('itemOnly')), ['itemOnly:item:-']);
check('groupless sub-item column: every group with live sub-items', shape.filter(s => s.startsWith('subFlag') || s === 'new3:subitem:G2'), ['subFlag:subitem:G1', 'new3:subitem:G2']);
check('already-scoped column passes through', shape.filter(s => s.startsWith('kept')), ['kept:subitem:G1']);
const v = (id: string) => split.items.find(i => i.id === id)!.values;
check('item keeps its value under the item column', v('p1'), { shared: 'item-val' });
check("sub-item's value moved to its group's copy", v('s1'), { new1: 'sub-1', subOnly: 'x', subFlag: 'y' });
check('stale group_id: value follows the parent\'s group', v('s2'), { new2: 'sub-2' });
check('archived rows move with their group but do not create columns', [v('gone'), shape.some(s => s.endsWith(':G3'))], [{ new2: 'archived' }, false]);
check('every live value is under a column its row shows', items.filter(i => !('is_archived' in i)).every(i => {
    const row = split.items.find(r => r.id === i.id)!;
    const group = i.parent_id ? items.find(p => p.id === i.parent_id)!.group_id : null;
    return Object.keys(row.values).every(k => split.columns.some(c => c.id === k &&
        (i.parent_id ? c.scope === 'subitem' && c.group_id === group : c.scope === 'item')));
}), true);
check('current-shape input is left as it is', splitSharedColumns([{ id: 'a', scope: 'item' }, { id: 'b', scope: 'subitem', group_id: 'G1' }], items, groups, newId).columns.map(c => c.id), ['a', 'b']);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
