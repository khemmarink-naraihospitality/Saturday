import type {
    Board, Column, FormulaColumnRef, FormulaCondition, FormulaConditionOp, FormulaConfig, FormulaOutcome, FormulaPart, Item,
} from '../../types';
import {
    dayFromISO, evaluate, fDate, fError, fLabel, formatDay, isBlank, isDate, isError, isLabel, isoFromDay, parseFormula,
    parseNumberText, partsFromDay, toNumber, toText, todayDay, collectRefs,
    type EvalEnv, type FValue,
} from './engine';
import { NAME_REF, exprColumnIds, remapExpr, resolveTitle } from './refs';
import { linkDisplayText } from '../utils';
import { toRating } from '../priority';
import { getCurrencySymbol } from '../../utils/format';

export * from './engine';
export * from './refs';

/*
 * A Formula column's result for a row: what each column type means inside a
 * formula, the If / Then / Else rules, and how a result reads in a cell, a
 * group summary, a sort and a filter. Pure (no React, no store): the desktop
 * table, the phone and the Excel export all call the same functions.
 */

/** The row being worked out: its name and its stored values. */
export interface FormulaRow { id?: string; title: string; values: Record<string, unknown> }

export interface FormulaContext {
    /** Today as a calendar day (todayDay()); results that compare dates with it change at midnight. */
    today: number;
    /** A person's name, for {Person}. */
    personName?: (userId: string) => string | undefined;
}

// ---- people -------------------------------------------------------------------

type MemberLike = { user_id: string; profiles?: unknown };
let peopleSource: (() => MemberLike[]) | null = null;
let peopleFor: MemberLike[] | null = null;
let peopleNames = new Map<string, string>();

/** Where {Person} finds names: the open board's members (set once by the store). */
export const setFormulaPeopleSource = (source: () => MemberLike[]) => { peopleSource = source; };

export const formulaPersonName = (userId: string): string | undefined => {
    const members = peopleSource?.() || [];
    if (members !== peopleFor) {
        peopleFor = members;
        peopleNames = new Map(members.map(m => {
            const p = (Array.isArray(m.profiles) ? m.profiles[0] : m.profiles) as { full_name?: string; email?: string } | undefined;
            return [m.user_id, p?.full_name || p?.email || ''];
        }));
    }
    return peopleNames.get(userId) || undefined;
};

/** The context the app evaluates in: today, and the board's people. */
export const formulaContext = (today: number = todayDay()): FormulaContext => ({ today, personName: formulaPersonName });

// ---- column values ------------------------------------------------------------------

interface RowEnv {
    row: FormulaRow;
    siblings: Column[];
    ctx: FormulaContext;
    /** Formula columns being worked out further up, to stop a loop. */
    visiting: Set<string>;
}

const optionOf = (column: Column, raw: unknown) => {
    if (raw === null || raw === undefined || raw === '') return undefined;
    const options = Array.isArray(column.options) ? column.options : [];
    return options.find(o => o.id === raw || o.label === raw);
};

const listOf = (raw: unknown): string[] =>
    (Array.isArray(raw) ? raw : raw === null || raw === undefined || raw === '' ? [] : [raw]).map(String);

export const peopleIdsOf = (raw: unknown): string[] => {
    if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
    if (typeof raw === 'string' && raw) {
        if (raw.startsWith('[')) {
            try { const parsed = JSON.parse(raw); if (Array.isArray(parsed)) return parsed.map(String); } catch { /* not a list */ }
        }
        return [raw];
    }
    return [];
};

const dropdownLabels = (column: Column, raw: unknown): string[] =>
    listOf(raw).map(v => optionOf(column, v)?.label ?? v).filter(Boolean);

const timelineDays = (raw: unknown): { from: number | null; to: number | null } => {
    const v = (raw && typeof raw === 'object' ? raw : {}) as { from?: unknown; to?: unknown };
    return { from: dayFromISO(v.from), to: dayFromISO(v.to) };
};

/**
 * What a column stands for inside a formula: a number, text, a date, TRUE /
 * FALSE, or a status label with its colour. Empty is null.
 */
