import type { Column, ColumnScope } from '../types';

/**
 * Which rows a column is shown on. A column with no scope (loaded before the
 * field existed, or from a backup that predates it) counts as 'both', so older
 * boards keep showing every column on every row.
 */
export const scopeOf = (column: Pick<Column, 'scope'>): ColumnScope => column.scope ?? 'both';

/** Columns shown on top-level items. */
export const itemColumns = (columns: Column[]): Column[] =>
    columns.filter(c => scopeOf(c) !== 'subitem');

/** Columns shown on sub-items. */
export const subitemColumns = (columns: Column[]): Column[] =>
    columns.filter(c => scopeOf(c) !== 'item');

/**
 * Index in the board's full column list at which a column should be inserted so
 * it lands immediately after `afterColumnId`, or at the end when that is null.
 *
 * Headers show only their own scope's columns, so an index into what's on screen
 * is not an index into the stored list; going through ids keeps "add to the
 * right" meaning what it looks like whichever header it was asked from.
 */
export const insertIndexAfter = (columns: Column[], afterColumnId: string | null): number | undefined => {
    if (!afterColumnId) return undefined;
    const i = columns.findIndex(c => c.id === afterColumnId);
    return i === -1 ? undefined : i + 1;
};
