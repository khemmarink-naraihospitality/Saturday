import type { Board, Column, Item } from '../types';
import type { Terms } from './terms';
import { itemColumns, subitemColumns } from './columnScope';
import { dayFromISO, formatDay } from './formula/engine';
import { peopleIdsOf } from './formula';
import { toRating } from './priority';
import { getDedupedUpdates, previewText } from './updates';
import { linkDisplayText } from './utils';

/*
 * The AI Summary tab's first section: a board summed up from what it already
 * holds — statuses, deadlines, people, groups and the activity log — with no
 * AI and nothing sent anywhere. Pure (no React, no store), so the same numbers
 * feed the section, the facts handed to Gemini in the second section, and
 * tests/board_summary_test.ts.
 *
 * Status labels are free text on every board ("Done", "Compleated", "SKIP",
 * "Need Decision", Thai words…), so what a label means is read from its words
 * (statusKind) and the section says which labels it counted as done.
 */

// ---- what a status label means ------------------------------------------------

export type StatusKind = 'done' | 'stopped' | 'stuck' | 'not_started' | 'active';

/** Lower case, punctuation as spaces; Thai vowel and tone marks kept. */
const normalize = (label: string) =>
    label.toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim();

const word = (words: string) => new RegExp(`(?:^| )(?:${words})(?: |$)`);

const NEGATED = /(?:^| )(?:not|no|non|un|never)(?: |$)|ไม่/;
const STOPPED = word('skip|skipped|cancel|cancelled|canceled|cancellation|lost|drop|dropped|rejected|reject|declined|void|abandoned|withdrawn|n a|na|no need|not needed|not required|irrelevant');
const STOPPED_TH = /ยกเลิก|ไม่ทำ|ไม่ต้องทำ|^ข้าม/;
const NOT_STARTED = word('not (?:yet )?start|not (?:yet )?started|not start yet|yet to start|to do|todo|backlog|not begun');
const NOT_STARTED_TH = /ยังไม่(?:ได้)?เริ่ม|รอเริ่ม|ยังไม่ดำเนินการ/;
const DONE = word('done|complete|completed|compleated|finished|finish|closed|resolved|delivered|approved|accomplished|ended');
const DONE_START = /^(?:complet|compleat)/;
const DONE_TH = /เสร็จ|เรียบร้อย|สำเร็จ|ปิดงาน|อนุมัติแล้ว|จบงาน/;
const STUCK = word('stuck|blocked|blocker|block|on hold|hold|paused|pause|halted|issue|issues|problem|delayed|delay|at risk|waiting|wait|pending|awaiting|need decision|needs decision|need approval|needs approval|escalated');
const STUCK_TH = /ติดปัญหา|ติดขัด|^รอ(?!บ)|ล่าช้า|มีปัญหา|ชะลอ|หยุดชั่วคราว/;

/** What a status label stands for. No label, or Monday's grey "Default", is not started. */
export const statusKind = (label: string | null | undefined): StatusKind => {
    const text = normalize(String(label ?? ''));
    if (!text || text === 'default') return 'not_started';
    if (STOPPED.test(text) || STOPPED_TH.test(text)) return 'stopped';
    if (NOT_STARTED.test(text) || NOT_STARTED_TH.test(text)) return 'not_started';
    const negated = NEGATED.test(text);
    if (!negated && (DONE.test(text) || DONE_START.test(text) || DONE_TH.test(text))) return 'done';
    if (!negated && (STUCK.test(text) || STUCK_TH.test(text))) return 'stuck';
    return 'active';
};

// ---- the board's columns --------------------------------------------------------

const byOrder = (a: Column, b: Column) => (a.order ?? 0) - (b.order ?? 0);

/** The item Status columns, in board order: the first is what "done" is read from unless another is picked. */
export const statusColumnsOf = (columns: Column[]): Column[] =>
    itemColumns(columns).filter(c => c.type === 'status').sort(byOrder);

