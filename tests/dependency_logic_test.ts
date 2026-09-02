/**
 * Manual verification for the Finish-to-Start dependency helpers.
 * Run with:  npx tsx tests/dependency_logic_test.ts
 */
import {
    deltaDays,
    shiftValue,
    wouldCreateCycle,
    collectDownstream,
    resolveTimelineColumn,
    buildDependencyPath
} from '../src/lib/dependencyUtils';
import type { Column, Item, ItemDependency } from '../src/types';

let passed = 0;
let failed = 0;

const check = (label: string, actual: unknown, expected: unknown) => {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (ok) {
        passed++;
        console.log(`  PASS  ${label}`);
    } else {
        failed++;
        console.log(`  FAIL  ${label}\n        expected ${JSON.stringify(expected)}\n        actual   ${JSON.stringify(actual)}`);
    }
};

const dep = (predecessorItemId: string, successorItemId: string): ItemDependency => ({
    id: `${predecessorItemId}->${successorItemId}`,
    boardId: 'b1',
    predecessorItemId,
    successorItemId,
    type: 'FS',
    lagDays: 0
});

console.log('\ndeltaDays');
check('timeline forward', deltaDays('timeline', { from: '2026-09-01', to: '2026-09-10' }, { from: '2026-09-16', to: '2026-09-25' }), 15);
check('timeline backward', deltaDays('timeline', { from: '2026-09-16', to: '2026-09-25' }, { from: '2026-09-01', to: '2026-09-10' }), -15);
check('date column', deltaDays('date', '2026-01-31', '2026-02-03'), 3);
check('cleared value -> null', deltaDays('timeline', { from: '2026-09-01', to: '2026-09-10' }, null), null);
check('newly set value -> null', deltaDays('timeline', null, { from: '2026-09-01', to: '2026-09-10' }), null);
check('legacy ISO tolerated', deltaDays('date', '2026-09-01T00:00:00.000Z', '2026-09-03'), 2);

console.log('\nshiftValue (must always emit YYYY-MM-DD)');
check('timeline +15', shiftValue('timeline', { from: '2026-09-01', to: '2026-09-10' }, 15), { from: '2026-09-16', to: '2026-09-25' });
check('timeline -5 across month', shiftValue('timeline', { from: '2026-09-03', to: '2026-09-04' }, -5), { from: '2026-08-29', to: '2026-08-30' });
check('date +1 across year', shiftValue('date', '2026-12-31', 1), '2027-01-01');
check('leap day', shiftValue('date', '2028-02-28', 1), '2028-02-29');
check('timeline without end keeps none', shiftValue('timeline', { from: '2026-09-01', to: null }, 2), { from: '2026-09-03', to: null });
check('unparseable passes through', shiftValue('date', '', 3), '');

console.log('\ngraph');
const chain = [dep('A', 'B'), dep('B', 'C')];
check('downstream of A', [...collectDownstream(chain, 'A')].sort(), ['B', 'C']);
check('downstream of C is empty', [...collectDownstream(chain, 'C')], []);
check('C -> A would cycle', wouldCreateCycle(chain, 'C', 'A'), true);
check('A -> C is fine (diamond-ish)', wouldCreateCycle(chain, 'A', 'C'), false);
check('self link rejected', wouldCreateCycle(chain, 'A', 'A'), true);
check('unrelated pair fine', wouldCreateCycle(chain, 'D', 'E'), false);

console.log('\nresolveTimelineColumn (must match the Timeline view)');
const columns = [
    { id: 'c-text', title: 'Text', type: 'text' },
    { id: 'c-timeline', title: 'Timeline', type: 'timeline' },
    { id: 'c-due', title: 'Due', type: 'due_date' }
] as unknown as Column[];
const withTimeline = { id: 'i1', values: { 'c-timeline': { from: '2026-09-01', to: '2026-09-10' }, 'c-due': '2026-10-01' } } as unknown as Item;
const dueOnly = { id: 'i2', values: { 'c-due': '2026-10-01' } } as unknown as Item;
const emptyTimeline = { id: 'i3', values: { 'c-timeline': { to: '2026-09-10' }, 'c-due': '2026-10-01' } } as unknown as Item;
const nothing = { id: 'i4', values: {} } as unknown as Item;

check('prefers timeline over due_date', resolveTimelineColumn(columns, withTimeline)?.colId, 'c-timeline');
check('falls back to due_date', resolveTimelineColumn(columns, dueOnly)?.colId, 'c-due');
check('timeline with no start falls through', resolveTimelineColumn(columns, emptyTimeline)?.colId, 'c-due');
check('no dates -> null', resolveTimelineColumn(columns, nothing), null);

console.log('\nbuildDependencyPath');
const forward = buildDependencyPath({ x: 100, y: 18 }, { x: 300, y: 55 });
check('forward path starts at predecessor edge', forward.startsWith('M 100 18'), true);
check('forward path ends before the arrowhead', forward.endsWith('H 294'), true);
// Successor starts left of where the predecessor ends: the path has to step out,
// drop into the lane between the rows, run back, and come up — H V H V H.
const backward = buildDependencyPath({ x: 400, y: 18 }, { x: 120, y: 55 });
check('backward path detours', backward.split(' ').filter(t => 'HV'.includes(t)).length, 5);
check('backward path turns back left of the target', backward.includes('H 102'), true);

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
