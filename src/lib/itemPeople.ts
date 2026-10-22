import type { Column, Item } from '../types';

/** The people in any of the board's Person columns for this item. */
export const peopleOnItem = (board: { columns: Column[] } | undefined, item: Item | undefined): string[] => {
    const ids = new Set<string>();
    (board?.columns || []).filter(c => c.type === 'people').forEach(col => {
        const val = item?.values?.[col.id];
        (Array.isArray(val) ? val : (val ? [val] : [])).forEach((id: string) => ids.add(id));
    });
    return [...ids];
};

/**
 * Who an item's notifications go to: the people in its Person column(s) who have
 * been switched on for it, person by person. Someone taken off the column is no
 * longer told, whatever the list says.
 */
export const peopleToNotify = (board: { columns: Column[] } | undefined, item: Item | undefined): string[] => {
    const on = new Set(item?.notifyUserIds || []);
    return peopleOnItem(board, item).filter(id => on.has(id));
};