/** Column titles told apart: a second "Status" is "Status (2)", as formulas name it. */
export const columnNames = (columns: Column[]): Map<string, string> => {
    const seen = new Map<string, number>();
    const names = new Map<string, string>();
    columns.forEach(c => {
        const title = (c.title || 'Untitled').trim();
        const n = (seen.get(title) ?? 0) + 1;
        seen.set(title, n);
        names.set(c.id, n === 1 ? title : `${title} (${n})`);
    });
    return names;
};

const START_LIKE = /start|begin|kick ?off|created|opened|received|เริ่ม|สร้าง|รับเรื่อง/i;

/**
 * Where a deadline is read from, in the order tried for each item: a Due date
 * column, then the end of a Timeline, then a Date column that isn't a start or
 * created date. An item's deadline is the first of them it has a value in.
 */
export const deadlineColumnsOf = (columns: Column[]): Column[] => {
    const cols = itemColumns(columns).sort(byOrder);
    return [
        ...cols.filter(c => c.type === 'due_date'),
        ...cols.filter(c => c.type === 'timeline'),
        ...cols.filter(c => c.type === 'date' && !START_LIKE.test(c.title || '')),
    ];
};

const deadlineOf = (item: Item, columns: Column[]): number | null => {
    for (const col of columns) {
        const raw = item.values?.[col.id];
        let day: number | null;
        if (col.type === 'timeline') {
            const range = (raw && typeof raw === 'object' ? raw : {}) as { from?: unknown; to?: unknown };
            day = dayFromISO(range.to) ?? dayFromISO(range.from);
        } else {
            day = dayFromISO(raw);
        }
        if (day !== null) return day;
    }
    return null;
};

/** The label an item shows in a Status column: its option, or the stored text when it matches none. */
const statusOf = (item: Item, column: Column | null): { key: string; label: string; color: string } | null => {
    if (!column) return null;
    const raw = item.values?.[column.id];
    if (raw === null || raw === undefined || raw === '') return null;
    const option = (Array.isArray(column.options) ? column.options : []).find(o => o.id === raw || o.label === raw);
    if (option) return option.label && option.label !== 'Default' ? { key: option.id, label: option.label, color: option.color } : null;
    return typeof raw === 'string' ? { key: `text:${raw}`, label: raw, color: '#c4c4c4' } : null;
};

// ---- the summary ------------------------------------------------------------------

/** One activity-log entry of this board, as the section fetches them. */
export interface SummaryLog {
    action: string;
    at: string;
    itemId: string | null;
    /** item_status_updated: the option id the status was set to. */
    newValue: string | null;
}

export interface TaskRef {
    id: string;
    title: string;
    group: string;
    status: string;
    deadline: number | null;
    /** Overdue only: whole days past the deadline. */
    daysLate?: number;
}

export interface StatusSlice { key: string; label: string; color: string; kind: StatusKind; count: number }

export interface GroupStat {
    id: string;
    title: string;
    color: string;
    total: number;
    /** Not counting skipped / cancelled. */
    countable: number;
    done: number;
    open: number;
    overdue: number;
    stuck: number;
    /** done / countable, 0–100; null when nothing counts. */
    pct: number | null;
}

export interface PersonStat { id: string; name: string; open: number; overdue: number; done: number }

export interface PeriodCounts {
    created: number;
    /** From the activity log; null when it couldn't be read. */
    done: number | null;
    statusChanges: number | null;
    comments: number | null;
}

export interface PeriodCompare { days: number; current: PeriodCounts; previous: PeriodCounts }

export type FindingTone = 'bad' | 'warn' | 'good' | 'info';
/** Plain text, or a stretch to set in bold. */
export type FindingPart = string | { b: string };
export interface Finding { id: string; tone: FindingTone; parts: FindingPart[]; rank: number }

