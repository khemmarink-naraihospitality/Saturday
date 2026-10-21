import type { Board, Item } from '../types';
import { linkDisplayText } from './utils';
import { groupItems, type VirtualItemData } from '../utils/grouping';
import { itemColumns, subitemColumns } from './columnScope';

/**
 * A board's items as its table lists them: the search box, hidden items, the
 * board's column/group filters, then its sort. groupItems() (utils/grouping.ts)
 * turns the result into rows. The desktop Table and the mobile board both start
 * here, so the two always list the same items in the same order.
 */
export const filterAndSortItems = (
    board: Board,
    { searchQuery, showHiddenItems }: { searchQuery: string; showHiddenItems: boolean }
): Item[] => {
    let items = [...board.items]; // Clone to sort

    // 1. Search
    if (searchQuery) {
        items = items.filter(item => item.title.toLowerCase().includes(searchQuery.toLowerCase()));
    }

    // Filter Hidden Items
    if (!showHiddenItems) {
        items = items.filter(item => !item.isHidden);
    }

    // 2. Column Filter and Group Filter
    if (board.filters && board.filters.length > 0) {
        board.filters.forEach(filter => {
            if (filter.values && filter.values.length > 0) {
                items = items.filter(item => {
                    if (filter.columnId === '__group__') {
                        return filter.values.includes(item.groupId);
                    }

                    const val = item.values[filter.columnId];

                    // Handle Array values (Dropdown) -> Intersection Check
                    if (Array.isArray(val)) {
                        // If ANY of the item's labels match ANY of the filter values, keep it.
                        return val.some(v => filter.values.includes(v));
                    }

                    // Handle Boolean values (Checkbox) -> String Conversion Check
                    if (typeof val === 'boolean') {
                        return filter.values.includes(String(val));
                    }

                    // Default: Single Value Check
                    return filter.values.includes(val);
                });
            }
        });
    }

    // 3. Sort
    if (board.sort) {
        const { columnId, direction } = board.sort;
        const col = board.columns.find(c => c.id === columnId);
        if (col && direction) {
            items.sort((a, b) => {
                let valA = a.values[columnId];
                let valB = b.values[columnId];

                // Handle different types
                // Priority sorts with the numbers: it is a 1-5 rating, and
                // sorting it as text would order 10 before 2 if the scale
                // ever grows.
                if (col.type === 'number' || col.type === 'priority') {
                    valA = parseFloat(valA) || 0;
                    valB = parseFloat(valB) || 0;
                } else if (col.type === 'date' || col.type === 'due_date') {
                    // Date strings usually sortable if ISO, otherwise parse
                    valA = valA || '';
                    valB = valB || '';
                } else if (col.type === 'link') {
                    // A labelled link is an object; sort it the way it reads.
                    valA = linkDisplayText(valA).toLowerCase();
                    valB = linkDisplayText(valB).toLowerCase();
                } else if (col.type === 'status' || col.type === 'dropdown') {
                    // Try to find option label if val maps to an option ID
                    const options = Array.isArray(col.options) ? col.options : [];
                    const optA = options.find(o => o.id === valA || o.label === valA);
                    const optB = options.find(o => o.id === valB || o.label === valB);
                    valA = (optA ? optA.label : (valA || '')).toString().toLowerCase();
                    valB = (optB ? optB.label : (valB || '')).toString().toLowerCase();
                } else {
                    // String (Text, etc)
                    valA = (valA || '').toString().toLowerCase();
                    valB = (valB || '').toString().toLowerCase();
                }

                if (valA < valB) return direction === 'asc' ? -1 : 1;
                if (valA > valB) return direction === 'asc' ? 1 : -1;
                return 0;
            });
        }
    }

    return items;
};

/**
 * The rows the desktop table draws, top to bottom: filterAndSortItems, then
 * groupItems with the board's grouping, collapsed groups and expanded parents.
 * The Table renders this, and anything that needs "what is on screen, in what
 * order" (Shift-click range selection) asks it too, so the two cannot drift.
 */
export const tableRows = (
    board: Board,
    options: { searchQuery: string; showHiddenItems: boolean }
): VirtualItemData[] =>
    groupItems(
        filterAndSortItems(board, options),
        board.groups || [],
        board.groupByColumnId || null,
        board.collapsedGroups || [],
        board.expandedItemIds || [],
        itemColumns(board.columns),
        groupId => subitemColumns(board.columns, groupId)
    );
