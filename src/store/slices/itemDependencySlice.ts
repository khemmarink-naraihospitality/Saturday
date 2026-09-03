import type { StateCreator } from 'zustand';
import { supabase } from '../../lib/supabase';
import { v4 as uuidv4 } from 'uuid';
import type { BoardState } from '../useBoardStore';
import type { ItemDependency } from '../../types';
import {
    resolveTimelineColumn,
    deltaDays,
    shiftValue,
    buildSuccessorMap,
    wouldCreateCycle,
    TIMELINE_COLUMN_TYPES
} from '../../lib/dependencyUtils';

/**
 * Ceiling on how far one move may cascade. Cycles are rejected at creation
 * time, so this is a backstop against a loop created concurrently by two
 * clients (the client-side check can't see the other's uncommitted edge).
 */
const MAX_CASCADE_NODES = 500;

export interface ItemDependencySlice {
    itemDependencies: ItemDependency[];
    setBoardDependencies: (boardId: string, deps: ItemDependency[]) => void;
    addItemDependency: (
        predecessorItemId: string,
        successorItemId: string
    ) => Promise<{ success: boolean; error?: string }>;
    removeItemDependency: (dependencyId: string) => Promise<void>;
    updateItemDependency: (
        dependencyId: string,
        predecessorItemId: string,
        successorItemId: string
    ) => Promise<{ success: boolean; error?: string }>;
    cascadeFromPredecessor: (
        itemId: string,
        columnId: string,
        oldValue: any,
        newValue: any
    ) => Promise<void>;
}

export const mapDbDependency = (row: any): ItemDependency => ({
    id: row.id,
    boardId: row.board_id,
    predecessorItemId: row.predecessor_item_id,
    successorItemId: row.successor_item_id,
    type: row.type || 'FS',
    lagDays: row.lag_days ?? 0,
    createdBy: row.created_by || undefined,
    createdAt: row.created_at || undefined
});

export const createItemDependencySlice: StateCreator<
    BoardState,
    [],
    [],
    ItemDependencySlice