export interface BoardSummary {
    statusColumns: Column[];
    statusColumn: Column | null;
    deadlineColumns: Column[];
    hasPeople: boolean;
    total: number;
    done: number;
    stopped: number;
    stuck: number;
    notStarted: number;
    active: number;
    open: number;
    countable: number;
    pct: number | null;
    overdue: TaskRef[];
    dueSoon: TaskRef[];
    stuckTasks: TaskRef[];
    unassigned: TaskRef[];
    noDeadline: number;
    statuses: StatusSlice[];
    /** Labels read as done / as skipped, for the note under the status bar. */
    doneLabels: string[];
    stoppedLabels: string[];
    groups: GroupStat[];
    people: PersonStat[];
    subtasks: { total: number; withStatus: number; done: number };
    week: PeriodCompare;
    month: PeriodCompare;
    findings: Finding[];
}

export interface SummaryOptions {
    terms: Terms;
    /** Today as a calendar day (todayDay()). */
    today: number;
    /** Now, for the activity windows. */
    now?: number;
    /** The column "done" is read from; the first Status column when unset or gone. */
    statusColumnId?: string | null;
    personName?: (userId: string) => string | undefined;
    /** This board's activity, newest first or not; null when it couldn't be read. */
    logs?: SummaryLog[] | null;
}

const DUE_SOON_DAYS = 7;
const DAY_MS = 86400000;

const pctOf = (part: number, whole: number): number | null => (whole > 0 ? Math.round((part / whole) * 100) : null);

