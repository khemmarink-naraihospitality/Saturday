import type { StateCreator } from 'zustand';
import { supabase } from '../../lib/supabase';
import { v4 as uuidv4 } from 'uuid';
import type { BoardState } from '../useBoardStore';
import type { ColumnMapEntry, Item } from '../../types';

export interface GroupLinkSlice {
    linkGroupToOther: (
        sourceBoardId: string,
        sourceGroupId: string,
        newGroupTitle: string
    ) => Promise<{ success: boolean; error?: string }>;
    unlinkGroup: (groupId: string) => Promise<void>;
}

function translateValues(
    values: Record<string, any>,
    columnMap: { [columnId: string]: ColumnMapEntry }
): Record<string, any> {
    const translated: Record<string, any> = {};
    for (const [sourceColumnId, mapping] of Object.entries(columnMap)) {
        if (!(sourceColumnId in values)) continue;
        const sourceVal = values[sourceColumnId];
        if (mapping.optionMap && typeof sourceVal === 'string') {
            // This column's options are mapped by label (existing column on
            // both sides). If THIS specific option has no label match on the
            // destination, leave the field unset rather than writing the
            // source's raw option id through — that id means nothing on the
            // destination's column and would render as a garbled raw string.
            if (!(sourceVal in mapping.optionMap)) continue;
            translated[mapping.targetColumnId] = mapping.optionMap[sourceVal];
            continue;
        }
        translated[mapping.targetColumnId] = sourceVal;
    }
    return translated;
}

function normalize(label: string): string {
    return label.trim().toLowerCase();
}

export const createGroupLinkSlice: StateCreator<
    BoardState,
    [],
    [],
    GroupLinkSlice
