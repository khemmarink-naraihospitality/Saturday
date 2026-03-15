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
    // 1. Dynamic Grouping (Future/Partial Support)
    if (groupByColumnId) {
        const dynamicColor = '#579bfc';
        return [
            {
                type: 'group',
                id: 'dynamic-group',
                data: { title: 'Dynamic Group', count: items.length, color: dynamicColor },
                depth: 0,
                groupColor: dynamicColor
            } as VirtualItemData,
            { type: 'header', id: 'dynamic-header', data: {}, depth: 0, groupColor: dynamicColor } as VirtualItemData,
            ...items.map(item => ({ type: 'item', id: item.id, data: item, depth: 0, groupColor: dynamicColor } as VirtualItemData)),
            { type: 'footer', id: 'dynamic-footer', data: { groupId: 'dynamic-group' }, depth: 0, groupColor: dynamicColor } as VirtualItemData
        ];
    }

    // 2. Manual Grouping (Default View)
    const effectiveGroups = groups && groups.length > 0 ? groups : [
        { id: 'default', title: 'Main Table', color: '#579bfc' }
    ];

    const result: VirtualItemData[] = [];
    const itemsByGroup: Record<string, Item[]> = {};
    const unassignedItems: Item[] = [];

    items.forEach(item => {
        if (item.groupId && effectiveGroups.some(g => g.id === item.groupId)) {
            if (!itemsByGroup[item.groupId]) itemsByGroup[item.groupId] = [];
            itemsByGroup[item.groupId].push(item);
        } else {
            unassignedItems.push(item);
        }
    });

    if (effectiveGroups.length > 0 && unassignedItems.length > 0) {
        const firstGroupId = effectiveGroups[0].id;
        if (!itemsByGroup[firstGroupId]) itemsByGroup[firstGroupId] = [];
        itemsByGroup[firstGroupId].push(...unassignedItems);
    }


    // Build Virtual List
    effectiveGroups.forEach((group, _groupIndex) => {
        const groupItems = itemsByGroup[group.id] || [];
        const isCollapsed = collapsedGroups.includes(group.id);

        // 1. Add Group Title Row
        result.push({
            type: 'group',
            id: group.id,
            data: { ...group, count: groupItems.length },
            depth: 0,
            groupColor: group.color
        });

        // 2. Add Content (Header + Items + Footer) ONLY if not collapsed
        if (!isCollapsed) {
            // Header - Show for EVERY group (Modified per user request)
            result.push({
                type: 'header',
                id: `${group.id}-header`,
                data: { groupId: group.id },
                depth: 0,
                groupColor: group.color
            });

            // Items
            groupItems.forEach(item => {
                // Only consider main items (no parentId)
                if (item.parentId) return;

                result.push({
                    type: 'item',
                    id: item.id,
                    data: item,
                    depth: 0,
                    groupColor: group.color
                });

                // If expanded, add sub-items
                const isExpanded = expandedItemIds.includes(item.id);
                const subItems = items.filter(si => si.parentId === item.id);

                if (isExpanded) {
                    // Sub-item Header
                    result.push({
                        type: 'subitem-header',
                        id: `${item.id}-sub-header`,
                        data: { parentId: item.id },
                        depth: 1,
                        groupColor: group.color
                    });

                    // Sub-item Rows
                    subItems.forEach(si => {
                        result.push({
                            type: 'subitem',
                            id: si.id,
                            data: si,
                            depth: 1,
                            groupColor: group.color
                        });
                    });

                    // Sub-item Footer (+ Add Subitem)
                    result.push({
                        type: 'subitem-footer',
                        id: `${item.id}-sub-footer`,
                        data: { parentId: item.id, groupId: group.id },
                        depth: 1,
                        groupColor: group.color
                    });
                }
            });

            // Footer (Add Item Row)
            result.push({
                type: 'footer',
                id: `${group.id}-footer`,
                data: { groupId: group.id },
                depth: 0,
                groupColor: group.color
            });
        }
    });

    return result;
};