export const summarizeBoard = (
    board: Pick<Board, 'columns' | 'groups' | 'items'>,
    { terms: t, today, now = Date.now(), statusColumnId, personName = () => undefined, logs = null }: SummaryOptions
): BoardSummary => {
    const columns = board.columns || [];
    const statusColumns = statusColumnsOf(columns);
    const statusColumn = statusColumns.find(c => c.id === statusColumnId) ?? statusColumns[0] ?? null;
    const deadlineColumns = deadlineColumnsOf(columns);
    const peopleColumns = itemColumns(columns).filter(c => c.type === 'people');
    const priorityColumn = itemColumns(columns).sort(byOrder).find(c => c.type === 'priority') ?? null;
    const groupTitle = new Map((board.groups || []).map(g => [g.id, g.title]));

    const tasks = (board.items || []).filter(i => !i.parentId && !i.isHidden);

    // Status bar slices, in the column's own option order, "No status" last.
    const slices = new Map<string, StatusSlice>();
    (statusColumn?.options || []).forEach(o => {
        if (o.label && o.label !== 'Default') slices.set(o.id, { key: o.id, label: o.label, color: o.color, kind: statusKind(o.label), count: 0 });
    });

    const groups = new Map<string, GroupStat>();
    (board.groups || []).forEach(g => groups.set(g.id, {
        id: g.id, title: g.title, color: g.color, total: 0, countable: 0, done: 0, open: 0, overdue: 0, stuck: 0, pct: null,
    }));
    const people = new Map<string, PersonStat>();

    let done = 0, stopped = 0, stuck = 0, notStarted = 0, active = 0, noDeadline = 0, noStatus = 0;
    const overdue: TaskRef[] = [];
    const dueSoon: TaskRef[] = [];
    const stuckTasks: TaskRef[] = [];
    const unassigned: TaskRef[] = [];

    for (const item of tasks) {
        const status = statusOf(item, statusColumn);
        const kind: StatusKind = status ? statusKind(status.label) : 'not_started';
        const deadline = deadlineOf(item, deadlineColumns);
        const ref: TaskRef = { id: item.id, title: item.title || 'Untitled', group: groupTitle.get(item.groupId) || '', status: status?.label || '', deadline };
        const isOpen = kind !== 'done' && kind !== 'stopped';
        const isOverdue = isOpen && deadline !== null && deadline < today;

        if (status) {
            const slice = slices.get(status.key) ?? { key: status.key, label: status.label, color: status.color, kind, count: 0 };
            slice.count++;
            slices.set(status.key, slice);
        } else {
            noStatus++;
        }

        if (kind === 'done') done++;
        else if (kind === 'stopped') stopped++;
        else if (kind === 'stuck') { stuck++; stuckTasks.push(ref); }
        else if (kind === 'not_started') notStarted++;
        else active++;

        if (isOverdue) overdue.push({ ...ref, daysLate: today - deadline! });
        if (isOpen && deadline !== null && deadline >= today && deadline <= today + DUE_SOON_DAYS) dueSoon.push(ref);
        if (isOpen && deadline === null) noDeadline++;

        const group = groups.get(item.groupId);
        if (group) {
            group.total++;
            if (kind !== 'stopped') group.countable++;
            if (kind === 'done') group.done++;
            if (isOpen) group.open++;
            if (isOverdue) group.overdue++;
            if (kind === 'stuck') group.stuck++;
        }

        const assigned = new Set<string>();
        peopleColumns.forEach(col => peopleIdsOf(item.values?.[col.id]).forEach(id => assigned.add(id)));
        if (isOpen && peopleColumns.length > 0 && assigned.size === 0) unassigned.push(ref);
        assigned.forEach(id => {
            const name = personName(id);
            if (!name) return; // no longer on the board: counted as assigned, not listed
            const person = people.get(id) ?? { id, name, open: 0, overdue: 0, done: 0 };
            if (isOpen) person.open++;
            if (isOverdue) person.overdue++;
            if (kind === 'done') person.done++;
            people.set(id, person);
        });
    }

    overdue.sort((a, b) => (b.daysLate ?? 0) - (a.daysLate ?? 0));
    dueSoon.sort((a, b) => (a.deadline ?? 0) - (b.deadline ?? 0));

    const statuses = [...slices.values()].filter(s => s.count > 0);
    if (noStatus > 0) statuses.push({ key: '__none__', label: 'No status', color: '#c4c4c4', kind: 'not_started', count: noStatus });

    const groupStats = [...groups.values()].filter(g => g.total > 0).map(g => ({ ...g, pct: pctOf(g.done, g.countable) }));
    const peopleStats = [...people.values()].sort((a, b) => b.open - a.open || b.overdue - a.overdue || a.name.localeCompare(b.name));

    // Sub-items: their group is their parent's, and that group's own sub-item Status column tells done.
    const parentGroup = new Map((board.items || []).filter(i => !i.parentId).map(i => [i.id, i.groupId]));
    const subtasks = { total: 0, withStatus: 0, done: 0 };
    const subStatusColumn = new Map<string, Column | null>();
    (board.items || []).filter(i => i.parentId && !i.isHidden && parentGroup.has(i.parentId)).forEach(sub => {
        subtasks.total++;
        const gid = parentGroup.get(sub.parentId!) || sub.groupId;
        if (!subStatusColumn.has(gid)) subStatusColumn.set(gid, subitemColumns(columns, gid).filter(c => c.type === 'status').sort(byOrder)[0] ?? null);
        const status = statusOf(sub, subStatusColumn.get(gid) ?? null);
        if (!status) return;
        subtasks.withStatus++;
        if (statusKind(status.label) === 'done') subtasks.done++;
    });

    // This period against the one before, from the tasks' creation dates and the activity log.
    const doneOptionIds = new Set((statusColumn?.options || []).filter(o => statusKind(o.label) === 'done').map(o => o.id));
    const createdAt = tasks.map(i => Date.parse(i.createdAt || '')).filter(n => !Number.isNaN(n));
    const logTimes = (logs || []).map(l => ({ ...l, ms: Date.parse(l.at) })).filter(l => !Number.isNaN(l.ms));
    const countsBetween = (from: number, to: number): PeriodCounts => {
        const inside = (ms: number) => ms >= from && ms < to;
        const window = logTimes.filter(l => inside(l.ms));
        return {
            created: createdAt.filter(inside).length,
            done: logs ? new Set(window.filter(l => l.action === 'item_status_updated' && l.newValue && doneOptionIds.has(l.newValue)).map(l => l.itemId)).size : null,
            statusChanges: logs ? window.filter(l => l.action === 'item_status_updated').length : null,
            comments: logs ? window.filter(l => l.action === 'item_comment_added').length : null,
        };
    };
    const compare = (days: number): PeriodCompare => ({
        days,
        current: countsBetween(now - days * DAY_MS, now + 1),
        previous: countsBetween(now - 2 * days * DAY_MS, now - days * DAY_MS),
    });

    const total = tasks.length;
    const countable = total - stopped;
    const summary: BoardSummary = {
        statusColumns,
        statusColumn,
        deadlineColumns,
        hasPeople: peopleColumns.length > 0,
        total, done, stopped, stuck, notStarted, active,
        open: total - done - stopped,
        countable,
        pct: pctOf(done, countable),
        overdue, dueSoon, stuckTasks, unassigned, noDeadline,
        statuses,
        doneLabels: statuses.filter(s => s.kind === 'done').map(s => s.label),
        stoppedLabels: statuses.filter(s => s.kind === 'stopped').map(s => s.label),
        groups: groupStats,
        people: peopleStats,
        subtasks,
        week: compare(7),
        month: compare(30),
        findings: [],
    };
    summary.findings = findingsOf(summary, t, today, priorityColumn ? tasks.filter(i => toRating(i.values?.[priorityColumn.id]) >= 4).map(i => i.id) : []);
    return summary;
};

