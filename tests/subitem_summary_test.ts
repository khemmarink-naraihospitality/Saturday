/**
 * Manual verification for the sub-item summary rows and the aggregate maths.
 * Run with:  npx tsx tests/subitem_summary_test.ts
 */
import { groupItems, computeAggregates, SUMMARIZABLE_TYPES } from '../src/utils/grouping';
import { itemColumns, subitemColumns } from '../src/lib/columnScope';
import type { Column, Item } from '../src/types';

let passed = 0, failed = 0;
const check = (label: string, actual: unknown, expected: unknown) => {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (ok) { passed++; console.log(`  PASS  ${label}`); }
    else { failed++; console.log(`  FAIL  ${label}\n        expected ${JSON.stringify(expected)}\n        actual   ${JSON.stringify(actual)}`); }
};

const col = (id: string, type: Column['type'], scope: Column['scope'], extra: Partial<Column> = {}): Column => ({ id, title: id, type, order: 0, scope, ...extra });
const columns = [col('name2', 'text', 'item'), col('cost', 'number', 'subitem'), col('status', 'status', 'both'), col('notes', 'text', 'subitem')];
const item = (id: string, values: any, parentId?: string): Item => ({ id, title: id, groupId: 'g1', boardId: 'b', values, updates: [], order: 0, parentId } as unknown as Item);

console.log('\ncomputeAggregates');
const rows = [item('s1', { cost: '13600', status: 'done' }), item('s2', { cost: '14720', status: 'done' }), item('s3', { cost: 'abc', status: 'wip' })];
const agg = computeAggregates(subitemColumns(columns), rows);
check('sums numbers, ignoring unparseable ones', [agg.cost.sum, agg.cost.count], [28320, 2]);
check('status keeps every row\'s value for the bar', agg.status.values, ['done', 'done', 'wip']);
check('text columns get no summary but do not break', Object.keys(agg).sort(), ['cost', 'notes', 'status']);
check('an empty set is safe', computeAggregates(subitemColumns(columns), []).cost, { sum: 0, values: [], count: 0 });
check('priority always carries an avg, even with no ratings',
    computeAggregates([col('p', 'priority', 'both')], [item('x', {})]).p.avg, 0);

console.log('\nsummary rows in the virtual list');
const parent = item('p1', {});
const all = [parent, item('s1', { cost: '100' }, 'p1'), item('s2', { cost: '50' }, 'p1')];
const groups = [{ id: 'g1', title: 'G', color: '#f00', items: [] }] as any;
const list = groupItems(all, groups, null, [], ['p1'], itemColumns(columns), subitemColumns(columns));
const types = list.map(v => v.type);
check('order: header, sub-header, sub-items, add row, summary', types.slice(2), ['item', 'subitem-header', 'subitem', 'subitem', 'subitem-footer', 'subitem-summary', 'footer']);
const summary = list.find(v => v.type === 'subitem-summary')!;
check('summary totals the parent\'s sub-items over sub-item columns', [summary.data.count, summary.data.aggregates.cost.sum], [2, 150]);
check('it leaves out item-only columns', 'name2' in summary.data.aggregates, false);

const collapsed = groupItems(all, groups, null, [], [], itemColumns(columns), subitemColumns(columns));
check('no summary while the parent is collapsed', collapsed.some(v => v.type === 'subitem-summary'), false);
const noKids = groupItems([parent], groups, null, [], ['p1'], itemColumns(columns), subitemColumns(columns));
check('no summary for a parent with no sub-items', noKids.some(v => v.type === 'subitem-summary'), false);
const textOnly = groupItems(all, groups, null, [], ['p1'], itemColumns(columns), [col('t', 'text', 'subitem')]);
check('no summary when no sub-item column has anything to total', textOnly.some(v => v.type === 'subitem-summary'), false);
check('no sub-item columns passed = old behaviour (no summary)', groupItems(all, groups, null, [], ['p1'], itemColumns(columns)).some(v => v.type === 'subitem-summary'), false);
check('summarizable list covers the cell types', SUMMARIZABLE_TYPES.includes('number') && !SUMMARIZABLE_TYPES.includes('text'), true);

console.log('\ngroup footers still use item columns only');
const groupFooter = list.find(v => v.type === 'footer')!;
check('group aggregate has no sub-item-only column', 'cost' in groupFooter.data.aggregates, false);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
