/**
 * Manual verification for src/lib/boardSummary.ts, the AI Summary tab's
 * calculated section (and the facts it hands to Gemini).
 * Run with:  npx tsx tests/board_summary_test.ts
 */
import { statusKind, summarizeBoard, geminiPayload, deadlineColumnsOf, columnNames, findingText, type SummaryLog } from '../src/lib/boardSummary';
import { dayFromISO } from '../src/lib/formula/engine';
import type { Board, Column, Item } from '../src/types';
import type { Terms } from '../src/lib/terms';

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
    check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const T: Terms = {
    Board: 'Space', Boards: 'Spaces', board: 'space', boards: 'spaces',
    Workspace: 'Space Folder', Workspaces: 'Space Folders', workspace: 'space folder', workspaces: 'space folders',
    Group: 'Task Group', Groups: 'Task Groups', group: 'task group', groups: 'task groups',
    Item: 'Task', Items: 'Tasks', item: 'task', items: 'tasks',
    Subitem: 'Subtask', Subitems: 'Subtasks', subitem: 'subtask', subitems: 'subtasks',
    Update: 'Comment', Updates: 'Comments', update: 'comment', updates: 'comments',
    mainTable: 'Table',
};

// ---- labels ----------------------------------------------------------------------
const kinds: [string, string][] = [
    ['Done', 'done'], ['done ✅', 'done'], ['Completed', 'done'], ['Compleated', 'done'], ['Complete 100%', 'done'],
    ['Finished', 'done'], ['Ended', 'done'], ['Approved', 'done'], ['เสร็จแล้ว', 'done'], ['เรียบร้อย', 'done'],
    ['Not done', 'active'], ['ยังไม่เสร็จ', 'active'], ['Complaint', 'active'],
    ['SKIP', 'stopped'], ['Skip', 'stopped'], ['Cancelled', 'stopped'], ['Lost', 'stopped'], ['N/A', 'stopped'], ['ยกเลิก', 'stopped'], ['No need', 'stopped'],
    ['Stuck', 'stuck'], ['Blocked', 'stuck'], ['On Hold', 'stuck'], ['Waiting', 'stuck'], ['Need Decision', 'stuck'], ['Paused', 'stuck'], ['รออนุมัติ', 'stuck'], ['ติดปัญหา', 'stuck'],
    ['Waiver', 'active'], ['รอบที่ 2', 'active'], ['ติดตาม', 'active'], ['No issue', 'active'],
    ['Not Start yet', 'not_started'], ['Not started', 'not_started'], ['To Do', 'not_started'], ['ยังไม่เริ่ม', 'not_started'], ['Default', 'not_started'], ['', 'not_started'],
    ['Working on it', 'active'], ['In Progress', 'active'], ['Need to Inform', 'active'], ['Some Update', 'active'], ['Coming', 'active'],
];
kinds.forEach(([label, want]) => eq(`statusKind(${JSON.stringify(label)})`, statusKind(label), want));

// ---- a board -----------------------------------------------------------------------
const col = (id: string, type: Column['type'], title: string, order: number, extra: Partial<Column> = {}): Column => ({ id, type, title, order, ...extra });
const status = col('st', 'status', 'Status', 1, {
    options: [
        { id: 'o-ns', label: 'Not Start yet', color: '#c4c4c4' },
        { id: 'o-wo', label: 'Working on it', color: '#fdab3d' },
        { id: 'o-dn', label: 'Done', color: '#00c875' },
        { id: 'o-st', label: 'Stuck', color: '#e2445c' },
        { id: 'o-sk', label: 'SKIP', color: '#333333' },
    ],
});
const status2 = col('st2', 'status', 'Status', 5, { options: [{ id: 'p-c', label: 'Compleated', color: '#00c875' }, { id: 'p-w', label: 'Working on it', color: '#fdab3d' }] });
const person = col('pp', 'people', 'Person', 2);
const timeline = col('tl', 'timeline', 'Timeline', 4);
const due = col('dd', 'due_date', 'Due Date', 8);
const start = col('sd', 'date', 'Start date', 9);
const prio = col('pr', 'priority', 'Priority', 6);
const note = col('tx', 'text', 'Notes', 7);
const subStatus = col('sst', 'status', 'Status', 1, { scope: 'subitem', groupId: 'g1', options: [{ id: 's-d', label: 'Done', color: '#00c875' }, { id: 's-w', label: 'Working on it', color: '#fdab3d' }] });