> = (set, get) => ({
    linkGroupToOther: async (sourceBoardId, sourceGroupId, newGroupTitle) => {
        const { activeBoardId } = get();
        if (!activeBoardId) return { success: false, error: 'No active board' };

        const { data: existingLinks } = await supabase
            .from('group_links')
            .select('id')
            .or(`group_a_id.eq.${sourceGroupId},group_b_id.eq.${sourceGroupId}`);
        if (existingLinks && existingLinks.length > 0) {
            return { success: false, error: 'This group is already linked to another group.' };
        }

        const { data: { user } } = await supabase.auth.getUser();

        // 1. Merge columns: add any of the source board's columns that don't
        // already exist on the current board (matched by name+type) — the
        // current board's existing columns, and every OTHER group's data in
        // them, are never touched or deleted. For columns that already exist
        // on both sides, map status/dropdown options through by label so
        // values translate correctly even though the option ids differ.
        const { data: sourceColumns, error: sourceColumnsError } = await supabase
            .from('columns')
            .select('id, title, type, width, order, options, aggregation, number_format, currency_code')
            .eq('board_id', sourceBoardId)
            .order('order');

        if (sourceColumnsError) {
            return { success: false, error: `Failed to read the source board's columns: ${sourceColumnsError.message}` };
        }

        const { data: currentColumns, error: currentColumnsError } = await supabase
            .from('columns')
            .select('id, title, type, options')
            .eq('board_id', activeBoardId);

        if (currentColumnsError) {
            return { success: false, error: `Failed to read this board's columns: ${currentColumnsError.message}` };
        }

        const columnMapSourceToCurrent: Record<string, ColumnMapEntry> = {};
        const columnsToCreate: typeof sourceColumns = [];

        (sourceColumns || []).forEach(sc => {
            const existingMatch = (currentColumns || []).find(cc => cc.type === sc.type && normalize(cc.title) === normalize(sc.title));
            if (!existingMatch) {
                columnsToCreate.push(sc);
                return;
            }
            let optionMap: Record<string, string> | undefined;
            if (sc.type === 'status' || sc.type === 'dropdown') {
                const map: Record<string, string> = {};
                (sc.options || []).forEach((opt: any) => {
                    const optMatch = (existingMatch.options || []).find((o: any) => normalize(o.label) === normalize(opt.label));
                    if (optMatch) map[opt.id] = optMatch.id;
                });
                if (Object.keys(map).length > 0) optionMap = map;
            }
            columnMapSourceToCurrent[sc.id] = { targetColumnId: existingMatch.id, optionMap };
        });

        // New columns are exact clones (including identical option ids), so
        // their values need no per-option remapping at all.
        const newColumnRows = columnsToCreate.map(sc => {
            const newColumnId = uuidv4();
            columnMapSourceToCurrent[sc.id] = { targetColumnId: newColumnId };
            return {
                id: newColumnId,
                board_id: activeBoardId,
                title: sc.title,
                type: sc.type,
                width: sc.width,
                order: sc.order,
                options: sc.options,
                aggregation: sc.aggregation,
                number_format: sc.number_format,
                currency_code: sc.currency_code
            };
        });

        if (newColumnRows.length > 0) {
            const { error: insertColumnsError } = await supabase.from('columns').insert(newColumnRows);
            if (insertColumnsError) {
                return { success: false, error: `Failed to add the source board's missing columns: ${insertColumnsError.message}` };
            }
        }

        // Reverse map (current -> source), needed for the link's column_map_a_to_b
        // so ongoing edits on this side propagate back to the source correctly.
        const columnMapCurrentToSource: Record<string, ColumnMapEntry> = {};
        Object.entries(columnMapSourceToCurrent).forEach(([srcColId, entry]) => {
            let reverseOptionMap: Record<string, string> | undefined;
            if (entry.optionMap) {
                reverseOptionMap = {};
                Object.entries(entry.optionMap).forEach(([srcOpt, curOpt]) => { reverseOptionMap![curOpt] = srcOpt; });
            }
            columnMapCurrentToSource[entry.targetColumnId] = { targetColumnId: srcColId, optionMap: reverseOptionMap };
        });

        // 2. Create the new (empty) group in the current board.
        const newGroupId = uuidv4();
        const color = '#7C3FE4';
        const board = get().boards.find(b => b.id === activeBoardId);
        const minOrder = board && board.groups.length > 0
            ? Math.min(...board.groups.map(g => g.order || 0))
            : 0;
        const groupOrder = minOrder - 1;

        const { error: groupError } = await supabase.from('groups').insert({ id: newGroupId, board_id: activeBoardId, title: newGroupTitle, color, order: groupOrder });
        if (groupError) {
            console.error('linkGroupToOther: failed to create new group', groupError);
            return { success: false, error: `Failed to create the new group: ${groupError.message}` };
        }

        // 3. Fetch the source group's items directly from Supabase.
        const { data: sourceItems, error: fetchError } = await supabase
            .from('items')
            .select('id, title, values, updates, is_hidden, order, parent_id')
            .eq('group_id', sourceGroupId);

        if (fetchError) {
            console.error('linkGroupToOther: failed to read source items', fetchError);
            await supabase.from('groups').delete().eq('id', newGroupId);
            return { success: false, error: `Failed to read the source group's items: ${fetchError.message}` };
        }

        const topLevel = (sourceItems || []).filter(i => !i.parent_id);
        const subItems = (sourceItems || []).filter(i => i.parent_id);

        // 4. Insert translated top-level items into the new group.
        const sourceToNewIdMap: Record<string, string> = {};
        const newTopLevelItems: Item[] = topLevel.map(srcItem => {
            const newId = uuidv4();
            sourceToNewIdMap[srcItem.id] = newId;
            return {
                id: newId,
                title: srcItem.title,
                groupId: newGroupId,
                boardId: activeBoardId,
                values: translateValues(srcItem.values || {}, columnMapSourceToCurrent),
                updates: srcItem.updates || [],
                isHidden: srcItem.is_hidden,
                order: srcItem.order,
                parentId: undefined
            };
        });

        if (newTopLevelItems.length > 0) {
            const { error: topLevelInsertError } = await supabase.from('items').insert(newTopLevelItems.map(i => ({
                id: i.id, title: i.title, board_id: i.boardId, group_id: i.groupId,
                values: i.values, updates: i.updates || [], is_hidden: i.isHidden, order: i.order, parent_id: null
            })));
            if (topLevelInsertError) {
                console.error('linkGroupToOther: failed to insert top-level items', topLevelInsertError);
                await supabase.from('groups').delete().eq('id', newGroupId);
                return { success: false, error: `Failed to copy items into the new group: ${topLevelInsertError.message}` };
            }
        }

        // 5. Insert translated sub-items, resolving parent_id through the capture map.
        const newSubItems: Item[] = subItems.map(srcItem => {
            const newId = uuidv4();
            const newParentId = sourceToNewIdMap[srcItem.parent_id as string];
            return {
                id: newId,
                title: srcItem.title,
                groupId: newGroupId,
                boardId: activeBoardId,
                values: translateValues(srcItem.values || {}, columnMapSourceToCurrent),
                updates: srcItem.updates || [],
                isHidden: srcItem.is_hidden,
                order: srcItem.order,
                parentId: newParentId
            };
        });

        if (newSubItems.length > 0) {
            const { error: subItemInsertError } = await supabase.from('items').insert(newSubItems.map(i => ({
                id: i.id, title: i.title, board_id: i.boardId, group_id: i.groupId,
                values: i.values, updates: i.updates || [], is_hidden: i.isHidden, order: i.order, parent_id: i.parentId || null
            })));
            if (subItemInsertError) {
                console.error('linkGroupToOther: failed to insert sub-items', subItemInsertError);
                await supabase.from('groups').delete().eq('id', newGroupId);
                return { success: false, error: `Failed to copy sub-items into the new group: ${subItemInsertError.message}` };
            }
        }

        // 6. Only now insert the group_links row, so the backfill writes above
        // are not mirrored back onto the source group as duplicate echoes.
        const { error: linkError } = await supabase.from('group_links').insert({
            board_a_id: activeBoardId,
            group_a_id: newGroupId,
            board_b_id: sourceBoardId,
            group_b_id: sourceGroupId,
            column_map_a_to_b: columnMapCurrentToSource,
            column_map_b_to_a: columnMapSourceToCurrent,
            created_by: user?.id
        });

        if (linkError) {
            console.error('linkGroupToOther: failed to create group_links row', linkError);
            await supabase.from('groups').delete().eq('id', newGroupId);
            return { success: false, error: `Failed to create the group link: ${linkError.message}` };
        }

        // 7. Optimistically update local state — appending any newly created
        // columns (existing columns are untouched) and the new group/items.
        // The several awaits above give the realtime subscription plenty of
        // time to have already delivered bare versions of this group/these
        // items (it has no filter and reacts to every write) — de-dupe by id
        // rather than blindly prepending, so we don't end up with two entries
        // sharing the same id.
        const newColumns = newColumnRows.map(c => ({
            id: c.id,
            title: c.title,
            type: c.type,
            width: c.width,
            order: c.order,
            options: c.options || [],
            aggregation: c.aggregation,
            numberFormat: c.number_format,
            currencyCode: c.currency_code
        }));
        const allNewItems = [...newTopLevelItems, ...newSubItems];
        const newItemIds = new Set(allNewItems.map(i => i.id));
        set(state => ({
            boards: state.boards.map(b => b.id === activeBoardId ? {
                ...b,
                columns: [...b.columns, ...(newColumns as any[])],
                items: [...b.items.filter(i => !newItemIds.has(i.id)), ...allNewItems],
                groups: [
                    {
                        id: newGroupId,
                        title: newGroupTitle,
                        color,
                        order: groupOrder,
                        items: newTopLevelItems,
                        linkedGroupId: sourceGroupId,
                        linkedBoardId: sourceBoardId
                    },
                    ...b.groups.filter(g => g.id !== newGroupId)
                ]
            } : b)
        }));

        return { success: true };
    },

    unlinkGroup: async (groupId) => {
        const { error } = await supabase
            .from('group_links')
            .delete()
            .or(`group_a_id.eq.${groupId},group_b_id.eq.${groupId}`);
        if (error) {
            console.error('Failed to unlink group:', error);
            return;
        }

        set(state => ({
            boards: state.boards.map(b => ({
                ...b,
                groups: b.groups.map(g => g.id === groupId ? { ...g, linkedGroupId: undefined, linkedBoardId: undefined } : g)
            }))
        }));
    }
});
