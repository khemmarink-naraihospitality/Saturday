import type { Item, Group } from '../types';

// 1. Add 'header', 'footer', and sub-item types to type
export type VirtualItemType = 'group' | 'header' | 'item' | 'footer' | 'subitem-header' | 'subitem' | 'subitem-footer' | 'subitem-summary';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface VirtualItemData {
    type: VirtualItemType;
    id: string; // itemId or groupId
    // Data can be Item, Group, or metadata object - using 'any' for flexibility
    data: any;
    depth: number;
    groupColor?: string; // For the left border branding
    // On sub-item rows (header, rows, add row, summary): the group whose sub-item
    // columns they show — the parent's own group, which under "group by" isn't
    // the group the rows are drawn under.
    columnGroupId?: string;
    aggregates?: Record<string, any>;
    count?: number;
}

/** Column types whose group summary shows something; the rest have no summary cell. */
export const SUMMARIZABLE_TYPES = ['number', 'status', 'date', 'due_date', 'timeline', 'priority', 'people', 'files'];

/**
 * Per-column roll-up of a set of rows — what the summary rows under a group and
 * under a parent's sub-items display. One definition for both, and for the
 * dynamic and static grouping paths: a column type handled in one copy but not
 * another is what once white-screened boards with a Priority column.
 */
export const computeAggregates = (columns: any[], rows: Item[]): Record<string, any> => {
    const aggregates: Record<string, any> = {};
    columns.forEach(col => {
        const vals = rows.map(i => i.values[col.id]);
        if (col.type === 'number') {
            const numValues = vals.map(v => parseFloat(v)).filter(v => !isNaN(v));
            aggregates[col.id] = { sum: numValues.reduce((a, b) => a + b, 0), values: numValues, count: numValues.length };
        } else if (col.type === 'date' || col.type === 'due_date') {
            const dateValues = vals.filter(Boolean).sort();
            aggregates[col.id] = { min: dateValues[0], max: dateValues[dateValues.length - 1], values: dateValues, count: dateValues.length };
        } else if (col.type === 'timeline') {
            const froms = vals.filter((v): v is { from: string; to: string } => !!v?.from).map(v => v.from).sort();
            const tos = vals.filter((v): v is { from: string; to: string } => !!v?.to).map(v => v.to).sort();
            aggregates[col.id] = { min: froms[0], max: tos[tos.length - 1], count: froms.length };
        } else if (col.type === 'people') {
            const allIds = vals.flatMap(v => Array.isArray(v) ? v : (v ? [v] : []));
            const uniqueIds = Array.from(new Set(allIds));
            aggregates[col.id] = { values: vals, uniqueIds, count: uniqueIds.length };
        } else if (col.type === 'priority') {
            // Unrated rows are left out of the average rather than counted as
            // zero, which would drag every group down. Always carries an avg: the
            // summary cell reads it, and a shape without one used to throw.
            const ratings = vals.map(v => parseInt(v, 10)).filter(v => !isNaN(v) && v > 0);
            aggregates[col.id] = {
                values: ratings,
                count: ratings.length,
                avg: ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0
            };
        } else if (col.type === 'files') {
            const totalFiles = vals.reduce((sum, v) => sum + (Array.isArray(v) ? v.length : 0), 0);
            aggregates[col.id] = { count: totalFiles };
        } else {
            aggregates[col.id] = { values: vals, count: vals.length };
        }
    });
    return aggregates;
};