let seq = 0;
const item = (groupId: string, title: string, values: Record<string, unknown>, extra: Partial<Item> = {}): Item =>
    ({ id: `i${++seq}`, title, groupId, boardId: 'b1', values, order: seq, createdAt: '2026-10-20T00:00:00Z', ...extra });

const today = dayFromISO('2026-11-11')!;
const items: Item[] = [
    item('g1', 'Alpha', { st: 'o-dn', pp: ['u1'], dd: '2026-10-01' }, { createdAt: '2026-08-01T00:00:00Z' }), // done long ago, past date: not overdue
    item('g1', 'Bravo', { st: 'o-wo', pp: ['u1'], dd: '2026-10-31', pr: 5 }),                // overdue 11 days, high priority
    item('g1', 'Charlie', { st: 'o-st', pp: ['u2'], tl: { from: '2026-11-01', to: '2026-11-14' } }), // stuck, due in 3 days (timeline end)
    item('g1', 'Delta', { st: 'o-sk', dd: '2026-09-01' }),                                    // skipped: not counted, not overdue
    item('g2', 'Echo', { st: 'o-wo', tl: { from: '2026-09-01', to: '2026-11-01' } }),          // overdue 10 days via timeline, unassigned
    item('g2', 'Foxtrot', { st: 'o-dn', pp: ['u2'] }),                                       // done
    item('g2', 'Golf', { st: 'o-dn', pp: ['u3'], sd: '2026-01-01' }),                        // done; start date is not a deadline
    item('g2', 'Hotel', { pp: ['u1'], dd: '2026-11-11', tx: '<b>Budget</b> &amp; plan' }),     // no status, due today
    item('g2', 'Hidden', { st: 'o-wo', dd: '2026-01-01' }, { isHidden: true }),               // ignored
];
const sub1 = item('g9', 'Sub done', { sst: 's-d' }, { parentId: items[0].id });                // parent in g1: g1's sub-item column
const sub2 = item('g1', 'Sub working', { sst: 's-w' }, { parentId: items[1].id });
items.push(sub1, sub2);

const board: Board = {
    id: 'b1', title: 'Finance x BusinessTech',
    columns: [status, person, timeline, status2, prio, note, due, start, subStatus],
    groups: [
        { id: 'g1', title: 'Business Tech x Finance', color: '#fdab3d', items: [] },
        { id: 'g2', title: 'Business Tech Project', color: '#579bfc', items: [] },
    ],
    items,
};

const names: Record<string, string> = { u1: 'Khemmarin', u2: 'Ploy' };
const now = Date.parse('2026-11-11T10:00:00Z');
const logs: SummaryLog[] = [
    { action: 'item_status_updated', at: '2026-11-10T09:00:00Z', itemId: 'i1', newValue: 'o-dn' },
    { action: 'item_status_updated', at: '2026-11-09T09:00:00Z', itemId: 'i6', newValue: 'o-dn' },
    { action: 'item_status_updated', at: '2026-11-09T10:00:00Z', itemId: 'i6', newValue: 'o-dn' },   // same item twice: once
    { action: 'item_status_updated', at: '2026-11-08T09:00:00Z', itemId: 'i2', newValue: 'o-wo' },
    { action: 'item_status_updated', at: '2026-11-08T09:00:00Z', itemId: 'i3', newValue: 'p-c' },    // another column's "done": not this one
    { action: 'item_status_updated', at: '2026-11-01T09:00:00Z', itemId: 'i7', newValue: 'o-dn' },   // week before
    { action: 'item_comment_added', at: '2026-11-10T09:00:00Z', itemId: 'i2', newValue: null },
    { action: 'item_comment_added', at: '2026-10-20T09:00:00Z', itemId: 'i2', newValue: null },
];

