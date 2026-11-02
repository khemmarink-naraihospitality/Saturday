import type { Column, FormulaConditionOp, FormulaOutcome, FormulaRule } from '../../types';
import { subjectKind, type SubjectKind } from './index';
import { refName } from './refs';

/*
 * The choices the If / Then / Else editor offers: which comparisons a column
 * type has and what each needs, the ready-made rules to start from, and the
 * example calculations — all from the board's real columns.
 */

export type OpValueKind = 'none' | 'options' | 'labels' | 'people' | 'text' | 'number' | 'days' | 'date';

export interface OpInfo {
    op: FormulaConditionOp;
    label: string;
    /** What has to be chosen or typed after it. */
    value: OpValueKind;
}

const EMPTY: OpInfo = { op: 'empty', label: 'is empty', value: 'none' };
const NOT_EMPTY: OpInfo = { op: 'not_empty', label: 'is not empty', value: 'none' };

export const opsFor = (kind: SubjectKind): OpInfo[] => {
    switch (kind) {
        case 'status':
            return [
                { op: 'is', label: 'is', value: 'options' },
                { op: 'is_not', label: 'is not', value: 'options' },
                EMPTY, NOT_EMPTY,
            ];
        case 'dropdown':
            return [
                { op: 'contains', label: 'has', value: 'labels' },
                { op: 'not_contains', label: 'doesn\'t have', value: 'labels' },
                EMPTY, NOT_EMPTY,
            ];
        case 'people':
            return [
                { op: 'includes', label: 'includes', value: 'people' },
                { op: 'not_includes', label: 'doesn\'t include', value: 'people' },
                { op: 'empty', label: 'has no one', value: 'none' },
                { op: 'not_empty', label: 'has someone', value: 'none' },
            ];
        case 'checkbox':
            return [
                { op: 'checked', label: 'is checked', value: 'none' },
                { op: 'unchecked', label: 'is not checked', value: 'none' },
            ];
        case 'files':
            return [
                { op: 'not_empty', label: 'has files', value: 'none' },
                { op: 'empty', label: 'has no files', value: 'none' },
            ];
        case 'number':
            return [
                { op: 'gt', label: 'is greater than', value: 'number' },
                { op: 'gte', label: 'is at least', value: 'number' },
                { op: 'lt', label: 'is less than', value: 'number' },
                { op: 'lte', label: 'is at most', value: 'number' },
                { op: 'eq', label: 'is equal to', value: 'number' },
                { op: 'neq', label: 'is not equal to', value: 'number' },
                EMPTY, NOT_EMPTY,
            ];
        case 'date':
            return [
                { op: 'past', label: 'has passed', value: 'none' },
                { op: 'today', label: 'is today', value: 'none' },
                { op: 'next_days', label: 'is within the next', value: 'days' },
                { op: 'overdue_by', label: 'passed more than', value: 'days' },
                { op: 'future', label: 'is after today', value: 'none' },
                { op: 'before', label: 'is before', value: 'date' },
                { op: 'after', label: 'is after', value: 'date' },
                { op: 'on', label: 'is on', value: 'date' },
                EMPTY, NOT_EMPTY,
            ];
        case 'formula':
            return [
                { op: 'is', label: 'is', value: 'text' },
                { op: 'is_not', label: 'is not', value: 'text' },
                { op: 'contains', label: 'contains', value: 'text' },
                { op: 'gt', label: 'is greater than', value: 'number' },
                { op: 'lt', label: 'is less than', value: 'number' },
                { op: 'past', label: 'is a date that has passed', value: 'none' },
                EMPTY, NOT_EMPTY,
            ];
        default:
            return [
                { op: 'contains', label: 'contains', value: 'text' },
                { op: 'not_contains', label: 'doesn\'t contain', value: 'text' },
                { op: 'is', label: 'is', value: 'text' },
                { op: 'is_not', label: 'is not', value: 'text' },
                EMPTY, NOT_EMPTY,
            ];
    }
};

export const opInfo = (kind: SubjectKind, op: FormulaConditionOp): OpInfo | undefined => opsFor(kind).find(o => o.op === op);

/** The words after a day count: "is within the next 3 days", "passed more than 2 days ago". */
export const daysSuffix = (op: FormulaConditionOp, n: number) =>
    `${n === 1 ? 'day' : 'days'}${op === 'overdue_by' ? ' ago' : ''}`;