export const columnValue = (column: Column, raw: unknown, part: string | undefined, env: RowEnv): FValue => {
    switch (column.type) {
        case 'number': {
            if (raw === null || raw === undefined || raw === '') return null;
            if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
            // A typed "50%" is the number 50, as its cell shows it.
            const n = parseNumberText(String(raw).replace(/%\s*$/, ''));
            return Number.isNaN(n) ? String(raw) : n;
        }
        case 'priority': {
            const r = toRating(raw);
            return r > 0 ? r : null;
        }
        case 'status': {
            const option = optionOf(column, raw);
            if (!option) return raw ? String(raw) : null;
            return option.label === 'Default' || !option.label ? null : fLabel(option.label, option.color);
        }
        case 'dropdown': {
            const labels = dropdownLabels(column, raw);
            return labels.length ? labels.join(', ') : null;
        }
        case 'date':
        case 'due_date': {
            const d = dayFromISO(raw);
            return d === null ? null : fDate(d);
        }
        case 'timeline': {
            const { from, to } = timelineDays(raw);
            if (part === 'start') return from === null ? null : fDate(from);
            if (part === 'end') return to !== null ? fDate(to) : from !== null ? fDate(from) : null;
            if (part === 'days') return from !== null && to !== null ? to - from + 1 : null;
            if (from === null && to === null) return null;
            const short = (d: number | null) => (d === null ? '' : formatDay(d, 'MMM D'));
            return `${short(from)} - ${short(to)}`;
        }
        case 'checkbox':
            return raw === true;
        case 'people': {
            const ids = peopleIdsOf(raw);
            if (ids.length === 0) return null;
            const names = ids.map(id => env.ctx.personName?.(id) || '').filter(Boolean);
            return names.length ? names.join(', ') : `${ids.length} ${ids.length === 1 ? 'person' : 'people'}`;
        }
        case 'files': {
            const n = Array.isArray(raw) ? raw.length : 0;
            return n > 0 ? n : null;
        }
        case 'link': {
            const text = linkDisplayText(raw);
            return text || null;
        }
        case 'formula':
            return evaluateColumnIn(column, env.row, env.siblings, env.ctx, env.visiting);
        default: {
            if (raw === null || raw === undefined || typeof raw === 'object') return null;
            const s = String(raw);
            return s === '' ? null : s;
        }
    }
};

const refValue = (env: RowEnv, id: string, part?: string): FValue => {
    if (id === NAME_REF) return env.row.title || null;
    const column = env.siblings.find(c => c.id === id);
    if (!column) return fError('#REF!', 'A column this formula uses has been deleted');
    return columnValue(column, env.row.values?.[column.id], part, env);
};

const exprEnv = (env: RowEnv): EvalEnv => {
    // Each {…} is looked up once per row, however often the expression reads it.
    const seen = new Map<string, FValue>();
    return {
        today: env.ctx.today,
        ref: target => {
            const key = `${target.id ?? `?${target.title}`}:${target.part ?? ''}`;
            if (seen.has(key)) return seen.get(key)!;
            let value: FValue;
            let id = target.id;
            if (!id) {
                // Typed by title (the editor's preview of a formula not yet saved).
                const hit = resolveTitle(target.title || '', env.siblings);
                id = hit?.id;
            }
            value = id ? refValue(env, id, target.part) : fError('#REF!', `There is no column called {${target.title}}`);
            seen.set(key, value);
            return value;
        },
    };
};

const evaluateExpression = (stored: string, env: RowEnv): FValue => {
    const { ast, error } = parseFormula(stored);
    if (!ast) return fError('#ERROR!', error?.message || 'This formula can\'t be read');
    const scope = exprEnv(env);
    // A row shows nothing until one of the columns its formula uses is filled
    // in: {Price} * {Qty} on a new row is blank, not 0.
    const refs = collectRefs(ast);
    if (refs.length > 0 && refs.every(r => isBlank(scope.ref(r)))) return null;
    return evaluate(ast, scope);
};

// ---- If / Then / Else ---------------------------------------------------------------

/** How a condition treats a column: which comparisons it offers and what it compares. */
export type SubjectKind = 'status' | 'dropdown' | 'people' | 'checkbox' | 'files' | 'number' | 'date' | 'text' | 'formula';

export const subjectKind = (column: Column | null | undefined): SubjectKind => {
    if (!column) return 'text'; // the item's name
    switch (column.type) {
        case 'status': return 'status';
        case 'dropdown': return 'dropdown';
        case 'people': return 'people';
        case 'checkbox': return 'checkbox';
        case 'files': return 'files';
        case 'number':
        case 'priority': return 'number';
        case 'date':
        case 'due_date':
        case 'timeline': return 'date';
        case 'formula': return 'formula';
        default: return 'text';
    }
};