// ---- the findings, in words ------------------------------------------------------

const clip = (text: string, max = 48) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);
const quoted = (title: string) => `“${clip(title)}”`;
const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
export const shortDay = (day: number) => formatDay(day, 'MMM D');

/** "“A”, “B” and 3 more" */
const someOf = (refs: TaskRef[], shown = 2): string => {
    const names = refs.slice(0, shown).map(r => quoted(r.title));
    const rest = refs.length - names.length;
    if (rest > 0) return `${names.join(', ')} and ${rest} more`;
    return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0] ?? '';
};

const findingsOf = (s: BoardSummary, t: Terms, today: number, highPriorityIds: string[]): Finding[] => {
    const out: Finding[] = [];
    const add = (id: string, tone: FindingTone, rank: number, ...parts: FindingPart[]) => out.push({ id, tone, rank, parts });

    if (s.total === 0) {
        add('empty', 'info', 100, `There are no ${t.items} on this ${t.board} yet.`);
        return out;
    }

    if (!s.statusColumn) {
        add('no-status', 'info', 99, `This ${t.board} has no Status column, so nothing can be counted as done.`);
    } else if (s.open === 0 && s.countable > 0) {
        add('all-done', 'good', 98, { b: `Every ${t.item} is done.` }, ` ${n(s.done, t.item, t.items)} finished.`);
    }

    if (s.overdue.length > 0) {
        const worst = s.overdue[0];
        const high = s.overdue.filter(r => highPriorityIds.includes(r.id)).length;
        add('overdue', 'bad', 95,
            { b: `${n(s.overdue.length, `open ${t.item} is`, `open ${t.items} are`)} past ${s.overdue.length === 1 ? 'its' : 'their'} deadline` },
            s.overdue.length === 1
                ? `: ${quoted(worst.title)}, ${n(worst.daysLate ?? 0, 'day', 'days')} late.`
                : `. The longest overdue is ${quoted(worst.title)}, ${n(worst.daysLate ?? 0, 'day', 'days')} late.`,
            ...(high > 0 ? [` ${high} of them ${high === 1 ? 'is' : 'are'} high priority.`] : []));
    } else if (s.deadlineColumns.length > 0 && s.open > 0 && s.statusColumn) {
        add('on-time', 'good', 40, { b: 'Nothing is overdue.' });
    }

    if (s.stuckTasks.length > 0) {
        const labels = [...new Set(s.stuckTasks.map(r => r.status).filter(Boolean))];
        add('stuck', 'warn', 90,
            { b: `${n(s.stuckTasks.length, `${t.item} is`, `${t.items} are`)} stuck or waiting` },
            labels.length ? ` (${labels.slice(0, 3).join(', ')})` : '',
            `: ${someOf(s.stuckTasks)}.`);
    }

    // Groups still in progress: one with everything done (an "Archive") isn't "ahead"
    const ranked = s.groups.filter(g => g.countable >= 2 && g.pct !== null && g.open > 0);
    if (ranked.length >= 2) {
        const sorted = [...ranked].sort((a, b) => (a.pct! - b.pct!) || (b.open - a.open));
        const worst = sorted[0];
        const best = sorted[sorted.length - 1];
        if (best.pct! > worst.pct!) {
            add('group-behind', 'warn', 80,
                { b: worst.title }, ` is furthest behind: ${worst.done} of ${n(worst.countable, t.item, t.items)} done (${worst.pct}%). `,
                { b: best.title }, ` is furthest ahead at ${best.pct}%.`);
        }
    }

    const week = s.week;
    if (week.current.done !== null && week.previous.done !== null && (week.current.done > 0 || week.previous.done > 0)) {
        const now = week.current.done, before = week.previous.done;
        if (now === 0) {
            add('pace', 'warn', 70, { b: `No ${t.items} were marked done in the last 7 days` }, `, against ${before} the week before.`);
        } else {
            const change = now > before ? `${now - before} more than the week before` : now < before ? `${before - now} fewer than the week before` : 'the same as the week before';
            add('pace', now >= before ? 'good' : 'warn', 70,
                { b: `${n(now, `${t.item} was`, `${t.items} were`)} marked done in the last 7 days` }, `, ${change}.`);
        }
    }

    const busiest = s.people.find(p => p.open >= 2);
    if (busiest) {
        add('busiest', 'info', 60,
            { b: busiest.name }, ` has the most open work: ${n(busiest.open, t.item, t.items)}`,
            busiest.overdue > 0 ? `, ${busiest.overdue} overdue.` : '.');
    }

    if (s.unassigned.length > 0) {
        add('unassigned', 'warn', 55, { b: `${n(s.unassigned.length, `open ${t.item} has`, `open ${t.items} have`)} no one assigned` }, `: ${someOf(s.unassigned)}.`);
    }

    if (s.dueSoon.length > 0) {
        const first = s.dueSoon[0];
        const when = first.deadline === today ? 'today' : `on ${shortDay(first.deadline!)}`;
        add('due-soon', 'info', 50,
            { b: `${n(s.dueSoon.length, `${t.item} is`, `${t.items} are`)} due in the next 7 days` },
            `; the first is ${quoted(first.title)}, due ${when}.`);
    }

    if (s.deadlineColumns.length > 0 && s.open > 0 && s.noDeadline / s.open >= 0.25) {
        add('no-deadline', 'info', 30, { b: `${n(s.noDeadline, `open ${t.item} has`, `open ${t.items} have`)} no deadline` }, '.');
    }

    if (s.subtasks.withStatus > 0) {
        add('subtasks', 'info', 20, `${s.subtasks.done} of ${n(s.subtasks.withStatus, t.subitem, t.subitems)} are done (${pctOf(s.subtasks.done, s.subtasks.withStatus)}%).`);
    }

    return out.sort((a, b) => b.rank - a.rank);
};

