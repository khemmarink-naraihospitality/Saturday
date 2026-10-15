/**
 * The phone table's geometry, kept apart from React so it can be checked from
 * node (tests/mobile_table_test.ts): which rows exist, how tall each is, where
 * each starts, which group's header should stick to the top, and how wide the
 * frozen name column is at a given sideways scroll.
 */
import type { VirtualItemData } from '../../../utils/grouping';

export type TableRow = VirtualItemData | { type: 'gap'; id: string; depth: 0 };

/** Row heights in CSS px, by row type (reference: rows ≈ 44 px). */
export const ROW_HEIGHT: Record<TableRow['type'], number> = {
    group: 48,
    gap: 22,
    item: 44,
    footer: 44,
    'subitem-header': 34,
    subitem: 40,
    'subitem-footer': 40,
    'subitem-summary': 0,
};

/** Left gutter before the frozen column at rest; it scrolls away first (ref 18 → 20). */
export const GUTTER = 16;

/**
 * groupItems' rows as the phone shows them: no sub-item summary rows (the
 * phone has no room for a second summary line) and a gap before every group
 * but the first.
 */
export const toTableRows = (rows: VirtualItemData[]): TableRow[] => {
    const out: TableRow[] = [];
    rows.forEach(row => {
        if (row.type === 'subitem-summary') return;
        if (row.type === 'group' && out.length > 0) out.push({ type: 'gap', id: `gap-${row.id}`, depth: 0 });
        out.push(row);
    });
    return out;
};

/** Where each row starts (prefix sums of the fixed heights) and the total height. */
export const rowOffsets = (rows: TableRow[]): { offsets: number[]; total: number } => {
    const offsets: number[] = new Array(rows.length);
    let y = 0;
    rows.forEach((row, i) => {
        offsets[i] = y;
        y += ROW_HEIGHT[row.type];
    });
    return { offsets, total: y };
};

/**
 * The group whose header should be pinned at the top for a given scrollTop: the
 * last group header that starts above it — but only once that header has
 * actually moved up out of place (at exactly its own position it is visible
 * anyway). Null when no header has scrolled away.
 */
export const stickyGroupIndex = (rows: TableRow[], offsets: number[], scrollTop: number): number | null => {
    let found: number | null = null;
    // Binary search for the last row starting at or before scrollTop…
    let lo = 0;
    let hi = rows.length - 1;
    let last = -1;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (offsets[mid] <= scrollTop) {
            last = mid;
            lo = mid + 1;
        } else {
            hi = mid - 1;
        }
    }
    // …then walk back to its group header.
    for (let i = last; i >= 0; i--) {
        if (rows[i].type === 'group') {
            found = i;
            break;
        }
    }
    if (found === null || offsets[found] >= scrollTop) return null;
    return found;
};

/**
 * The frozen name column's width once the table is scrolled `scrollLeft` px
 * sideways: full width until the gutter has scrolled away, then narrowing one
 * pixel per pixel scrolled — so its right edge stays glued to the first column
 * — down to `min`, after which the columns slide under it.
 */
export const nameColumnWidth = (scrollLeft: number, base: number, min: number): number =>
    Math.max(min, Math.min(base, base - Math.max(0, scrollLeft - GUTTER)));
