import type { Column, ColumnScope } from '../types';

/*
 * Items and sub-items never share a column, and sub-item columns belong to one
 * group. A board's columns therefore fall into separate sets — the items', and
 * one per group for the sub-items under that group's items — each shown under
 * its own header and ordered on its own.
 *
 * A sub-item's group is its parent's: that is what it's seen under, and moving
 * a parent to another group takes its sub-items' values along to that group's
 * columns (see planCarry).
 */

export const scopeOf = (column: Pick<Column, 'scope'>): ColumnScope =>
    column.scope === 'subitem' ? 'subitem' : 'item';

/** Columns shown on top-level items. */
export const itemColumns = (columns: Column[]): Column[] =>
    columns.filter(c => scopeOf(c) === 'item');

/** Columns shown on the sub-items under one group's items. */
export const subitemColumns = (columns: Column[], groupId: string | null | undefined): Column[] =>
    groupId ? columns.filter(c => scopeOf(c) === 'subitem' && c.groupId === groupId) : [];

/** The set a column belongs to: the columns shown under the same header. */
export const siblingColumns = (columns: Column[], column: Pick<Column, 'scope' | 'groupId'>): Column[] =>
    scopeOf(column) === 'subitem' ? subitemColumns(columns, column.groupId) : itemColumns(columns);

/**
 * The board's columns with one set replaced by `set` (that set's columns, in
 * their new sequence), renumbered 1..n the way reorder_columns stores them.
 * Other sets keep their numbers: each set is ordered on its own, so adding or
 * moving a column renumbers a dozen columns rather than every column on a board
 * with sub-item columns in dozens of groups.
 */
export const replaceSet = (columns: Column[], set: Column[]): Column[] => {
    const ids = new Set(set.map(c => c.id));
    const renumbered = set.map((c, i) => ({ ...c, order: i + 1 }));
    return [...columns.filter(c => !ids.has(c.id)), ...renumbered].sort((a, b) => a.order - b.order);
};

/**
 * Whether a stored value counts as filled in: not empty text, an empty list, an
 * object with nothing set (a timeline with no dates) or an unticked checkbox.
 * The column-split migration (20261002) uses the same test.
 */
export const hasValue = (v: unknown): boolean => {
    if (v === null || v === undefined || v === false) return false;
    if (typeof v === 'string') return v.trim() !== '';
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === 'object') return Object.values(v as Record<string, unknown>).some(x => x !== null && x !== undefined && String(x) !== '');
    return true;
};

const sameTitle = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export interface CarryPlan {
    /** Clones to add to the target set, for source columns it had no match for. */
    created: Column[];
    /** Target columns that gained status/dropdown options to hold what came in. */
    updated: Column[];
    /** The row's values re-keyed onto the target set. */
    remap: (values: Record<string, any>) => Record<string, any>;
}

/**
 * Re-key rows' values from one set of columns onto another, for rows moving
 * between them: a parent changing group takes its sub-items from one group's
 * sub-item columns to the other's, an item turned into a sub-item goes from the
 * item columns to its new group's. Values are keyed by column id, so without
 * this they'd stay under columns the rows' new place doesn't show.
 *
 * Each source column with a value in some row is matched to a target column of
 * the same title and type. Status values are option ids and are matched by
 * label, a label the target lacks being added to it. With `createMissing`, an
 * unmatched column is cloned into the target set so nothing goes out of sight;
 * without it, the value stays where it was (still stored, just not shown).
 */
export const planCarry = (
    rows: { values?: Record<string, any> }[],
    from: Column[],
    to: Column[],
    target: { scope: ColumnScope; groupId?: string },
    newId: () => string,
    createMissing = true
): CarryPlan => {
    const mapping = new Map<string, { to: string; options?: Map<string, string> }>();
    const created: Column[] = [];
    const updated = new Map<string, Column>();
    const taken = new Set<string>();
    let nextOrder = Math.max(0, ...to.map(c => c.order || 0)) + 1;

    for (const src of from) {
        if (!rows.some(r => hasValue(r.values?.[src.id]))) continue;
        const match = to.find(t => !taken.has(t.id) && t.type === src.type && sameTitle(t.title, src.title));
        if (match) {
            taken.add(match.id);
            let options: Map<string, string> | undefined;
            if (src.type === 'status') {
                options = new Map();
                let targetOptions = [...(match.options || [])];
                const used = new Set(rows.map(r => r.values?.[src.id]).filter(v => typeof v === 'string'));
                for (const opt of src.options || []) {
                    const same = targetOptions.find(o => sameTitle(o.label, opt.label));
                    if (same) { options.set(opt.id, same.id); continue; }
                    if (!used.has(opt.id)) continue;
                    // A label the target doesn't have, in use by a moving row: add it.
                    const added = targetOptions.some(o => o.id === opt.id) ? { ...opt, id: newId() } : { ...opt };
                    targetOptions = [...targetOptions, added];
                    options.set(opt.id, added.id);
                    updated.set(match.id, { ...match, options: targetOptions });
                }
            } else if (src.type === 'dropdown') {
                // Dropdown values are labels; only labels the target lacks need adding.
                const used = new Set(rows.flatMap(r => Array.isArray(r.values?.[src.id]) ? r.values![src.id] : []));
                const current = updated.get(match.id) || match;
                const missing = (src.options || []).filter(o => used.has(o.label) && !(current.options || []).some(t => sameTitle(t.label, o.label)));
                if (missing.length) updated.set(match.id, { ...current, options: [...(current.options || []), ...missing.map(o => ({ ...o, id: newId() }))] });
            }
            mapping.set(src.id, { to: match.id, options });
        } else if (createMissing) {
            const clone: Column = { ...src, id: newId(), scope: target.scope, groupId: target.scope === 'subitem' ? target.groupId : undefined, order: nextOrder++ };
            created.push(clone);
            mapping.set(src.id, { to: clone.id });
        }
    }

    const remap = (values: Record<string, any>) => {
        const out = { ...values };
        mapping.forEach((m, srcId) => {
            if (!(srcId in values)) return;
            const v = values[srcId];
            delete out[srcId];
            if (!hasValue(v) && hasValue(out[m.to])) return;
            out[m.to] = m.options && typeof v === 'string' ? (m.options.get(v) ?? v) : v;
        });
        return out;
    };

    return { created, updated: [...updated.values()], remap };
};