/** A finding as one line of plain text (the facts sent to Gemini). */
export const findingText = (f: Finding): string => f.parts.map(p => (typeof p === 'string' ? p : p.b)).join('');

// ---- what Gemini is given ---------------------------------------------------------

export type GeminiPeriod = '7d' | '30d' | '90d' | 'all';
export type GeminiLanguage = 'th' | 'en';

export const GEMINI_PERIOD_DAYS: Record<GeminiPeriod, number | null> = { '7d': 7, '30d': 30, '90d': 90, all: null };

export interface GeminiTask {
    title: string;
    status: string;
    people?: string[];
    deadline?: string;
    daysLate?: number;
    priority?: number;
    /** Other columns with a value, by title: text, other statuses, numbers, dates. */
    fields?: Record<string, string>;
    /** The period's comments, newest first. */
    comments?: { by: string; on: string; text: string }[];
}

export interface GeminiPayload {
    boardId: string;
    boardTitle: string;
    period: GeminiPeriod;
    language: GeminiLanguage;
    /** The words this palette uses, so the summary says "task" where the app does. */
    words: { item: string; items: string; group: string; board: string };
    /** Section A's numbers and findings, as sentences: the summary's facts. */
    facts: string[];
    groups: { title: string; tasks: GeminiTask[] }[];
    /** Tasks left out to keep the request small. */
    omitted: number;
}