export const isColumnRef = (v: unknown): v is FormulaColumnRef =>
    !!v && typeof v === 'object' && !Array.isArray(v) && typeof (v as FormulaColumnRef).column === 'string';

const DATE_OPS: FormulaConditionOp[] = ['past', 'today', 'future', 'next_days', 'overdue_by', 'before', 'after', 'on'];
const NUMBER_OPS: FormulaConditionOp[] = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'];

const asNumberOrNull = (v: FValue): number | null => {
    if (isBlank(v) || isError(v) || isDate(v)) return null;
    const n = toNumber(v);
    return isError(n) ? null : n;
};

const asDayOrNull = (v: FValue): number | null => {
    if (isDate(v)) return v.day;
    if (typeof v === 'string' || isLabel(v)) return dayFromISO(toText(v));
    return null;
};

const numberHolds = (op: FormulaConditionOp, n: number | null, value: FormulaCondition['value'], env: RowEnv): boolean | null => {
    let target: number | null;
    if (isColumnRef(value)) {
        target = asNumberOrNull(refValue(env, value.column, value.part));
        if (target === null) return false;
    } else if (typeof value === 'number') {
        target = Number.isFinite(value) ? value : null;
    } else if (typeof value === 'string' && value.trim() !== '') {
        const parsed = parseNumberText(value);
        target = Number.isNaN(parsed) ? null : parsed;
    } else {
        target = null;
    }
    if (target === null) return null; // no value chosen yet
    if (n === null) return op === 'neq';
    const eq = Math.abs(n - target) < 1e-9;
    switch (op) {
        case 'eq': return eq;
        case 'neq': return !eq;
        case 'gt': return n > target && !eq;
        case 'gte': return n > target || eq;
        case 'lt': return n < target && !eq;
        case 'lte': return n < target || eq;
        default: return null;
    }
};

const dayCount = (value: FormulaCondition['value'], fallback: number): number => {
    const n = typeof value === 'number' ? value : typeof value === 'string' ? parseFloat(value) : NaN;
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
};

const dateHolds = (op: FormulaConditionOp, d: number | null, value: FormulaCondition['value'], env: RowEnv): boolean | null => {
    const today = env.ctx.today;
    switch (op) {
        case 'past': return d !== null && d < today;
        case 'today': return d === today;
        case 'future': return d !== null && d > today;
        case 'next_days': return d !== null && d >= today && d <= today + dayCount(value, 7);
        case 'overdue_by': return d !== null && d < today - dayCount(value, 0);
        case 'before':
        case 'after':
        case 'on': {
            let target: number | null;
            if (isColumnRef(value)) {
                target = asDayOrNull(refValue(env, value.column, value.part ?? 'end'));
                if (target === null) return false;
            } else {
                target = dayFromISO(value);
                if (target === null) return null; // no date chosen yet
            }
            if (d === null) return false;
            return op === 'before' ? d < target : op === 'after' ? d > target : d === target;
        }
        default: return null;
    }
};

const textHolds = (op: FormulaConditionOp, text: string, value: FormulaCondition['value']): boolean | null => {
    const wanted = (Array.isArray(value) ? value[0] ?? '' : value === null || value === undefined || isColumnRef(value) ? '' : String(value)).trim().toLowerCase();
    if (wanted === '') return null;
    const s = text.trim().toLowerCase();
    switch (op) {
        case 'is': return s === wanted;
        case 'is_not': return s !== wanted;
        case 'contains': return s.includes(wanted);
        case 'not_contains': return !s.includes(wanted);
        default: return null;
    }
};

