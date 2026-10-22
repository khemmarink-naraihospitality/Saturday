/**
 * Manual verification for src/lib/itemChangeText.ts.
 * Run with:  npx tsx tests/item_change_text_test.ts
 */
import { describeChange } from '../src/lib/itemChangeText';

let passed = 0;
let failed = 0;
const eq = (name: string, got: unknown, want: unknown) => {
    if (JSON.stringify(got) === JSON.stringify(want)) passed++;
    else { failed++; console.log(`FAIL ${name} — ${JSON.stringify(got)} vs ${JSON.stringify(want)}`); }
};

const col = (type: string, title = 'Field', options?: { id: string; label: string; color: string }[]) => ({ title, type: type as never, options });

eq('due date', describeChange(col('due_date', 'Due Date'), '2026-10-30', '2026-11-05'), 'Due Date: Oct 30, 2026 → Nov 5, 2026');
eq('date set from empty', describeChange(col('date', 'Renewal'), null, '2026-01-02'), 'Renewal: empty → Jan 2, 2026');
eq('timeline', describeChange(col('timeline', 'Plan'), { from: '2026-10-01', to: '2026-10-20' }, { from: '2026-10-05', to: '2026-10-25' }), 'Plan: Oct 1, 2026 – Oct 20, 2026 → Oct 5, 2026 – Oct 25, 2026');
eq('status by option label', describeChange(col('status', 'Stage', [{ id: 'a', label: 'Working', color: '#fff' }, { id: 'b', label: 'Done', color: '#fff' }]), 'a', 'b'), 'Stage: Working → Done');
eq('dropdown labels', describeChange(col('dropdown', 'Tags'), ['A'], ['A', 'B']), 'Tags: A → A, B');
eq('dropdown cleared', describeChange(col('dropdown', 'Tags'), ['A'], []), 'Tags: A → empty');
eq('checkbox', describeChange(col('checkbox', 'Approved'), false, true), 'Approved: unchecked → checked');
eq('priority', describeChange(col('priority', 'Priority'), 2, 4), 'Priority: 2 of 5 → 4 of 5');
eq('number', describeChange(col('number', 'Cost'), 100, 250), 'Cost: 100 → 250');
eq('long text is clipped', describeChange(col('text', 'Note'), 'a', 'x'.repeat(200))?.endsWith('…'), true);
eq('people never notifies here', describeChange(col('people', 'Person'), ['a'], ['b']), null);
eq('files never notifies here', describeChange(col('files', 'Files'), [], [{}]), null);
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