export const groupItems = (
    items: Item[],
    groups: Group[],
    groupByColumnId: string | null,
    collapsedGroups: string[] = [],
    expandedItemIds: string[] = [],
    columns?: any[],
    // The columns the sub-items under a group's items show, for the summary row
    // under a parent's sub-items.
    subitemColumnsFor?: (groupId: string) => any[]
): VirtualItemData[] => {
    // Pre-calculate sub-items map and group items map
    const subItemsMap = new Map<string, Item[]>();
    const itemsByGroupMap = new Map<string, Item[]>();
    const unassignedItems: Item[] = [];
    const effectiveGroups = groups && groups.length > 0 ? groups : [{ id: 'default', title: 'Main Table', color: '#579bfc' }];
    const groupIds = new Set(effectiveGroups.map(g => g.id));

    items.forEach(item => {
        if (item.parentId) {
            const list = subItemsMap.get(item.parentId) || [];
            list.push(item);
            subItemsMap.set(item.parentId, list);
        } else if (item.groupId && groupIds.has(item.groupId)) {
            const list = itemsByGroupMap.get(item.groupId) || [];
            list.push(item);
            itemsByGroupMap.set(item.groupId, list);
        } else {
            unassignedItems.push(item);
        }
    });

    if (unassignedItems.length > 0 && effectiveGroups.length > 0) {
        const firstGroupId = effectiveGroups[0].id;
        const list = itemsByGroupMap.get(firstGroupId) || [];
        list.push(...unassignedItems);
        itemsByGroupMap.set(firstGroupId, list);
    }

    const result: VirtualItemData[] = [];

    // Totals for one parent's sub-items, drawn under them. Only when there are
    // sub-items and at least one of their columns has something to total.
    const pushSubitemSummary = (parentId: string, columnGroupId: string, subItems: Item[], color?: string) => {
        const subitemColumns = subitemColumnsFor?.(columnGroupId) || [];
        if (subItems.length === 0) return;
        if (!subitemColumns.some(c => SUMMARIZABLE_TYPES.includes(c.type))) return;
        result.push({
            type: 'subitem-summary',
            id: `${parentId}-sub-summary`,
            data: { parentId, aggregates: computeAggregates(subitemColumns, subItems), count: subItems.length },
            depth: 1,
            groupColor: color,
            columnGroupId
        });
    };

    // A parent's sub-item rows: header, sub-items, add row, summary. `columnGroupId`
    // is the parent's group, whose sub-item columns they show, and the group a
    // sub-item added from here is created in.
    const pushSubitems = (item: Item, columnGroupId: string, color?: string) => {
        const subItems = subItemsMap.get(item.id) || [];
        result.push({ type: 'subitem-header', id: `${item.id}-sub-header`, data: { parentId: item.id }, depth: 1, groupColor: color, columnGroupId });
        subItems.forEach(si => result.push({ type: 'subitem', id: si.id, data: si, depth: 1, groupColor: color, columnGroupId }));
        result.push({ type: 'subitem-footer', id: `${item.id}-sub-footer`, data: { parentId: item.id, groupId: columnGroupId }, depth: 1, groupColor: color, columnGroupId });
        pushSubitemSummary(item.id, columnGroupId, subItems, color);
    };

    // 1. Dynamic Grouping (Status, Dropdown, Person, etc.)
    if (groupByColumnId) {
        const valuesMap: Record<string, Item[]> = {};
        const emptyItems: Item[] = [];
        const groupByColumn = columns?.find(c => c.id === groupByColumnId);

        items.forEach(item => {
            if (item.parentId) return; // Skip sub-items for top-level grouping
            const val = item.values[groupByColumnId];
            if (val === undefined || val === null || val === '') {
                emptyItems.push(item);
            } else {
                const key = String(val);
                if (!valuesMap[key]) valuesMap[key] = [];
                valuesMap[key].push(item);
            }
        });

        const addDynamicGroup = (title: string, gItems: Item[], gId: string, color: string = '#c4c4c4') => {
            const isCollapsed = collapsedGroups.includes(gId);
            const aggregates = columns ? computeAggregates(columns, gItems) : {};

            result.push({ 
                type: 'group', 
                id: gId, 
                data: { title, count: gItems.length, color, aggregates }, 
                depth: 0, 
                groupColor: color 
            });

            if (!isCollapsed) {
                result.push({ type: 'header', id: `${gId}-header`, data: { groupId: gId }, depth: 0, groupColor: color });
                gItems.forEach(item => {
                    result.push({ type: 'item', id: item.id, data: item, depth: 0, groupColor: color });
                    if (expandedItemIds.includes(item.id)) {
                        // Drawn under a "group by" bucket, but the parent still belongs to
                        // a real group, and that is whose sub-item columns these are.
                        pushSubitems(item, groupIds.has(item.groupId) ? item.groupId : effectiveGroups[0].id, color);
                    }
                });
                result.push({ 
                    type: 'footer', 
                    id: `${gId}-footer`, 
                    data: { groupId: gId, aggregates, count: gItems.length }, 
                    depth: 0, 
                    groupColor: color 
                });
            }
        };

        Object.entries(valuesMap).forEach(([key, gItems]) => {
            let title = key;
            let color: string | undefined;
            const option = groupByColumn?.options?.find((o: { id: string; label: string; color?: string }) => o.id === key);
            if (option) {
                title = option.label;
                color = option.color;
            }
            addDynamicGroup(title, gItems, `group-${key}`, color);
        });
        if (emptyItems.length > 0) addDynamicGroup('Empty', emptyItems, 'group-empty');

        return result;
    }

    effectiveGroups.forEach((group) => {
        const groupItemsList = itemsByGroupMap.get(group.id) || [];
        const isCollapsed = collapsedGroups.includes(group.id);

        const aggregates = columns ? computeAggregates(columns, groupItemsList) : {};

        result.push({ 
            type: 'group', 
            id: group.id, 
            data: { ...group, count: groupItemsList.length, aggregates }, 
            depth: 0, 
            groupColor: group.color 
        });

        if (!isCollapsed) {
            result.push({ type: 'header', id: `${group.id}-header`, data: { groupId: group.id }, depth: 0, groupColor: group.color });
            groupItemsList.forEach(item => {
                result.push({ type: 'item', id: item.id, data: item, depth: 0, groupColor: group.color });
                if (expandedItemIds.includes(item.id)) {
                    pushSubitems(item, group.id, group.color);
                }
            });
            result.push({ 
                type: 'footer', 
                id: `${group.id}-footer`, 
                data: { groupId: group.id, aggregates, count: groupItemsList.length }, 
                depth: 0, 
                groupColor: group.color 
            });
        }
    });

    return result;
};