/** Whether a condition holds for the row; null while it is still being filled in (it is then left out). */
export const conditionHolds = (cond: FormulaCondition, env: RowEnv): boolean | null => {
    if (!cond.columnId || !cond.op) return null;
    const isName = cond.columnId === NAME_REF;
    const column = isName ? null : env.siblings.find(c => c.id === cond.columnId);
    if (!isName && !column) return false; // its column was deleted
    const raw = column ? env.row.values?.[column.id] : env.row.title;
    const kind = subjectKind(column);
    const part = column?.type === 'timeline' ? (cond.part || 'end') : undefined;
    const op = cond.op;
    const value = (): FValue => (column ? columnValue(column, raw, part, env) : (env.row.title || null));

    if (op === 'empty' || op === 'not_empty') {
        const v = kind === 'checkbox' ? (raw === true ? true : null) : value();
        const empty = isBlank(v);
        return op === 'empty' ? empty : !empty;
    }

    switch (kind) {
        case 'checkbox':
            return op === 'checked' ? raw === true : op === 'unchecked' ? raw !== true : null;
        case 'status': {
            const wanted = listOf(cond.value);
            if (wanted.length === 0) return null;
            const option = optionOf(column!, raw);
            const hit = !!option && (wanted.includes(option.id) || wanted.includes(option.label));
            return op === 'is' ? hit : op === 'is_not' ? !hit : null;
        }
        case 'dropdown': {
            const wanted = listOf(cond.value).map(s => s.toLowerCase());
            if (wanted.length === 0) return null;
            const labels = dropdownLabels(column!, raw).map(s => s.toLowerCase());
            const hit = wanted.some(w => labels.includes(w));
            return op === 'contains' || op === 'is' ? hit : op === 'not_contains' || op === 'is_not' ? !hit : null;
        }
        case 'people': {
            const wanted = listOf(cond.value);
            if (wanted.length === 0) return null;
            const ids = peopleIdsOf(raw);
            const hit = wanted.some(w => ids.includes(w));
            return op === 'includes' ? hit : op === 'not_includes' ? !hit : null;
        }
        case 'files':
            return null;
        case 'number':
            return numberHolds(op, asNumberOrNull(value()), cond.value, env);
        case 'date':
            return dateHolds(op, asDayOrNull(value()), cond.value, env);
        case 'formula': {
            const v = value();
            if (isError(v)) return false;
            if (NUMBER_OPS.includes(op)) return numberHolds(op, asNumberOrNull(v), cond.value, env);
            if (DATE_OPS.includes(op)) return dateHolds(op, asDayOrNull(v), cond.value, env);
            return textHolds(op, toText(v), cond.value);
        }
        default:
            return textHolds(op, toText(value()), cond.value);
    }
};

const outcomeValue = (outcome: FormulaOutcome | undefined, env: RowEnv): FValue => {
    if (!outcome) return null;
    switch (outcome.kind) {
        case 'label': return outcome.text.trim() ? fLabel(outcome.text.trim(), outcome.color || '#c4c4c4') : null;
        case 'text': return outcome.text === '' ? null : outcome.text;
        case 'number': return Number.isFinite(outcome.value) ? outcome.value : null;
        case 'column': return outcome.columnId ? refValue(env, outcome.columnId, outcome.part) : null;
        case 'calc': return outcome.expr.trim() ? evaluateExpression(outcome.expr, env) : null;
        default: return null;
    }
};

const evaluateRules = (config: FormulaConfig, env: RowEnv): FValue => {
    for (const rule of config.rules || []) {
        const results = rule.conditions.map(c => conditionHolds(c, env)).filter((r): r is boolean => r !== null);
        if (results.length === 0) continue;
        const holds = rule.match === 'any' ? results.some(Boolean) : results.every(Boolean);
        if (holds) return outcomeValue(rule.then, env);
    }
    return outcomeValue(config.otherwise, env);
};

// ---- a column's result -------------------------------------------------------------

function evaluateColumnIn(column: Column, row: FormulaRow, siblings: Column[], ctx: FormulaContext, visiting: Set<string>): FValue {
    const config = column.formula;
    if (!config) return null;
    if (visiting.has(column.id)) return fError('#CYCLE!', 'These formulas use each other in a loop');
    visiting.add(column.id);
    try {
        const env: RowEnv = { row, siblings, ctx, visiting };
        if (config.mode === 'rules') return evaluateRules(config, env);
        return config.expr?.trim() ? evaluateExpression(config.expr, env) : null;
    } finally {
        visiting.delete(column.id);
    }
}

/**
 * A Formula column's result for one row. `siblings` is the column's set — the
 * item columns, or its group's sub-item columns — which its {…} name.
 */
export const evaluateColumn = (column: Column, row: FormulaRow, siblings: Column[], ctx: FormulaContext = formulaContext()): FValue =>
    evaluateColumnIn(column, row, siblings, ctx, new Set());