const MAX_TASKS = 250;
const MAX_COMMENTS = 4;
const MAX_COMMENT_CHARS = 400;
const MAX_FIELD_CHARS = 200;

const isoDay = (day: number) => formatDay(day, 'YYYY-MM-DD');

/** One column's value as words, for Gemini; '' when empty or not worth sending. */
const fieldText = (col: Column, raw: unknown, personName: (id: string) => string | undefined): string => {
    if (raw === null || raw === undefined || raw === '') return '';
    switch (col.type) {
        case 'text':
        case 'long_text':
            return clip(previewText(typeof raw === 'object' ? JSON.stringify(raw) : String(raw)), MAX_FIELD_CHARS);
        case 'link':
            return clip(linkDisplayText(raw) || '', MAX_FIELD_CHARS);
        case 'number':
            return String(raw);
        case 'status':
        case 'dropdown': {
            const options = Array.isArray(col.options) ? col.options : [];
            const labels = (Array.isArray(raw) ? raw : [raw]).map(v => options.find(o => o.id === v || o.label === v)?.label ?? String(v));
            return labels.filter(l => l && l !== 'Default').join(', ');
        }
        case 'date':
        case 'due_date': {
            const d = dayFromISO(raw);
            return d === null ? '' : isoDay(d);
        }
        case 'timeline': {
            const range = (typeof raw === 'object' ? raw : {}) as { from?: unknown; to?: unknown };
            const from = dayFromISO(range.from), to = dayFromISO(range.to);
            return from === null && to === null ? '' : `${from === null ? '?' : isoDay(from)} to ${to === null ? '?' : isoDay(to)}`;
        }
        case 'checkbox':
            return raw === true ? 'yes' : '';
        case 'people':
            return peopleIdsOf(raw).map(id => personName(id)).filter(Boolean).join(', ');
        default:
            return '';
    }
};

/**
 * The board as Gemini reads it: every open task, and finished ones touched in
 * the period, with their status, people, deadline, other filled-in columns and
 * the period's comments as plain text. Most pressing first when there are too
 * many to send.
 */