export const DEFAULT_DAYS: Partial<Record<FormulaConditionOp, number>> = { next_days: 3, overdue_by: 1 };

// ---- colours a rule's label starts with ------------------------------------------------

export const RULE_COLORS = {
    red: '#E53935',
    amber: '#FF9800',
    green: '#43A047',
    blue: '#1E88E5',
    grey: '#9E9E9E',
} as const;

/**
 * A colour for a result by what it says: red for trouble ("Overdue", "Over
 * budget", "Late"), amber for a warning ("Due soon"), green for good news
 * ("On track", "Done"), else the next of a few neutral hues.
 */
export const suggestLabelColor = (text: string, index = 0): string => {
    const t = text.toLowerCase();
    if (/overdue|late|over budget|stuck|fail|error|block|reject|missing|expired|urgent|^no$|เกิน|ล่าช้า|เลย|ไม่ผ่าน|หมดอายุ/.test(t)) return RULE_COLORS.red;
    if (/soon|due|pending|wait|risk|review|warning|needs|todo|to do|ใกล้|รอ/.test(t)) return RULE_COLORS.amber;
    if (/on track|on time|done|complete|ok\b|^ok|within|approved|pass|^yes$|good|active|ผ่าน|เสร็จ|เรียบร้อย|ปกติ/.test(t)) return RULE_COLORS.green;
    return [RULE_COLORS.blue, '#7E57C2', '#00ACC1', RULE_COLORS.grey][index % 4];
};

// ---- ready-made rules -----------------------------------------------------------------

