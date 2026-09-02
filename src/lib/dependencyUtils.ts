import { addDays, differenceInCalendarDays, format, parseISO, isValid } from 'date-fns';
import type { Column, Item, ItemDependency } from '../types';

/** Column types that can anchor a bar on the Timeline, in the order the view prefers them. */
export const TIMELINE_COLUMN_TYPES = ['timeline', 'date', 'due_date'] as const;
export type TimelineColumnType = (typeof TIMELINE_COLUMN_TYPES)[number];

export interface ResolvedTimelineColumn {
    colId: string;
    type: TimelineColumnType;
    value: any;
}

/** Every date this app stores is a bare calendar day. Never toISOString(). */
const DATE_FORMAT = 'yyyy-MM-dd';
const toDateString = (d: Date) => format(d, DATE_FORMAT);

/** Tolerates both "YYYY-MM-DD" and legacy ISO timestamps written by the old drag handler. */
const parseStoredDate = (value: unknown): Date | null => {
    if (typeof value !== 'string' || !value) return null;
    const parsed = parseISO(value);
    return isValid(parsed) ? parsed : null;
};

/**
 * Which column drives an item's Timeline bar: the first timeline/date/due_date
 * column, in board column order, that the item actually has a value for.
 *
 * This is the single definition shared by the Timeline view and the dependency
 * cascade — if they resolved differently, an arrow could point at one column
 * while the shift landed on another.
 */
export const resolveTimelineColumn = (columns: Column[], item: Item): ResolvedTimelineColumn | null => {
    const candidates = columns.filter(c => (TIMELINE_COLUMN_TYPES as readonly string[]).includes(c.type));

    for (const col of candidates) {
        const value = item.values?.[col.id];
        if (!value) continue;

        if (col.type === 'timeline') {
            // A timeline needs at least a start to place a bar.
            if (!value.from) continue;
            return { colId: col.id, type: 'timeline', value };
        }
        return { colId: col.id, type: col.type as TimelineColumnType, value };
    }

    return null;
};

/**
 * How far a value moved, in calendar days. Null when either side is missing or
 * unparseable — the caller treats that as "nothing to cascade" rather than
 * guessing a delta (clearing a date shouldn't drag successors to 1970).
 */
export const deltaDays = (colType: string, oldValue: any, newValue: any): number | null => {
    const pick = (v: any) => (colType === 'timeline' ? v?.from : v);

    const oldDate = parseStoredDate(pick(oldValue));
    const newDate = parseStoredDate(pick(newValue));
    if (!oldDate || !newDate) return null;

    return differenceInCalendarDays(newDate, oldDate);
};

/** Moves a stored date value by `delta` days, preserving its shape and format. */
export const shiftValue = (colType: string, value: any, delta: number): any => {
    if (colType === 'timeline') {
        const from = parseStoredDate(value?.from);
        const to = parseStoredDate(value?.to);
        if (!from) return value;
        return {
            ...value,
            from: toDateString(addDays(from, delta)),
            // A timeline with no end keeps having none rather than inventing one.
            to: to ? toDateString(addDays(to, delta)) : value?.to
        };
    }

    const date = parseStoredDate(value);
    if (!date) return value;
    return toDateString(addDays(date, delta));
};

/** predecessor -> successors, for one board's edges. */
export const buildSuccessorMap = (deps: ItemDependency[]): Map<string, string[]> => {
    const map = new Map<string, string[]>();
    for (const dep of deps) {
        const list = map.get(dep.predecessorItemId);
        if (list) list.push(dep.successorItemId);
        else map.set(dep.predecessorItemId, [dep.successorItemId]);
    }
    return map;
};

/** Every item reachable downstream of `startId`, following successor edges. */
export const collectDownstream = (deps: ItemDependency[], startId: string, maxNodes = 500): Set<string> => {
    const adjacency = buildSuccessorMap(deps);
    const seen = new Set<string>();
    const queue = [startId];

    while (queue.length > 0 && seen.size < maxNodes) {
        const current = queue.shift()!;
        for (const next of adjacency.get(current) ?? []) {
            if (seen.has(next) || next === startId) continue;
            seen.add(next);
            queue.push(next);
        }
    }

    return seen;
};

/**
 * True when linking predecessor -> successor would close a loop, i.e. the
 * proposed predecessor is already downstream of the proposed successor.
 */
export const wouldCreateCycle = (deps: ItemDependency[], predecessorId: string, successorId: string): boolean => {
    if (predecessorId === successorId) return true;
    return collectDownstream(deps, successorId).has(predecessorId);
};

/**
 * Elbow connector from a predecessor bar's right edge into a successor bar's
 * left edge. When the successor starts left of where the predecessor ends there
 * is no room to go straight across, so the path detours around the rows.
 */
export const buildDependencyPath = (
    from: { x: number; y: number },
    to: { x: number; y: number }
): string => {
    const STUB = 12;
    const ARROW_GAP = 6;
    const target = to.x - ARROW_GAP;

    if (target >= from.x + STUB) {
        const midX = target - STUB / 2;
        return `M ${from.x} ${from.y} H ${midX} V ${to.y} H ${target}`;
    }

    // Successor sits to the left: step out, drop into the gap between the rows,
    // run back, then come up into the target.
    const laneY = from.y + (to.y > from.y ? 1 : -1) * (Math.abs(to.y - from.y) / 2);
    const outX = from.x + STUB;
    const backX = target - STUB;
    return `M ${from.x} ${from.y} H ${outX} V ${laneY} H ${backX} V ${to.y} H ${target}`;
};