export const geminiPayload = (
    board: Pick<Board, 'id' | 'title' | 'columns' | 'groups' | 'items'>,
    summary: BoardSummary,
    { period, language, terms: t, now = Date.now(), personName = () => undefined }: {
        period: GeminiPeriod; language: GeminiLanguage; terms: Terms; now?: number; personName?: (id: string) => string | undefined;
    }
): GeminiPayload => {
    const days = GEMINI_PERIOD_DAYS[period];
    const since = days === null ? -Infinity : now - days * DAY_MS;
    const cols = itemColumns(board.columns || []).sort(byOrder);
    const names = columnNames(cols);
    const peopleColumns = cols.filter(c => c.type === 'people');
    const priorityColumn = cols.find(c => c.type === 'priority') ?? null;
    // Status, people, priority and the due date have their own fields; files and formulas say nothing here.
    const otherColumns = cols.filter(c => c.id !== summary.statusColumn?.id
        && !['people', 'priority', 'due_date', 'files', 'formula'].includes(c.type));
    const overdueById = new Map(summary.overdue.map(r => [r.id, r]));
    const stuckIds = new Set(summary.stuckTasks.map(r => r.id));

    type Candidate = { groupId: string; task: GeminiTask; score: number; order: number };
    const candidates: Candidate[] = [];

    (board.items || []).filter(i => !i.parentId && !i.isHidden).forEach((item, order) => {
        const status = statusOf(item, summary.statusColumn);
        const kind = status ? statusKind(status.label) : 'not_started';
        const open = kind !== 'done' && kind !== 'stopped';
        const comments = getDedupedUpdates(item.updates)
            .filter(u => Date.parse(u.createdAt) >= since)
            .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
            .map(u => ({ by: String(u.author || 'Someone'), on: String(u.createdAt || '').slice(0, 10), text: clip(previewText(u.content), MAX_COMMENT_CHARS) }))
            .filter(c => c.text)
            .slice(0, MAX_COMMENTS);
        const created = Date.parse(item.createdAt || '');
        const touched = comments.length > 0 || (!Number.isNaN(created) && created >= since);
        if (!open && !touched) return; // finished before the period: nothing new to say

        const task: GeminiTask = { title: item.title || 'Untitled', status: status?.label || 'No status' };
        const people = [...new Set(peopleColumns.flatMap(c => peopleIdsOf(item.values?.[c.id])))].map(id => personName(id)).filter((x): x is string => !!x);
        if (people.length) task.people = people;
        const late = overdueById.get(item.id);
        const deadline = deadlineOf(item, summary.deadlineColumns);
        if (deadline !== null) task.deadline = isoDay(deadline);
        if (late) task.daysLate = late.daysLate;
        const rating = priorityColumn ? toRating(item.values?.[priorityColumn.id]) : 0;
        if (rating > 0) task.priority = rating;
        const fields: Record<string, string> = {};
        otherColumns.forEach(c => {
            const text = fieldText(c, item.values?.[c.id], personName);
            if (text) fields[names.get(c.id) || c.title] = text;
        });
        if (Object.keys(fields).length) task.fields = fields;
        if (comments.length) task.comments = comments;

        const score = (late ? 1000 + (late.daysLate ?? 0) : 0) + (stuckIds.has(item.id) ? 500 : 0) + comments.length * 50 + (open ? 100 : 0) + rating * 10;
        candidates.push({ groupId: item.groupId, task, score, order });
    });

    const kept = candidates.length > MAX_TASKS
        ? [...candidates].sort((a, b) => b.score - a.score).slice(0, MAX_TASKS).sort((a, b) => a.order - b.order)
        : candidates;

    const groups = (board.groups || [])
        .map(g => ({ title: g.title, tasks: kept.filter(c => c.groupId === g.id).map(c => c.task) }))
        .filter(g => g.tasks.length > 0);

    const facts = [
        `${summary.total} top-level ${summary.total === 1 ? t.item : t.items}: ${summary.done} done${summary.pct !== null ? ` (${summary.pct}%)` : ''}, ${summary.active} in progress, ${summary.stuck} stuck or waiting, ${summary.notStarted} not started, ${summary.stopped} skipped or cancelled.`,
        `${summary.overdue.length} overdue, ${summary.dueSoon.length} due in the next 7 days.`,
        ...summary.groups.map(g => `${t.Group} "${g.title}": ${g.done} of ${g.countable} done${g.pct !== null ? ` (${g.pct}%)` : ''}, ${g.overdue} overdue, ${g.stuck} stuck or waiting.`),
        ...summary.findings.map(findingText),
    ];

    return {
        boardId: board.id,
        boardTitle: board.title,
        period,
        language,
        words: { item: t.item, items: t.items, group: t.group, board: t.board },
        facts,
        groups,
        omitted: candidates.length - kept.length,
    };
};
