import type { StateCreator } from 'zustand';
import { supabase } from '../../lib/supabase';
import { v4 as uuidv4 } from 'uuid';
import { arrayMove } from '@dnd-kit/sortable';
import type { Item, FileLink } from '../../types';
import type { BoardState } from '../useBoardStore';

export interface ItemSlice {
    selectedItemIds: string[];
    showHiddenItems: boolean;
    activeItemId: string | null;
    highlightedItemId: string | null;
    searchQuery: string;
    lastOptimisticUpdate: Record<string, number>;

    // Actions
    addItem: (title: string, groupId: string, parentId?: string) => Promise<void>;
    updateItemValue: (itemId: string, columnId: string, value: any) => Promise<void>;
    updateItemTitle: (itemId: string, newTitle: string, shouldLog?: boolean) => Promise<void>;
    updateItemFiles: (itemId: string, files: FileLink[]) => Promise<void>;
    deleteItem: (itemId: string) => Promise<void>;
    moveItem: (activeId: string, overId: string) => Promise<void>;

    // Update/Comment
    addUpdate: (itemId: string, content: string, author: { name: string; id: string }) => Promise<void>;
    deleteUpdate: (itemId: string, updateId: string) => Promise<void>;

    // View Options
    toggleShowHiddenItems: () => void;
    setActiveItem: (itemId: string | null) => void;
    setHighlightedItem: (itemId: string | null) => void;
    setSearchQuery: (query: string) => void;

    // Selection
    toggleItemSelection: (itemId: string, selected: boolean) => void;
    selectGroupItems: (groupId: string) => void;
    clearSelection: () => void;
    deleteSelectedItems: () => void;

    // Batch Actions
    duplicateSelectedItems: () => Promise<void>;
    hideSelectedItems: () => Promise<void>;
    unhideSelectedItems: () => Promise<void>;
    moveSelectedItemsToGroup: (groupId: string) => Promise<void>;

    // UI/Drafts
    drafts: Record<string, string>;
    setDraft: (itemId: string, content: string) => void;

    // Concurrency
    setLastOptimisticUpdate: (itemId: string, timestamp: number) => void;
}

export const createItemSlice: StateCreator<
    BoardState,
    [],
    [],
    ItemSlice