// ---- how a result reads -----------------------------------------------------------

export interface FormulaDisplay {
    kind: 'empty' | 'number' | 'text' | 'label' | 'date' | 'bool' | 'error';
    /** What the cell says; also what sorts, filters and exports. */
    text: string;
    color?: string;
    number?: number;
    day?: number;
    bool?: boolean;
    /** The longer story: an error's explanation. */
    title?: string;
}

/** A number result as the column formats it: decimals, then %, a currency or neither. */
export const formatFormulaNumber = (n: number, column: Pick<Column, 'formula' | 'numberFormat' | 'currencyCode'>): string => {
    const decimals = column.formula?.decimals;
    // Percent shows a ratio as a percentage: 0.85 reads 85%.
    const value = column.numberFormat === 'percent' ? n * 100 : n;
    const options: Intl.NumberFormatOptions = typeof decimals === 'number'
        ? { minimumFractionDigits: decimals, maximumFractionDigits: decimals }
        : { maximumFractionDigits: 2 };
    const text = value.toLocaleString(undefined, options);
    switch (column.numberFormat) {
        case 'percent': return `${text}%`;
        case 'currency': return `${getCurrencySymbol(column.currencyCode)}${text}`;
        default: return text;
    }
};

/** A date the way the table writes dates: "Nov 30", with the year when it isn't this one. */
export const formatFormulaDate = (day: number, today: number = todayDay()): string =>
    formatDay(day, partsFromDay(day).y === partsFromDay(today).y ? 'MMM D' : 'MMM D, YYYY');

export const formulaDisplay = (value: FValue, column: Pick<Column, 'formula' | 'numberFormat' | 'currencyCode'>, today?: number): FormulaDisplay => {
    if (value === null || value === '') return { kind: 'empty', text: '' };
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) return { kind: 'error', text: '#NUM!', title: 'The number is too large' };
        return { kind: 'number', text: formatFormulaNumber(value, column), number: value };
    }
    if (typeof value === 'boolean') return { kind: 'bool', text: value ? 'Yes' : 'No', bool: value };
    if (isError(value)) return { kind: 'error', text: value.code, title: value.message };
    if (isDate(value)) return { kind: 'date', text: formatFormulaDate(value.day, today), day: value.day };
    if (isLabel(value)) return value.text ? { kind: 'label', text: value.text, color: value.color } : { kind: 'empty', text: '' };
    const color = column.formula?.labelColors?.[value];
    return color ? { kind: 'label', text: value, color } : { kind: 'text', text: value };
};

/** The result of a Formula column for a row, ready to draw. */
export const formulaCell = (column: Column, row: FormulaRow, siblings: Column[], ctx: FormulaContext = formulaContext()): FormulaDisplay =>
    formulaDisplay(evaluateColumn(column, row, siblings, ctx), column, ctx.today);

/** The result as a plain value for a spreadsheet: a number, a "YYYY-MM-DD" date, or text. */
export const formulaExportValue = (value: FValue): string | number | boolean => {
    if (value === null) return '';
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    if (isDate(value)) return isoFromDay(value.day);
    if (isError(value)) return value.code;
    return toText(value);
};

/** Sort order for results: numbers, dates and Yes/No by value, then text, empty last. */
export const compareFormulaDisplays = (a: FormulaDisplay, b: FormulaDisplay): number => {
    const rank = (d: FormulaDisplay) => d.kind === 'empty' ? 3 : d.kind === 'error' ? 2 : d.kind === 'text' || d.kind === 'label' ? 1 : 0;
    const key = (d: FormulaDisplay) => d.kind === 'number' ? d.number! : d.kind === 'date' ? d.day! : d.kind === 'bool' ? (d.bool ? 1 : 0) : 0;
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    if (ra === 0) return key(a) - key(b);
    return a.text.toLowerCase().localeCompare(b.text.toLowerCase());
};

// ---- group summaries ----------------------------------------------------------------

export interface FormulaSummaryPart { key: string; label: string; color: string; count: number }

export type FormulaSummary =
    | { kind: 'none'; count: 0 }
    | { kind: 'number'; sum: number; values: number[]; count: number }
    | { kind: 'labels'; parts: FormulaSummaryPart[]; empty: number; count: number }
    | { kind: 'dates'; min: number; max: number; count: number }
    | { kind: 'count'; count: number };