type RawColumn = { id: string; scope?: string | null; group_id?: string | null; [key: string]: any };
type RawItem = { id: string; parent_id?: string | null; group_id?: string | null; values?: any; is_archived?: boolean | null; [key: string]: any };

/**
 * Turns columns written before items and sub-items had separate columns — scope
 * 'both' or none, or 'subitem' with no group — into the current shape, on raw
 * database rows. Used for a backup made before the split, and by the Excel
 * import, which reads a Monday export's main and sub-item tables into one column
 * list and marks each column with the table(s) it came from.
 *
 * The rules are the ones the 20261002 migration applied to existing boards:
 *   - 'subitem' with no group: a copy for every group that has sub-items;
 *   - 'both': the items' if any item has a value in it; plus a copy for each
 *     group whose sub-items have a value in it, those sub-items' values moving
 *     to the copy. Unused by any item, the column itself becomes the first such
 *     group's. Unused by any sub-item, it's simply the items'.
 * Columns already scoped keep their scope. Values aren't lost: every value ends
 * up under a column its row shows.
 */
export const splitSharedColumns = <C extends RawColumn, I extends RawItem>(
    columns: C[],
    items: I[],
    groups: { id: string; order?: number | null }[],
    newId: () => string
): { columns: C[]; items: I[] } => {
    const rank = new Map(groups.map((g, i) => [g.id, (g.order ?? 0) * 1e6 + i]));
    const byId = new Map(items.map(i => [i.id, i]));
    const groupOf = (row: I) => (row.parent_id ? byId.get(row.parent_id)?.group_id : undefined) || row.group_id || undefined;
    const valuesOf = (row: I): Record<string, any> => (row.values && typeof row.values === 'object' && !Array.isArray(row.values)) ? row.values : {};
    const live = (row: I) => !row.is_archived;
    const subs = items.filter(i => i.parent_id);
    const tops = items.filter(i => !i.parent_id);
    const sortGroups = (ids: Iterable<string>) => [...new Set(ids)].filter(id => rank.has(id)).sort((a, b) => rank.get(a)! - rank.get(b)!);

    const values = new Map<string, Record<string, any>>();
    const writable = (row: I) => {
        if (!values.has(row.id)) values.set(row.id, { ...valuesOf(row) });
        return values.get(row.id)!;
    };
    const current = (row: I) => values.get(row.id) || valuesOf(row);

    const out: C[] = [];
    for (const col of columns) {
        if (col.scope === 'item') { out.push({ ...col, group_id: null }); continue; }
        if (col.scope === 'subitem' && col.group_id && rank.has(col.group_id)) { out.push(col); continue; }

        let itemUsed: boolean;
        let targets: string[];
        if (col.scope === 'subitem') {
            itemUsed = false;
            targets = sortGroups(subs.filter(live).map(groupOf).filter((g): g is string => !!g));
            if (targets.length === 0) targets = sortGroups(groups.map(g => g.id)).slice(0, 1);
        } else {
            itemUsed = tops.some(t => live(t) && hasValue(current(t)[col.id]));
            targets = sortGroups(subs.filter(s => live(s) && hasValue(current(s)[col.id])).map(groupOf).filter((g): g is string => !!g));
        }

        if (targets.length === 0) { out.push({ ...col, scope: 'item', group_id: null }); continue; }
        if (itemUsed) out.push({ ...col, scope: 'item', group_id: null });

        targets.forEach((groupId, i) => {
            if (i === 0 && !itemUsed) { out.push({ ...col, scope: 'subitem', group_id: groupId }); return; }
            const copyId = newId();
            out.push({ ...col, id: copyId, scope: 'subitem', group_id: groupId });
            subs.forEach(s => {
                if (groupOf(s) !== groupId || !(col.id in current(s))) return;
                const v = writable(s);
                v[copyId] = v[col.id];
                delete v[col.id];
            });
        });
    }

    return {
        columns: out,
        items: items.map(i => values.has(i.id) ? { ...i, values: values.get(i.id) } : i)
    };
};