let uid = 0;
const id = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(uid++).toString(36)}`;

const DONE_WORDS = /\b(done|complete(d)?|finish(ed)?|closed|resolved|approved)\b|เสร็จ|เรียบร้อย/i;

export interface RuleTemplate {
    id: string;
    title: string;
    description: string;
    build: () => { rules: FormulaRule[]; otherwise: FormulaOutcome };
}

/** The first date-like column: a Timeline, else a Due date, else a Date. */
export const dateColumnOf = (columns: Column[]) =>
    columns.find(c => c.type === 'timeline') || columns.find(c => c.type === 'due_date') || columns.find(c => c.type === 'date');

/**
 * Ready-made rules that fit the columns this formula can read — each one only
 * offered when the columns it needs are there.
 */
export const ruleTemplates = (siblings: Column[], selfId?: string): RuleTemplate[] => {
    const columns = siblings.filter(c => c.id !== selfId);
    const date = dateColumnOf(columns);
    const status = columns.find(c => c.type === 'status');
    const done = status?.options?.find(o => DONE_WORDS.test(o.label));
    const numbers = columns.filter(c => c.type === 'number');
    const people = columns.find(c => c.type === 'people');
    const datePart = date?.type === 'timeline' ? 'end' as const : undefined;
    const keepStatus: FormulaOutcome = status ? { kind: 'column', columnId: status.id } : { kind: 'label', text: 'On track', color: RULE_COLORS.green };
    const notDone = status && done ? [{ id: id('c'), columnId: status.id, op: 'is_not' as const, value: [done.id] }] : [];
    const out: RuleTemplate[] = [];

    if (date) {
        out.push({
            id: 'overdue',
            title: 'Flag overdue',
            description: `"Overdue" once ${refName(date, columns)}${datePart ? ' ends' : ''} has passed${done ? ` and ${refName(status!, columns)} isn't ${done.label}` : ''}`,
            build: () => ({
                rules: [{
                    id: id('r'), match: 'all',
                    conditions: [{ id: id('c'), columnId: date.id, part: datePart, op: 'past' }, ...notDone.map(c => ({ ...c, id: id('c') }))],
                    then: { kind: 'label', text: 'Overdue', color: RULE_COLORS.red },
                }],
                otherwise: keepStatus,
            }),
        });
        out.push({
            id: 'due-soon',
            title: 'Overdue and due soon',
            description: `"Overdue" when ${refName(date, columns)} has passed, "Due soon" in the 3 days before`,
            build: () => ({
                rules: [
                    ...(status && done ? [{
                        id: id('r'), match: 'all' as const,
                        conditions: [{ id: id('c'), columnId: status.id, op: 'is' as const, value: [done.id] }],
                        then: { kind: 'column' as const, columnId: status.id },
                    }] : []),
                    {
                        id: id('r'), match: 'all',
                        conditions: [{ id: id('c'), columnId: date.id, part: datePart, op: 'past' }],
                        then: { kind: 'label', text: 'Overdue', color: RULE_COLORS.red },
                    },
                    {
                        id: id('r'), match: 'all',
                        conditions: [{ id: id('c'), columnId: date.id, part: datePart, op: 'next_days', value: 3 }],
                        then: { kind: 'label', text: 'Due soon', color: RULE_COLORS.amber },
                    },
                ],
                otherwise: keepStatus,
            }),
        });
    }

    if (numbers.length >= 2) {
        const budget = numbers.find(c => /budget|plan|target|งบ|เป้า/i.test(c.title)) || numbers[1];
        const actual = numbers.find(c => c.id !== budget.id && /spent|actual|cost|used|ใช้|จริง/i.test(c.title)) || numbers.find(c => c.id !== budget.id)!;
        out.push({
            id: 'budget',
            title: 'Over budget',
            description: `"Over budget" when ${refName(actual, columns)} is more than ${refName(budget, columns)}`,
            build: () => ({
                rules: [{
                    id: id('r'), match: 'all',
                    conditions: [{ id: id('c'), columnId: actual.id, op: 'gt', value: { column: budget.id } }],
                    then: { kind: 'label', text: 'Over budget', color: RULE_COLORS.red },
                }],
                otherwise: { kind: 'label', text: 'Within budget', color: RULE_COLORS.green },
            }),
        });
    }

    if (people) {
        out.push({
            id: 'owner',
            title: 'Needs an owner',
            description: `"Needs an owner" while ${refName(people, columns)} is empty`,
            build: () => ({
                rules: [{
                    id: id('r'), match: 'all',
                    conditions: [{ id: id('c'), columnId: people.id, op: 'empty' }],
                    then: { kind: 'label', text: 'Needs an owner', color: RULE_COLORS.amber },
                }],
                otherwise: { kind: 'empty' },
            }),
        });
    }
    return out;
};

export const newRuleId = () => id('r');
export const newConditionId = () => id('c');

// ---- example calculations ---------------------------------------------------------------

export interface CalcExample { label: string; expr: string }

/** Example formulas written with the board's own columns (as typed, with titles). */
export const calcExamples = (siblings: Column[], selfId?: string): CalcExample[] => {
    const columns = siblings.filter(c => c.id !== selfId);
    const name = (c: Column) => `{${refName(c, columns)}}`;
    const numbers = columns.filter(c => c.type === 'number');
    const timeline = columns.find(c => c.type === 'timeline');
    const due = columns.find(c => c.type === 'due_date' || c.type === 'date');
    const status = columns.find(c => c.type === 'status');
    const done = status?.options?.find(o => DONE_WORDS.test(o.label));
    const out: CalcExample[] = [];
    if (numbers.length >= 2) {
        out.push({ label: 'Multiply', expr: `${name(numbers[0])} * ${name(numbers[1])}` });
        out.push({ label: 'Difference', expr: `${name(numbers[0])} - ${name(numbers[1])}` });
        out.push({ label: 'Total', expr: `SUM(${numbers.slice(0, 3).map(name).join(', ')})` });
    } else if (numbers.length === 1) {
        out.push({ label: 'Add 7% VAT', expr: `ROUND(${name(numbers[0])} * 1.07, 2)` });
    }
    if (timeline) {
        out.push({ label: 'Days in timeline', expr: `DAYS({${refName(timeline, columns)}#End}, {${refName(timeline, columns)}#Start}) + 1` });
        out.push({ label: 'Days left', expr: `DAYS({${refName(timeline, columns)}#End}, TODAY())` });
    }
    if (due) out.push({ label: 'Days until due', expr: `DAYS(${name(due)}, TODAY())` });
    const dateRef = timeline ? `{${refName(timeline, columns)}#End}` : due ? name(due) : null;
    if (dateRef) {
        out.push({
            label: 'Overdue label',
            expr: status && done
                ? `IF(AND(${dateRef} < TODAY(), ${name(status)} <> "${done.label}"), "Overdue", "On track")`
                : `IF(${dateRef} < TODAY(), "Overdue", "On track")`,
        });
    }
    if (out.length === 0) out.push({ label: 'Name in capitals', expr: 'UPPER({Name})' });
    return out;
};

export { subjectKind };