const s = summarizeBoard(board, { terms: T, today, now, personName: id => names[id], logs });

eq('status columns in order', s.statusColumns.map(c => c.id), ['st', 'st2']);
eq('first status column by default', s.statusColumn?.id, 'st');
eq('deadline columns: due, timeline, then non-start dates', deadlineColumnsOf(board.columns).map(c => c.id), ['dd', 'tl']);
eq('counts', [s.total, s.done, s.stopped, s.stuck, s.notStarted, s.active, s.open, s.countable], [8, 3, 1, 1, 1, 2, 4, 7]);
eq('pct leaves skipped out', s.pct, 43);
eq('overdue, latest first', s.overdue.map(r => [r.title, r.daysLate]), [['Bravo', 11], ['Echo', 10]]);
eq('due soon includes today, by date', s.dueSoon.map(r => r.title), ['Hotel', 'Charlie']);
eq('stuck', s.stuckTasks.map(r => r.title), ['Charlie']);
eq('unassigned open only', s.unassigned.map(r => r.title), ['Echo']);
eq('no deadline (open)', s.noDeadline, 0);
eq('status slices', s.statuses.map(x => [x.label, x.count]), [['Not Start yet', 0], ['Working on it', 2], ['Done', 3], ['Stuck', 1], ['SKIP', 1], ['No status', 1]].filter(([, c]) => (c as number) > 0));
eq('done labels', s.doneLabels, ['Done']);
eq('stopped labels', s.stoppedLabels, ['SKIP']);
eq('groups', s.groups.map(g => [g.title, g.total, g.countable, g.done, g.overdue, g.stuck, g.pct]), [
    ['Business Tech x Finance', 4, 3, 1, 1, 1, 33],
    ['Business Tech Project', 4, 4, 2, 1, 0, 50],
]);
eq('people, most open first; unknown ids left out', s.people.map(p => [p.name, p.open, p.overdue, p.done]), [['Khemmarin', 2, 1, 1], ['Ploy', 1, 0, 1]]);
eq('subtasks by the parent group\'s column', s.subtasks, { total: 2, withStatus: 2, done: 1 });
eq('week: done from the log, once per item, this column only', [s.week.current.done, s.week.previous.done], [2, 1]);
eq('week: status changes and comments', [s.week.current.statusChanges, s.week.current.comments], [5, 1]);
eq('month comments', s.month.current.comments, 2);
eq('created this month', s.month.current.created, 7);

const ids = s.findings.map(f => f.id);
eq('findings, most pressing first', ids, ['overdue', 'stuck', 'group-behind', 'pace', 'busiest', 'unassigned', 'due-soon', 'subtasks']);
const overdueText = findingText(s.findings[0]);
check('overdue finding names the latest and the high priority', overdueText.includes('“Bravo”, 11 days late') && overdueText.includes('1 of them is high priority'), overdueText);
check('group finding compares both', findingText(s.findings[2]).startsWith('Business Tech x Finance is furthest behind: 1 of 3 tasks done (33%)'), findingText(s.findings[2]));
check('pace finding', findingText(s.findings[3]) === '2 tasks were marked done in the last 7 days, 1 more than the week before.', findingText(s.findings[3]));

