import type { VirtualItemData } from '../utils/grouping';

/** A row of the table that has a checkbox: a top-level item or a sub-item. */
export interface CheckableRow {
    id: string;
    level: 'item' | 'subitem';
}

/** The rows with a checkbox, top to bottom, out of everything the table draws (group bars, footers, add rows… are skipped). */
export const checkableRows = (rows: Pick<VirtualItemData, 'type' | 'id'>[]): CheckableRow[] => {
    const out: CheckableRow[] = [];
    for (const row of rows) {
        if (row.type === 'item' || row.type === 'subitem') out.push({ id: row.id, level: row.type });
    }
    return out;
};

/**
 * Shift-click: every id from `anchorId` to `targetId`, both included, in the
 * order the table shows them — whichever of the two is higher up.
 *
 * Only rows of the target's own level count, so a range over top-level items
 * doesn't pick up the sub-items drawn between them (and a parent is never
 * selected together with its own sub-items by accident). Returns null when
 * there is no sensible range — either end isn't on screen (filtered out, in a
 * collapsed group, deleted) or they are different levels — and the caller then
 * falls back to an ordinary tick.
 */
export const rangeBetween = (rows: CheckableRow[], anchorId: string, targetId: string): string[] | null => {
    const from = rows.findIndex(r => r.id === anchorId);
    const to = rows.findIndex(r => r.id === targetId);
    if (from === -1 || to === -1) return null;
    if (rows[from].level !== rows[to].level) return null;
    const [start, end] = from <= to ? [from, to] : [to, from];
    return rows.slice(start, end + 1).filter(r => r.level === rows[to].level).map(r => r.id);
};