const NEUTRAL = '#c4c4c4';

/** What a group's summary row shows for a Formula column, from its rows' results. */
export const summarizeFormula = (column: Column, rows: FormulaRow[], siblings: Column[], ctx: FormulaContext = formulaContext()): FormulaSummary => {
    const displays = rows.map(r => formulaCell(column, r, siblings, ctx));
    const present = displays.filter(d => d.kind !== 'empty');
    if (present.length === 0) return { kind: 'none', count: 0 };
    if (present.every(d => d.kind === 'number')) {
        const values = present.map(d => d.number!);
        return { kind: 'number', sum: values.reduce((a, b) => a + b, 0), values, count: values.length };
    }
    if (present.every(d => d.kind === 'date')) {
        const days = present.map(d => d.day!);
        return { kind: 'dates', min: Math.min(...days), max: Math.max(...days), count: days.length };
    }
    if (present.some(d => d.kind === 'label') && present.every(d => d.kind === 'label' || d.kind === 'text')) {
        const parts = new Map<string, FormulaSummaryPart>();
        present.forEach(d => {
            const part = parts.get(d.text);
            if (part) part.count++;
            else parts.set(d.text, { key: d.text, label: d.text, color: d.color || NEUTRAL, count: 1 });
        });
        return { kind: 'labels', parts: [...parts.values()], empty: displays.length - present.length, count: present.length };
    }
    return { kind: 'count', count: present.length };
};

// ---- which rows a column is on ----------------------------------------------------

/**
 * The rows a Formula column has a result on: top-level items for an item
 * column; for a sub-item column, the sub-items under its group's items.
 */
export const formulaRows = (board: Pick<Board, 'items'>, column: Column): Item[] => {
    if (column.scope !== 'subitem') return board.items.filter(i => !i.parentId);
    const parentGroup = new Map(board.items.filter(i => !i.parentId).map(i => [i.id, i.groupId]));
    return board.items.filter(i => i.parentId && parentGroup.get(i.parentId) === column.groupId);
};

// ---- copying a formula elsewhere -----------------------------------------------------

/**
 * The same formula with its column ids swapped through `map` — for a copied
 * board or a linked group, whose columns have new ids. `optionMap` translates
 * Status option ids where the target column's options differ.
 */
export const remapFormula = (
    config: FormulaConfig | undefined | null,
    map: (columnId: string) => string | undefined,
    optionMap?: (columnId: string, optionId: string) => string | undefined,
): FormulaConfig | undefined => {
    if (!config) return undefined;
    const id = (x: string) => (x === NAME_REF ? x : map(x) ?? x);
    const outcome = (o: FormulaOutcome): FormulaOutcome =>
        o.kind === 'column' ? { ...o, columnId: id(o.columnId) }
            : o.kind === 'calc' ? { ...o, expr: remapExpr(o.expr, map) }
                : o;
    return {
        ...config,
        expr: config.expr ? remapExpr(config.expr, map) : config.expr,
        rules: config.rules?.map(rule => ({
            ...rule,
            conditions: rule.conditions.map(c => ({
                ...c,
                columnId: id(c.columnId),
                value: isColumnRef(c.value)
                    ? { ...c.value, column: id(c.value.column) }
                    : Array.isArray(c.value) && optionMap
                        ? c.value.map(v => optionMap(c.columnId, v) ?? v)
                        : c.value,
            })),
            then: outcome(rule.then),
        })),
        otherwise: config.otherwise ? outcome(config.otherwise) : config.otherwise,
    };
};

/** Every column a formula reads (for the editor and for checks). */
export const formulaColumnIds = (config: FormulaConfig | undefined): string[] => {
    if (!config) return [];
    const ids = new Set<string>();
    const fromOutcome = (o?: FormulaOutcome) => {
        if (!o) return;
        if (o.kind === 'column') ids.add(o.columnId);
        if (o.kind === 'calc') exprColumnIds(o.expr).forEach(i => ids.add(i));
    };
    if (config.mode === 'calc') exprColumnIds(config.expr || '').forEach(i => ids.add(i));
    else {
        config.rules?.forEach(r => {
            r.conditions.forEach(c => {
                if (c.columnId && c.columnId !== NAME_REF) ids.add(c.columnId);
                if (isColumnRef(c.value)) ids.add(c.value.column);
            });
            fromOutcome(r.then);
        });
        fromOutcome(config.otherwise);
    }
    ids.delete(NAME_REF);
    return [...ids];
};