// A group with everything done isn't "furthest ahead"; a quiet week is said in words
const archived: Board = {
    ...board,
    groups: [...board.groups, { id: 'g3', title: 'Archive', color: '#c4c4c4', items: [] }],
    items: [...board.items, item('g3', 'Old 1', { st: 'o-dn' }), item('g3', 'Old 2', { st: 'o-dn' })],
};
const sa = summarizeBoard(archived, { terms: T, today, now, logs });
check('archive left out of the comparison', findingText(sa.findings.find(f => f.id === 'group-behind')!).endsWith('Business Tech Project is furthest ahead at 50%.'), findingText(sa.findings.find(f => f.id === 'group-behind')!));
const quiet = summarizeBoard(board, { terms: T, today, now, logs: logs.filter(l => l.at < '2026-11-04') });
eq('quiet week', findingText(quiet.findings.find(f => f.id === 'pace')!), 'No tasks were marked done in the last 7 days, against 1 the week before.');

// Another status column picked
const s2 = summarizeBoard(board, { terms: T, today, now, statusColumnId: 'st2', logs });
eq('picked column', s2.statusColumn?.id, 'st2');
eq('picked column: nothing set is no status', s2.statuses.map(x => x.label), ['No status']);

// No logs: the log's figures are unknown, not zero
const s3 = summarizeBoard(board, { terms: T, today, now, logs: null });
eq('no log', [s3.week.current.done, s3.week.current.comments, s3.week.current.created], [null, null, 0]);
check('no pace finding without the log', !s3.findings.some(f => f.id === 'pace'));

// Empty board and no status column
eq('empty board', summarizeBoard({ columns: [], groups: [], items: [] }, { terms: T, today }).findings.map(f => f.id), ['empty']);
const plain = summarizeBoard({ columns: [note], groups: board.groups, items: [item('g1', 'Only', {})] }, { terms: T, today });
eq('no status column', plain.findings.map(f => f.id)[0], 'no-status');

eq('column names told apart', [...columnNames([status, status2, note]).values()], ['Status', 'Status (2)', 'Notes']);

// ---- what Gemini gets ---------------------------------------------------------------
items[1].updates = [
    { id: 'c1', content: '<p>Waiting for <b>vendor</b> quote &amp; approval</p>', createdAt: '2026-11-10T08:00:00Z', author: 'Ploy' },
    { id: 'c2', content: 'Old note', createdAt: '2026-08-01T08:00:00Z', author: 'Ploy' },
];
const p = geminiPayload(board, s, { period: '30d', language: 'th', terms: T, now, personName: id => names[id] });
const bravo = p.groups[0].tasks.find(x => x.title === 'Bravo')!;
eq('payload words', p.words, { item: 'task', items: 'tasks', group: 'task group', board: 'space' });
eq('payload task', [bravo.status, bravo.people, bravo.deadline, bravo.daysLate, bravo.priority], ['Working on it', ['Khemmarin'], '2026-10-31', 11, 5]);
eq('comments in the period, as text', bravo.comments, [{ by: 'Ploy', on: '2026-11-10', text: 'Waiting for vendor quote & approval' }]);
eq('other status column as a field', bravo.fields, undefined);
const hotel = p.groups[1].tasks.find(x => x.title === 'Hotel')!;
eq('text field as plain text', hotel.fields, { Notes: 'Budget & plan' });
check('done tasks untouched in the period are left out', !p.groups.flatMap(g => g.tasks).some(x => x.title === 'Alpha'));
check('hidden left out', !p.groups.flatMap(g => g.tasks).some(x => x.title === 'Hidden'));
check('facts start with the totals', p.facts[0].startsWith('8 top-level tasks: 3 done (43%)'), p.facts[0]);

// Too many tasks: the most pressing are kept
const many: Board = { ...board, items: Array.from({ length: 400 }, (_, i) => item('g1', `T${i}`, { st: 'o-wo', dd: i === 399 ? '2026-10-01' : '' })) };
const sm = summarizeBoard(many, { terms: T, today, now });
const pm = geminiPayload(many, sm, { period: 'all', language: 'en', terms: T, now });
eq('capped', [pm.groups[0].tasks.length, pm.omitted], [250, 150]);
check('the overdue one is kept', pm.groups[0].tasks.some(x => x.title === 'T399'));

console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
