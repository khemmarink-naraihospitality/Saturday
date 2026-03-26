import type { Item, Group } from '../types';

// 1. Add 'header', 'footer', and sub-item types to type
export type VirtualItemType = 'group' | 'header' | 'item' | 'footer' | 'subitem-header' | 'subitem' | 'subitem-footer';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface VirtualItemData {
    type: VirtualItemType;
    id: string; // itemId or groupId
    // Data can be Item, Group, or metadata object - using 'any' for flexibility
    data: any;
    depth: number;
    groupColor?: string; // For the left border branding
}

export const groupItems = (
    items: Item[],
    groups: Group[],
    groupByColumnId: string | null,
    collapsedGroups: string[] = [],
    expandedItemIds: string[] = []
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

    // 1. Dynamic Grouping (Status, Dropdown, Person, etc.)
    if (groupByColumnId) {
        const valuesMap: Record<string, Item[]> = {};
        const emptyItems: Item[] = [];

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
            result.push({ type: 'group', id: gId, data: { title, count: gItems.length, color }, depth: 0, groupColor: color });

            if (!isCollapsed) {
                result.push({ type: 'header', id: `${gId}-header`, data: { groupId: gId }, depth: 0, groupColor: color });
                gItems.forEach(item => {
                    result.push({ type: 'item', id: item.id, data: item, depth: 0, groupColor: color });
                    if (expandedItemIds.includes(item.id)) {
                        const subItems = subItemsMap.get(item.id) || [];
                        result.push({ type: 'subitem-header', id: `${item.id}-sub-header`, data: { parentId: item.id }, depth: 1, groupColor: color });
                        subItems.forEach(si => result.push({ type: 'subitem', id: si.id, data: si, depth: 1, groupColor: color }));
                        result.push({ type: 'subitem-footer', id: `${item.id}-sub-footer`, data: { parentId: item.id, groupId: gId }, depth: 1, groupColor: color });
                    }
                });
                result.push({ type: 'footer', id: `${gId}-footer`, data: { groupId: gId }, depth: 0, groupColor: color });
            }
        };

        Object.entries(valuesMap).forEach(([key, gItems]) => addDynamicGroup(key, gItems, `group-${key}`));
        if (emptyItems.length > 0) addDynamicGroup('Empty', emptyItems, 'group-empty');

        return result;
    }

    // 2. Manual Grouping (Default View)
    effectiveGroups.forEach((group) => {
        const groupItems = itemsByGroupMap.get(group.id) || [];
        const isCollapsed = collapsedGroups.includes(group.id);

        result.push({ type: 'group', id: group.id, data: { ...group, count: groupItems.length }, depth: 0, groupColor: group.color });

        if (!isCollapsed) {
            result.push({ type: 'header', id: `${group.id}-header`, data: { groupId: group.id }, depth: 0, groupColor: group.color });
            groupItems.forEach(item => {
                result.push({ type: 'item', id: item.id, data: item, depth: 0, groupColor: group.color });
                if (expandedItemIds.includes(item.id)) {
                    const subItems = subItemsMap.get(item.id) || [];
                    result.push({ type: 'subitem-header', id: `${item.id}-sub-header`, data: { parentId: item.id }, depth: 1, groupColor: group.color });
                    subItems.forEach(si => result.push({ type: 'subitem', id: si.id, data: si, depth: 1, groupColor: group.color }));
                    result.push({ type: 'subitem-footer', id: `${item.id}-sub-footer`, data: { parentId: item.id, groupId: group.id }, depth: 1, groupColor: group.color });
                }
            });
            result.push({ type: 'footer', id: `${group.id}-footer`, data: { groupId: group.id }, depth: 0, groupColor: group.color });
        }
    });

    return result;
};