// ---- is it ready to save --------------------------------------------------------------

export interface FormulaProblem { message: string; at?: number; end?: number }

/**
 * What would stop an expression working, or null — stored ({#id}) or as typed
 * ({Title}); positions point into the text given, for the editor to underline.
 */
export const checkExpression = (text: string, siblings: Column[], selfId?: string): FormulaProblem | null => {
    if (!text.trim()) return { message: 'Write a formula first' };
    const { ast, error } = parseFormula(text);
    if (!ast) return error ? { message: error.message, at: error.at, end: error.end } : { message: 'This formula can\'t be read' };
    for (const ref of collectRefs(ast)) {
        const id = ref.id ?? resolveTitle(ref.title || '', siblings)?.id;
        if (!id) return { message: `There is no column called {${ref.title}} — type { to pick one`, at: ref.at, end: ref.end };
        if (id === NAME_REF) continue;
        if (id === selfId) return { message: 'A formula can\'t use its own column', at: ref.at, end: ref.end };
        const column = siblings.find(c => c.id === id);
        if (!column) return { message: 'A column this formula uses has been deleted', at: ref.at, end: ref.end };
        if (ref.part && column.type !== 'timeline') return { message: `#${ref.part[0].toUpperCase()}${ref.part.slice(1)} only works on a Timeline column`, at: ref.at, end: ref.end };
    }
    return null;
};

/** What is still missing from a rules formula, or null. */
export const checkRules = (config: FormulaConfig, siblings: Column[], selfId?: string): FormulaProblem | null => {
    const rules = config.rules || [];
    if (rules.length === 0) return { message: 'Add an IF first' };
    const checkOutcome = (o: FormulaOutcome | undefined, where: string): FormulaProblem | null => {
        if (!o) return null;
        if (o.kind === 'label' && !o.text.trim()) return { message: `${where}: give the label a name` };
        if (o.kind === 'column') {
            if (!o.columnId) return { message: `${where}: choose which column to show` };
            if (o.columnId === selfId) return { message: `${where}: a formula can't show its own column` };
        }
        if (o.kind === 'calc') {
            const problem = checkExpression(o.expr, siblings, selfId);
            if (problem) return { message: `${where}: ${problem.message}` };
        }
        return null;
    };
    for (let i = 0; i < rules.length; i++) {
        const rule = rules[i];
        const where = rules.length > 1 ? `IF ${i + 1}` : 'IF';
        const complete = rule.conditions.filter(c => isConditionComplete(c));
        if (complete.length === 0) return { message: `${where}: choose a column and what it should be` };
        if (rule.conditions.some(c => c.columnId === selfId)) return { message: `${where}: a formula can't test its own column` };
        const problem = checkOutcome(rule.then, `${where} → THEN`);
        if (problem) return problem;
    }
    return checkOutcome(config.otherwise, 'ELSE');
};

/** Whether a condition has everything it needs. */
export const isConditionComplete = (c: FormulaCondition): boolean => {
    if (!c.columnId || !c.op) return false;
    switch (c.op) {
        case 'empty': case 'not_empty': case 'checked': case 'unchecked':
        case 'past': case 'today': case 'future': case 'next_days': case 'overdue_by':
            return true;
        default:
            if (isColumnRef(c.value)) return !!c.value.column;
            if (Array.isArray(c.value)) return c.value.length > 0;
            return c.value !== undefined && c.value !== null && String(c.value).trim() !== '';
    }
};

export const DEFAULT_FORMULA_PARTS: Record<string, FormulaPart> = { timeline: 'end' };

/** A Formula column's stored definition (columns.formula, jsonb) as the app uses it; undefined when there is none. */
export const formulaFromRow = (raw: unknown): FormulaConfig | undefined => {
    let value = raw;
    if (typeof value === 'string') {
        try { value = JSON.parse(value); } catch { return undefined; }
    }
    if (!value || typeof value !== 'object') return undefined;
    const config = value as FormulaConfig;
    return config.mode === 'calc' || config.mode === 'rules' ? config : undefined;
};