> = (set, get) => ({
    selectedItemIds: [],
    showHiddenItems: false,
    activeItemId: null,
    highlightedItemId: null,
    searchQuery: '',
    drafts: {},
    lastOptimisticUpdate: {},

    setLastOptimisticUpdate: (itemId, timestamp) => {
        set(state => ({ lastOptimisticUpdate: { ...state.lastOptimisticUpdate, [itemId]: timestamp } }));
    },

    addItem: async (title, groupId, parentId) => {
        const { activeBoardId } = get();
        if (!activeBoardId) return;

        const currentGroupItems = get().boards.find(b => b.id === activeBoardId)?.groups.find(g => g.id === groupId)?.items || [];
        const maxOrder = currentGroupItems.reduce((max, item) => Math.max(max, item.order || 0), -1);
        const nextOrder = maxOrder + 1;

        const newItem: Item = {
            id: uuidv4(),
            title,
            groupId,
            boardId: activeBoardId,
            values: {},
            updates: [],
            createdAt: new Date().toISOString(),
            order: nextOrder,
            parentId
        };

        set(state => ({
            boards: state.boards.map(b =>
                b.id === activeBoardId
                    ? {
                        ...b,
                        items: [...b.items, newItem],
                        groups: b.groups.map(g =>
                            g.id === groupId
                                ? { ...g, items: [...g.items, newItem] }
                                : g
                        )
                    }
                    : b
            )
        }));

        const { error } = await supabase.from('items').insert({
            id: newItem.id,
            title: newItem.title,
            board_id: activeBoardId,
            group_id: groupId,
            values: {},
            order: nextOrder,
            parent_id: parentId
        });

        if (!error) {
            const groupTitle = get().boards.find(b => b.id === activeBoardId)?.groups.find(g => g.id === groupId)?.title;
            get().logActivity('item_created', 'item', newItem.id, {
                board_id: activeBoardId,
                item_title: title,
                group_title: groupTitle
            });
        }
    },

    updateItemValue: async (itemId, columnId, value) => {
        const { activeBoardId, boards } = get();
        if (!activeBoardId) return;

        const board = boards.find(b => b.id === activeBoardId);
        if (!board) return;
        const column = board.columns.find(c => c.id === columnId);
        const item = board.items.find(i => i.id === itemId);

        let logMeta: any = null;
        if (column && item) {
            const oldValue = item.values?.[columnId];
            const newValue = value;
            if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
                logMeta = {
                    board_id: activeBoardId,
                    column_title: column.title,
                    column_type: column.type,
                    old_value: oldValue,
                    new_value: newValue,
                    item_title: item.title,
                };

                if (column.type === 'status') {
                    const oldOption = column.options?.find(o => o.id === oldValue);
                    const newOption = column.options?.find(o => o.id === newValue);
                    logMeta.old_label = oldOption?.label || 'None';
                    logMeta.old_color = oldOption?.color;
                    logMeta.new_label = newOption?.label || 'None';
                    logMeta.new_color = newOption?.color;
                }
            }
        }

        set(state => ({
            boards: state.boards.map(b =>
                b.id === activeBoardId
                    ? {
                        ...b,
                        items: b.items.map(i => i.id === itemId ? { ...i, values: { ...i.values, [columnId]: value } } : i),
                        groups: b.groups.map(g => ({
                            ...g,
                            items: g.items.map(i => i.id === itemId ? { ...i, values: { ...i.values, [columnId]: value } } : i)
                        }))
                    }
                    : b
            ),
            lastOptimisticUpdate: { ...state.lastOptimisticUpdate, [itemId]: Date.now() }
        }));

        const currentItem = get().boards.find(b => b.id === activeBoardId)?.items.find(i => i.id === itemId);
        if (currentItem) {
            await supabase.from('items').update({ values: currentItem.values }).eq('id', itemId);
            if (logMeta) {
                if (column?.type === 'status') {
                    get().logActivity('item_status_updated', 'item', itemId, logMeta);
                } else {
                    get().logActivity('item_value_updated', 'item', itemId, logMeta);
                }
            }
        }
    },

    updateItemTitle: async (itemId, newTitle, shouldLog = false) => {
        const { activeBoardId } = get();
        if (!activeBoardId) return;
        const oldItem = get().boards.find(b => b.id === activeBoardId)?.items.find(i => i.id === itemId);
        const oldTitle = oldItem?.title;

        set(state => ({
            boards: state.boards.map(b =>
                b.id === activeBoardId
                    ? {
                        ...b,
                        items: b.items.map(i => i.id === itemId ? { ...i, title: newTitle } : i),
                        groups: b.groups.map(g => ({
                            ...g,
                            items: g.items.map(i => i.id === itemId ? { ...i, title: newTitle } : i)
                        }))
                    }
                    : b
            ),
            lastOptimisticUpdate: { ...state.lastOptimisticUpdate, [itemId]: Date.now() }
        }));

        await supabase.from('items').update({ title: newTitle }).eq('id', itemId);

        if (shouldLog && oldTitle && oldTitle !== newTitle) {
            get().logActivity('item_renamed', 'item', itemId, {
                board_id: activeBoardId,
                old_title: oldTitle,
                new_title: newTitle
            });
        }
    },

    updateItemFiles: async (itemId, files) => {
        const { boards, activeBoardId, logActivity } = get();
        if (!activeBoardId) return;

        set(state => ({
            boards: boards.map(b => b.id === activeBoardId ? {
                ...b,
                items: b.items.map(i => i.id === itemId ? { ...i, files } : i),
                groups: b.groups.map(g => ({
                    ...g,
                    items: g.items.map(i => i.id === itemId ? { ...i, files } : i)
                }))
            } : b),
            lastOptimisticUpdate: { ...state.lastOptimisticUpdate, [itemId]: Date.now() }
        }));

        try {
            const filesPayload = files.length > 0 ? files : [];
            const { error } = await supabase.from('items').update({ files: filesPayload }).eq('id', itemId);
            if (error) throw error;
            await logActivity('item_files_updated', 'item', itemId, { fileName: files.length > 0 ? files[files.length - 1].name : 'File removed' });
        } catch (e) {
            console.error('Failed to update files:', e);
            get().loadUserData(true);
        }
    },

    deleteItem: async (itemId) => {
        const { activeBoardId } = get();
        const item = get().boards.find(b => b.id === activeBoardId)?.items.find(i => i.id === itemId);
        const title = item?.title;

        set(state => ({
            boards: state.boards.map(b =>
                b.id === activeBoardId
                    ? {
                        ...b,
                        items: b.items.filter(i => i.id !== itemId),
                        groups: b.groups.map(g => ({ ...g, items: g.items.filter(i => i.id !== itemId) }))
                    }
                    : b
            ),
            selectedItemIds: state.selectedItemIds.filter(id => id !== itemId)
        }));

        await supabase.from('items').delete().eq('id', itemId);
        if (activeBoardId) {
            get().logActivity('item_deleted', 'item', itemId, {
                board_id: activeBoardId,
                item_title: title || 'Unknown'
            });
        }
    },

    moveItem: async (activeId, overId) => {
        const { activeBoardId, boards } = get();
        if (!activeBoardId || activeId === overId) return;
        const board = boards.find(b => b.id === activeBoardId);
        if (!board) return;

        const activeItem = board.items.find(i => i.id === activeId);
        if (!activeItem) return;

        const normalizedOverId = overId.replace(/-header$/, '').replace(/-footer$/, '');
        const overGroup = board.groups.find(g => g.id === normalizedOverId);

        let newItems = [...board.items];
        let newGroupId = activeItem.groupId;

        if (overGroup) {
            newGroupId = overGroup.id;
            const activeIndex = newItems.findIndex(i => i.id === activeId);
            if (activeIndex !== -1) newItems.splice(activeIndex, 1);

            const firstItemInGroupIndex = newItems.findIndex(i => i.groupId === newGroupId);
            const movedItem = { ...activeItem, groupId: newGroupId };

            if (firstItemInGroupIndex !== -1) {
                newItems.splice(firstItemInGroupIndex, 0, movedItem);
            } else {
                newItems.push(movedItem);
            }
        } else {
            const overItem = board.items.find(i => i.id === overId);
            if (!overItem) return;

            if (activeItem.groupId === overItem.groupId) {
                const activeIndex = board.items.findIndex(i => i.id === activeId);
                const overIndex = board.items.findIndex(i => i.id === overId);
                newItems = arrayMove(newItems, activeIndex, overIndex);
            } else {
                newGroupId = overItem.groupId;
                newItems = newItems.filter(i => i.id !== activeId);
                const overIndexInNewArray = newItems.findIndex(i => i.id === overId);
                const movedItem = { ...activeItem, groupId: newGroupId };
                newItems.splice(overIndexInNewArray, 0, movedItem);
            }
        }

        const updatedBoards = boards.map(b => {
            if (b.id !== activeBoardId) return b;
            const updatedItems = newItems.map((item, index) => ({ ...item, order: index }));
            return {
                ...b,
                items: updatedItems,
                groups: b.groups.map(g => ({
                    ...g,
                    items: updatedItems.filter(i => i.groupId === g.id)
                }))
            };
        });

        set(state => ({
            boards: updatedBoards,
            lastOptimisticUpdate: { ...state.lastOptimisticUpdate, [activeId]: Date.now() }
        }));

        try {
            if (activeItem.groupId !== newGroupId) {
                await supabase.from('items').update({ group_id: newGroupId }).eq('id', activeId);
            }
            await supabase.rpc('reorder_items', { _board_id: activeBoardId, _item_ids: newItems.map(i => i.id) });
        } catch (err) {
            console.error('[moveItem] Exception during persistence:', err);
        }
    },

    addUpdate: async (itemId, content, author) => {
        const { activeBoardId } = get();
        const newUpdate = { id: uuidv4(), content, author: author.name, createdAt: new Date().toISOString() };

        set(state => ({
            boards: state.boards.map(b => {
                if (b.id !== activeBoardId) return b;
                return {
                    ...b,
                    items: b.items.map(i => i.id !== itemId ? i : { ...i, updates: [newUpdate, ...(i.updates || [])] })
                };
            })
        }));

        const board = get().boards.find(b => b.id === activeBoardId);
        const item = board?.items.find(i => i.id === itemId);
        let updatedList = item?.updates || [];

        await supabase.from('items').update({ updates: updatedList }).eq('id', itemId);
        get().logActivity('item_comment_added', 'item', itemId, { board_id: activeBoardId, item_title: item?.title || 'Unknown Task' });

        // Mentions Logic (Simplified - see original for full regex if needed, but keeping basic for slice)
        const dataIdRegex = /data-id="([^"]+)"/g;
        let dataIdMatch;
        while ((dataIdMatch = dataIdRegex.exec(content)) !== null) {
            if (dataIdMatch[1] && dataIdMatch[1] !== author.id) {
                await get().createNotification(dataIdMatch[1], 'mention', `${author.name} mentioned you in an update`, itemId, { board_id: activeBoardId });
            }
        }
    },

    deleteUpdate: async (itemId, updateId) => {
        const { activeBoardId } = get();
        set(state => ({
            boards: state.boards.map(b => {
                if (b.id !== activeBoardId) return b;
                return {
                    ...b,
                    items: b.items.map(i => i.id !== itemId ? i : { ...i, updates: (i.updates || []).filter(u => u.id !== updateId) })
                };
            })
        }));

        const board = get().boards.find(b => b.id === activeBoardId);
        const item = board?.items.find(i => i.id === itemId);
        await supabase.from('items').update({ updates: item?.updates || [] }).eq('id', itemId);
    },

    toggleShowHiddenItems: () => set(state => ({ showHiddenItems: !state.showHiddenItems })),
    setActiveItem: (itemId) => set({ activeItemId: itemId }),
    setHighlightedItem: (itemId) => set({ highlightedItemId: itemId }),
    setSearchQuery: (query) => set({ searchQuery: query }),

    toggleItemSelection: (itemId, selected) => {
        set(state => {
            const current = new Set(state.selectedItemIds);
            if (selected) current.add(itemId); else current.delete(itemId);
            return { selectedItemIds: Array.from(current) };
        });
    },
    selectGroupItems: (groupId) => {
        const { activeBoardId, boards } = get();
        const board = boards.find(b => b.id === activeBoardId);
        const items = board?.items.filter(i => i.groupId === groupId) || [];
        set(state => {
            const current = new Set(state.selectedItemIds);
            items.forEach(i => current.add(i.id));
            return { selectedItemIds: Array.from(current) };
        });
    },
    clearSelection: () => set({ selectedItemIds: [] }),
    deleteSelectedItems: async () => {
        const { activeBoardId, selectedItemIds } = get();
        if (!activeBoardId) return;
        set(state => ({
            boards: state.boards.map(b => b.id === activeBoardId ? {
                ...b,
                items: b.items.filter(i => !selectedItemIds.includes(i.id)),
                groups: b.groups.map(g => ({ ...g, items: g.items.filter(i => !selectedItemIds.includes(i.id)) }))
            } : b),
            selectedItemIds: []
        }));
        await supabase.from('items').delete().in('id', selectedItemIds);
    },

    duplicateSelectedItems: async () => {
        const { activeBoardId, selectedItemIds, boards } = get();
        if (!activeBoardId) return;
        const board = boards.find(b => b.id === activeBoardId);
        if (!board) return;

        const itemsToDuplicate = board.items.filter(i => selectedItemIds.includes(i.id));
        const newItems: Item[] = itemsToDuplicate.map(item => ({
            ...item,
            id: uuidv4(),
            title: `${item.title} (Copy)`,
            createdAt: new Date().toISOString(),
            order: (item.order || 0) + 0.5 // crude way to push logic, refined later
        }));

        set(state => ({
            boards: state.boards.map(b => b.id === activeBoardId ? {
                ...b,
                items: [...b.items, ...newItems],
                groups: b.groups.map(g => ({
                    ...g,
                    // Simply append to group for now
                    items: [...g.items, ...newItems.filter(ni => ni.groupId === g.id)]
                }))
            } : b),
            selectedItemIds: [] // Clear selection after duplicate?
        }));

        const { error } = await supabase.from('items').insert(newItems);
        if (error) console.error('Failed to duplicate items:', error);
    },

    hideSelectedItems: async () => {
        const { activeBoardId, selectedItemIds } = get();
        if (!activeBoardId) return;

        set(state => ({
            boards: state.boards.map(b => b.id === activeBoardId ? {
                ...b,
                items: b.items.map(i => selectedItemIds.includes(i.id) ? { ...i, isHidden: true } : i),
                groups: b.groups.map(g => ({
                    ...g,
                    items: g.items.map(i => selectedItemIds.includes(i.id) ? { ...i, isHidden: true } : i)
                }))
            } : b),
            selectedItemIds: []
        }));

        await supabase.from('items').update({ isHidden: true }).in('id', selectedItemIds);
    },

    unhideSelectedItems: async () => {
        const { activeBoardId, selectedItemIds } = get();
        if (!activeBoardId) return;

        set(state => ({
            boards: state.boards.map(b => b.id === activeBoardId ? {
                ...b,
                items: b.items.map(i => selectedItemIds.includes(i.id) ? { ...i, isHidden: false } : i),
                groups: b.groups.map(g => ({
                    ...g,
                    items: g.items.map(i => selectedItemIds.includes(i.id) ? { ...i, isHidden: false } : i)
                }))
            } : b),
            selectedItemIds: []
        }));

        await supabase.from('items').update({ isHidden: false }).in('id', selectedItemIds);
    },

    moveSelectedItemsToGroup: async (groupId) => {
        const { activeBoardId, selectedItemIds, boards } = get();
        if (!activeBoardId) return;

        set(state => ({
            boards: state.boards.map(b => b.id === activeBoardId ? {
                ...b,
                items: b.items.map(i => selectedItemIds.includes(i.id) ? { ...i, groupId } : i),
                groups: b.groups.map(g => {
                    if (g.id === groupId) {
                        // Add moved items
                        const currentItems = g.items;
                        const incoming = boards.find(bd => bd.id === activeBoardId)?.items.filter(i => selectedItemIds.includes(i.id)) || [];
                        return { ...g, items: [...currentItems, ...incoming.map(i => ({ ...i, groupId }))] };
                    }
                    // Remove moved items from other groups
                    return { ...g, items: g.items.filter(i => !selectedItemIds.includes(i.id)) };
                })
            } : b),
            selectedItemIds: []
        }));

        await supabase.from('items').update({ group_id: groupId }).in('id', selectedItemIds);
    },

    setDraft: (itemId, content) => set(state => ({ drafts: { ...state.drafts, [itemId]: content } })),
});
