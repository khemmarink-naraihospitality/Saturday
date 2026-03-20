import type { StateCreator } from 'zustand';
import { supabase } from '../../lib/supabase';
import { v4 as uuidv4 } from 'uuid';
import type { BoardState } from '../useBoardStore';

export interface GroupSlice {
    addGroup: (title: string) => Promise<void>;
    deleteGroup: (groupId: string) => Promise<void>;
    updateGroupTitle: (groupId: string, newTitle: string) => Promise<void>;
    updateGroupColor: (groupId: string, color: string) => Promise<void>;
    toggleGroup: (boardId: string, groupId: string) => void;
    reorderGroups: (activeId: string, overId: string) => Promise<void>;
}

export const createGroupSlice: StateCreator<
    BoardState,
    [],
    [],
    GroupSlice
> = (set, get) => ({
    addGroup: async (title) => {
        const { activeBoardId } = get();
        if (!activeBoardId) return;
        const newGroupId = uuidv4();
        const color = '#579bfc';

        const board = get().boards.find(b => b.id === activeBoardId);
        const minOrder = board && board.groups.length > 0 
            ? Math.min(...board.groups.map(g => g.order || 0))
            : 0;
        const order = minOrder - 1;
        const newGroup = { id: newGroupId, title, color, items: [], order };

        set(state => ({
            boards: state.boards.map(b => b.id === activeBoardId ? { ...b, groups: [newGroup, ...b.groups] } : b)
        }));
        await supabase.from('groups').insert({ id: newGroupId, board_id: activeBoardId, title, color, order });

        get().logActivity('group_created', 'board', activeBoardId, {
            board_id: activeBoardId,
            group_title: title
        });
    },

    deleteGroup: async (groupId) => {
        const { activeBoardId } = get();
        const group = get().boards.find(b => b.id === activeBoardId)?.groups.find(g => g.id === groupId);

        set(state => ({
            boards: state.boards.map(b => b.id === activeBoardId ? { ...b, groups: b.groups.filter(g => g.id !== groupId) } : b)
        }));
        await supabase.from('groups').delete().eq('id', groupId);

        if (activeBoardId) {
            get().logActivity('group_deleted', 'board', activeBoardId, {
                board_id: activeBoardId,
                group_title: group?.title || 'Unknown'
            });
        }
    },

    updateGroupTitle: async (groupId, newTitle) => {
        const { activeBoardId } = get();
        if (!activeBoardId) return;

        const group = get().boards.find(b => b.id === activeBoardId)?.groups.find(g => g.id === groupId);
        const oldTitle = group?.title;

        set(state => ({
            boards: state.boards.map(b => b.id === activeBoardId ?
                { ...b, groups: b.groups.map(g => g.id === groupId ? { ...g, title: newTitle } : g) } : b
            )
        }));
        await supabase.from('groups').update({ title: newTitle }).eq('id', groupId);

        if (activeBoardId && oldTitle && oldTitle !== newTitle) {
            get().logActivity('group_renamed', 'board', activeBoardId, {
                board_id: activeBoardId,
                group_id: groupId,
                old_title: oldTitle,
                new_title: newTitle
            });
        }
    },

    updateGroupColor: async (groupId, color) => {
        const { activeBoardId } = get();
        set(state => ({
            boards: state.boards.map(b => b.id === activeBoardId ?
                { ...b, groups: b.groups.map(g => g.id === groupId ? { ...g, color } : g) } : b
            )
        }));
        await supabase.from('groups').update({ color }).eq('id', groupId);
    },

    toggleGroup: (boardId, groupId) => {
        set(state => ({
            boards: state.boards.map(b => {
                if (b.id !== boardId) return b;
                const collapsed = b.collapsedGroups || [];
                const isCollapsed = collapsed.includes(groupId);
                return {
                    ...b,
                    collapsedGroups: isCollapsed ? collapsed.filter(id => id !== groupId) : [...collapsed, groupId]
                };
            })
        }));
    },

    reorderGroups: async (activeId, overId) => {
        const { activeBoardId, boards } = get();
        if (!activeBoardId || activeId === overId) return;

        const board = boards.find(b => b.id === activeBoardId);
        if (!board) return;

        const activeIndex = board.groups.findIndex(g => g.id === activeId);
        const overIndex = board.groups.findIndex(g => g.id === overId);
        if (activeIndex === -1 || overIndex === -1) return;

        const { arrayMove } = await import('@dnd-kit/sortable');
        const newGroups = arrayMove(board.groups, activeIndex, overIndex);
        
        // Update local state with new order
        const updatedGroups = newGroups.map((group, index) => ({
            ...group,
            order: index
        }));

        set(state => ({
            boards: state.boards.map(b => 
                b.id === activeBoardId ? { ...b, groups: updatedGroups } : b
            )
        }));

        // Persist to Supabase
        try {
            // We'll use a transaction-like update or an RPC if available.
            // Since we're not sure about the RPC, we'll try to call it and fallback if it fails.
            const groupIds = updatedGroups.map(g => g.id);
            const { error } = await supabase.rpc('reorder_groups', { 
                _board_id: activeBoardId, 
                _group_ids: groupIds 
            });

            if (error) {
                console.error('[reorderGroups] RPC failed, falling back to individual updates:', error);
                // Fallback: update each group's order
                await Promise.all(updatedGroups.map(g => 
                    supabase.from('groups').update({ order: g.order }).eq('id', g.id)
                ));
            }
        } catch (err) {
            console.error('[reorderGroups] Exception during persistence:', err);
        }
    },
});