> = (set, get) => ({
    itemDependencies: [],

    setBoardDependencies: (boardId, deps) => {
        set(state => ({
            itemDependencies: [
                ...state.itemDependencies.filter(d => d.boardId !== boardId),
                ...deps
            ]
        }));
    },

    addItemDependency: async (predecessorItemId, successorItemId) => {
        const { activeBoardId, itemDependencies } = get();
        if (!activeBoardId) return { success: false, error: 'No board open' };

        const board = get().boards.find(b => b.id === activeBoardId);
        if (!board) return { success: false, error: 'No board open' };

        if (predecessorItemId === successorItemId) {
            return { success: false, error: "An item can't depend on itself" };
        }

        const predecessor = board.items.find(i => i.id === predecessorItemId);
        const successor = board.items.find(i => i.id === successorItemId);
        if (!predecessor || !successor) {
            return { success: false, error: 'Both items must be on this board' };
        }

        const boardDeps = itemDependencies.filter(d => d.boardId === activeBoardId);

        if (boardDeps.some(d => d.predecessorItemId === predecessorItemId && d.successorItemId === successorItemId)) {
            return { success: false, error: 'These items are already linked' };
        }

        if (wouldCreateCycle(boardDeps, predecessorItemId, successorItemId)) {
            return { success: false, error: `"${predecessor.title}" already depends on "${successor.title}"` };
        }

        const optimistic: ItemDependency = {
            id: uuidv4(),
            boardId: activeBoardId,
            predecessorItemId,
            successorItemId,
            type: 'FS',
            lagDays: 0
        };
        set(state => ({ itemDependencies: [...state.itemDependencies, optimistic] }));

        const { data: { user } } = await supabase.auth.getUser();
        const { error } = await supabase.from('item_dependencies').insert({
            id: optimistic.id,
            board_id: activeBoardId,
            predecessor_item_id: predecessorItemId,
            successor_item_id: successorItemId,
            created_by: user?.id ?? null
        });

        if (error) {
            set(state => ({ itemDependencies: state.itemDependencies.filter(d => d.id !== optimistic.id) }));
            // The DB's UNIQUE / same-board / RLS rules are the real authority;
            // this fires when another client won a race or the checks above
            // were working from stale state.
            return { success: false, error: error.message };
        }

        get().logActivity('dependency_created', 'item', successorItemId, {
            board_id: activeBoardId,
            predecessor_id: predecessorItemId,
            predecessor_title: predecessor.title,
            successor_title: successor.title
        });

        return { success: true };
    },

    removeItemDependency: async (dependencyId) => {
        const dep = get().itemDependencies.find(d => d.id === dependencyId);
        if (!dep) return;

        set(state => ({ itemDependencies: state.itemDependencies.filter(d => d.id !== dependencyId) }));

        const { error } = await supabase.from('item_dependencies').delete().eq('id', dependencyId);
        if (error) {
            console.error('Failed to remove dependency:', error);
            set(state => ({ itemDependencies: [...state.itemDependencies, dep] }));
            return;
        }

        const board = get().boards.find(b => b.id === dep.boardId);
        get().logActivity('dependency_removed', 'item', dep.successorItemId, {
            board_id: dep.boardId,
            predecessor_id: dep.predecessorItemId,
            predecessor_title: board?.items.find(i => i.id === dep.predecessorItemId)?.title || 'Unknown',
            successor_title: board?.items.find(i => i.id === dep.successorItemId)?.title || 'Unknown'
        });
    },

    updateItemDependency: async (dependencyId, predecessorItemId, successorItemId) => {
        const { activeBoardId, itemDependencies } = get();
        if (!activeBoardId) return { success: false, error: 'No board open' };

        const existingDep = itemDependencies.find(d => d.id === dependencyId);
        if (!existingDep) return { success: false, error: 'This dependency no longer exists' };

        const board = get().boards.find(b => b.id === activeBoardId);
        if (!board) return { success: false, error: 'No board open' };

        if (predecessorItemId === successorItemId) {
            return { success: false, error: "An item can't depend on itself" };
        }

        const predecessor = board.items.find(i => i.id === predecessorItemId);
        const successor = board.items.find(i => i.id === successorItemId);
        if (!predecessor || !successor) {
            return { success: false, error: 'Both items must be on this board' };
        }

        // Check against the graph as it would look with this edge already
        // removed, so re-pointing an edge doesn't fight the edge itself.
        const otherDeps = itemDependencies.filter(d => d.boardId === activeBoardId && d.id !== dependencyId);

        if (otherDeps.some(d => d.predecessorItemId === predecessorItemId && d.successorItemId === successorItemId)) {
            return { success: false, error: 'These items are already linked' };
        }

        if (wouldCreateCycle(otherDeps, predecessorItemId, successorItemId)) {
            return { success: false, error: `"${predecessor.title}" already depends on "${successor.title}"` };
        }

        set(state => ({
            itemDependencies: state.itemDependencies.map(d =>
                d.id === dependencyId ? { ...d, predecessorItemId, successorItemId } : d
            )
        }));

        const { error } = await supabase.from('item_dependencies')
            .update({ predecessor_item_id: predecessorItemId, successor_item_id: successorItemId })
            .eq('id', dependencyId);

        if (error) {
            set(state => ({
                itemDependencies: state.itemDependencies.map(d => d.id === dependencyId ? existingDep : d)
            }));
            return { success: false, error: error.message };
        }

        get().logActivity('dependency_updated', 'item', successorItemId, {
            board_id: activeBoardId,
            predecessor_id: predecessorItemId,
            predecessor_title: predecessor.title,
            successor_title: successor.title
        });

        return { success: true };
    },

    /**
     * Finish-to-Start propagation. When a predecessor's dates move by N days,
     * every item downstream of it moves by the same N — which keeps the gaps
     * between them exactly as they were (MS Project auto-schedule).
     *
     * Runs entirely in the store rather than as a Postgres trigger on purpose:
     * a trigger's writes re-enter at pg_trigger_depth() = 2, where
     * sync_linked_group_items() bails out, so cascaded shifts on items inside
     * linked groups would silently stop mirroring to the other board. Writing
     * each shifted row from here keeps every write at depth 1.
     */
    cascadeFromPredecessor: async (itemId, columnId, oldValue, newValue) => {
        const { activeBoardId } = get();
        if (!activeBoardId) return;

        const board = get().boards.find(b => b.id === activeBoardId);
        if (!board) return;

        const column = board.columns.find(c => c.id === columnId);
        if (!column || !(TIMELINE_COLUMN_TYPES as readonly string[]).includes(column.type)) return;

        const rootItem = board.items.find(i => i.id === itemId);
        if (!rootItem) return;

        // Only the column that actually anchors this item's bar drives the
        // cascade. Otherwise editing some secondary date column would drag
        // successors whose arrows are anchored to the timeline column.
        const rootResolved = resolveTimelineColumn(board.columns, rootItem);
        if (!rootResolved || rootResolved.colId !== columnId) return;

        const delta = deltaDays(column.type, oldValue, newValue);
        if (delta === null || delta === 0) return;

        const boardDeps = get().itemDependencies.filter(d => d.boardId === activeBoardId);
        if (boardDeps.length === 0) return;

        const adjacency = buildSuccessorMap(boardDeps);
        const visited = new Set<string>([itemId]);
        const queue = [itemId];
        const shifts: { itemId: string; colId: string; value: any }[] = [];

        while (queue.length > 0 && visited.size < MAX_CASCADE_NODES) {
            const current = queue.shift()!;

            for (const successorId of adjacency.get(current) ?? []) {
                if (visited.has(successorId)) continue;
                visited.add(successorId);
                // Traverse even when this successor has no dates of its own, so
                // A -> B(no dates) -> C still moves C.
                queue.push(successorId);

                const successor = board.items.find(i => i.id === successorId);
                if (!successor) continue;

                const resolved = resolveTimelineColumn(board.columns, successor);
                if (!resolved) continue;

                shifts.push({
                    itemId: successorId,
                    colId: resolved.colId,
                    value: shiftValue(resolved.type, resolved.value, delta)
                });
            }
        }

        if (shifts.length === 0) return;

        const shiftById = new Map(shifts.map(s => [s.itemId, s]));
        const applyShift = <T extends { id: string; values: any }>(item: T): T => {
            const shift = shiftById.get(item.id);
            return shift ? { ...item, values: { ...item.values, [shift.colId]: shift.value } } : item;
        };

        // One optimistic pass. Items live in both board.items and
        // board.groups[].items, so both copies have to be patched.
        set(state => ({
            boards: state.boards.map(b =>
                b.id === activeBoardId
                    ? {
                        ...b,
                        items: b.items.map(applyShift),
                        groups: b.groups.map(g => ({ ...g, items: g.items.map(applyShift) }))
                    }
                    : b
            ),
            // Covers these rows under the realtime echo-suppression window so
            // our own writes don't bounce back and re-render.
            lastOptimisticUpdate: shifts.reduce(
                (acc, s) => ({ ...acc, [s.itemId]: Date.now() }),
                state.lastOptimisticUpdate
            )
        }));

        const updatedBoard = get().boards.find(b => b.id === activeBoardId);
        const results = await Promise.allSettled(
            shifts.map(shift => {
                const values = updatedBoard?.items.find(i => i.id === shift.itemId)?.values;
                if (!values) return Promise.resolve(null);
                return supabase.from('items').update({ values }).eq('id', shift.itemId);
            })
        );

        const failed = results.filter(r => r.status === 'rejected').length;
        if (failed > 0) {
            console.error(`[Dependencies] ${failed}/${shifts.length} cascaded shifts failed to save`);
        }

        get().logActivity('dependency_cascade', 'item', itemId, {
            board_id: activeBoardId,
            delta_days: delta,
            shifted_count: shifts.length,
            item_title: rootItem.title
        });
    }
});
