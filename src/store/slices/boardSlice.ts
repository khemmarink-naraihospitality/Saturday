import type { StateCreator } from 'zustand';
import { supabase } from '../../lib/supabase';
import { v4 as uuidv4 } from 'uuid';
import { arrayMove } from '@dnd-kit/sortable';
import type { Board, ColumnType } from '../../types';
import type { BoardState } from '../useBoardStore';

export interface BoardSlice {
    boards: Board[];
    activeBoardId: string | null;
    isLoading: boolean;
    isSyncing: boolean;
    isInitializing: boolean;
    error: string | null;
    activePage: string;

    userBoardRoles: Record<string, string>;
    userWorkspaceRoles: Record<string, string>;
    sharedBoardIds: string[];
    sharedWorkspaceIds: string[];

    // Board Actions
    addBoard: (title: string, subWorkspaceId?: string) => Promise<void>;
    deleteBoard: (id: string) => Promise<void>;
    restoreBoard: (id: string) => Promise<void>;
    setActiveBoard: (id: string | null) => Promise<void>;
    updateBoard: (boardId: string, updates: Partial<Board>) => Promise<void>;
    duplicateBoard: (boardId: string) => Promise<void>;
    moveBoard: (activeId: string, overId: string) => void;
    toggleGroup: (boardId: string, groupId: string) => void;
    toggleItemExpansion: (boardId: string, itemId: string) => void;
    duplicateBoardToWorkspace: (boardId: string, workspaceId: string) => Promise<void>;
    moveBoardToWorkspace: (boardId: string, workspaceId: string) => Promise<void>;
    toggleFavorite: (boardId: string) => Promise<void>;
    navigateTo: (page: string) => void;
    setActivePage: (page: string) => void;
    setActiveView: (boardId: string, viewId: string) => void;
    setSort: (boardId: string, sort: { columnId: string; direction: 'asc' | 'desc' } | null) => void;
    setBoardFilters: (boardId: string, filters: { columnId: string; values: string[] }[]) => void;
    setBoardGroupBy: (boardId: string, columnId: string | null) => void;

    // Data Loading
    loadUserData: (isSilent?: boolean) => Promise<void>;
}

export const createBoardSlice: StateCreator<
    BoardState,
    [],
    [],
    BoardSlice
> = (set, get) => ({
    boards: [],
    activeBoardId: null,
    isLoading: true,
    isSyncing: false,
    isInitializing: false,
    error: null,
    activePage: 'board',
    userBoardRoles: {},
    userWorkspaceRoles: {},
    sharedBoardIds: [],
    sharedWorkspaceIds: [],

    navigateTo: (page) => set({ activePage: page }),
    setActivePage: (page) => set({ activePage: page }),
    setActiveView: (boardId, viewId) => set(state => ({
        boards: state.boards.map(b => b.id === boardId ? { ...b, activeViewId: viewId } : b)
    })),
    setSort: (boardId, sort) => set(state => ({
        boards: state.boards.map(b => b.id === boardId ? { ...b, sort } : b)
    })),
    setBoardFilters: (boardId, filters) => set(state => ({
        boards: state.boards.map(b => b.id === boardId ? { ...b, filters } : b)
    })),
    setBoardGroupBy: (boardId, columnId) => set(state => ({
        boards: state.boards.map(b => b.id === boardId ? { ...b, groupByColumnId: columnId } : b)
    })),

    toggleGroup: (boardId, groupId) => {
        set(state => ({
            boards: state.boards.map(b => {
                if (b.id !== boardId) return b;
                const next = new Set(b.collapsedGroups || []);
                if (next.has(groupId)) next.delete(groupId);
                else next.add(groupId);
                return { ...b, collapsedGroups: Array.from(next) };
            })
        }));
    },

    toggleItemExpansion: (boardId, itemId) => {
        set(state => ({
            boards: state.boards.map(b => {
                if (b.id !== boardId) return b;
                const next = new Set(b.expandedItemIds || []);
                if (next.has(itemId)) next.delete(itemId);
                else next.add(itemId);
                return { ...b, expandedItemIds: Array.from(next) };
            })
        }));
    },

    loadUserData: async (isSilent = false) => {
        if (get().isInitializing) return;

        if (!isSilent) {
            // Only show full loading if we have NO data yet
            const currentBoards = get().boards;
            if (currentBoards.length === 0) {
                set({ isLoading: true, error: null, isInitializing: true });
            } else {
                set({ isSyncing: true, error: null, isInitializing: true });
            }
        } else {
            set({ isSyncing: true, error: null, isInitializing: true });
        }
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                set({ isLoading: false, isInitializing: false });
                return;
            }

            // Using full typed response validation would be better but keeping structure
            const [
                { data: workspaces },
                { data: boards },
                { data: groups },
                { data: columns },
                { data: items },
                { data: sharedBoardsData },
                { data: sharedWorkspacesData },
                { data: userFavoritesData }
            ] = await Promise.all([
                supabase.from('workspaces').select('*').order('order'),
                supabase.from('boards').select('*, is_archived, is_favorite').order('order'),
                supabase.from('groups').select('*').order('order'),
                supabase.from('columns').select('*').order('order'),
                supabase.from('items').select('id, title, board_id, group_id, values, updates, files, order, is_hidden, created_at, parent_id').order('order'),
                supabase.from('board_members').select('board_id, role, last_viewed_at').eq('user_id', user.id),
                supabase.from('workspace_members').select('workspace_id, role').eq('user_id', user.id),
                supabase.from('user_favorites').select('board_id').eq('user_id', user.id)
            ]);

            // --- SELF HEALING: Fix 'Person' columns that are somehow 'text' type ---
            if (columns && columns.length > 0) {
                const buggedColumns = columns.filter(c => (c.title === 'Person' || c.title === 'Owner') && c.type === 'text');
                if (buggedColumns.length > 0) {
                    console.log('[AutoFix] Found bugged Person columns:', buggedColumns.length);
                    await Promise.all(buggedColumns.map(c =>
                        supabase.from('columns').update({ type: 'people', options: [] }).eq('id', c.id)
                    ));
                    buggedColumns.forEach(c => { c.type = 'people'; c.options = []; });
                }
            }
            // ---------------------------------------------------------------------

            if (!workspaces || !boards) throw new Error('Failed to load core data');

            // 0. ENSURE PROFILE
            let { data: existingProfile } = await supabase.from('profiles').select('*').eq('id', user.id).single();

            // Fetch profiles for workspace owners to display names
            const workspaceOwnerIds = Array.from(new Set(workspaces.map((w: any) => w.owner_id).filter(Boolean)));
            let ownerProfilesMap: Record<string, string> = {};
            if (workspaceOwnerIds.length > 0) {
                const { data: ownerProfiles } = await supabase.from('profiles').select('id, full_name').in('id', workspaceOwnerIds);
                if (ownerProfiles) {
                    ownerProfiles.forEach((p: any) => {
                        ownerProfilesMap[p.id] = p.full_name || 'Unknown';
                    });
                }
            }

            console.log('[DEBUG] User Metadata:', user.user_metadata);
            console.log('[DEBUG] Existing Profile:', existingProfile);

            const { error: profileError } = await supabase.from('profiles').upsert({
                id: user.id,
                email: user.email,
                full_name: user.user_metadata?.full_name || user.email?.split('@')[0],
                avatar_url: user.user_metadata?.avatar_url,
                system_role: existingProfile?.system_role || 'user'
            }, { onConflict: 'id' });

            if (profileError) console.error("Failed to ensure profile:", profileError);
            else console.log('[DEBUG] Profile ensured successfully');

            // console.log('DEBUG: loadUserData sharedBoardsData:', sharedBoardsData);

            const lastViewedMap: Record<string, string> = {};
            if (sharedBoardsData) {
                sharedBoardsData.forEach((r: any) => {
                    if (r.board_id && r.last_viewed_at) {
                        lastViewedMap[r.board_id] = r.last_viewed_at;
                    }
                });
            }

            const favoritedBoardIds = new Set(userFavoritesData?.map(f => f.board_id) || []);

            const fullBoards: Board[] = boards.map(b => {
                const bGroups = (groups || []).filter(g => g.board_id === b.id);
                const bColumns = (columns || []).filter(c => c.board_id === b.id);
                const bItems = (items || []).filter(i => i.board_id === b.id);

                return {
                    id: b.id,
                    workspaceId: b.workspace_id,
                    title: b.title,
                    is_archived: b.is_archived,
                    isFavorite: favoritedBoardIds.has(b.id),
                    lastViewedAt: lastViewedMap[b.id] || undefined,
                    columns: bColumns.map(c => ({
                        id: c.id,
                        title: c.title,
                        type: c.type as ColumnType,
                        width: c.width,
                        order: c.order,
                        options: typeof c.options === 'string' ? JSON.parse(c.options) : (c.options || []),
                        aggregation: c.aggregation
                    })),
                    groups: bGroups.map(g => ({
                        id: g.id,
                        title: g.title,
                        color: g.color,
                        items: bItems.filter(i => i.group_id === g.id).map(i => ({
                            id: i.id,
                            title: i.title,
                            groupId: g.id,
                            boardId: b.id,
                            values: i.values || {},
                            isHidden: i.is_hidden,
                            updates: i.updates || [],
                            files: i.files || [],
                            order: i.order,
                            parentId: i.parent_id
                        })).sort((a, b) => (a.order || 0) - (b.order || 0) || a.id.localeCompare(b.id))
                    })),
                    items: bItems.map(i => ({
                        id: i.id,
                        title: i.title,
                        groupId: i.group_id,
                        boardId: b.id,
                        values: i.values || {},
                        isHidden: i.is_hidden,
                        updates: i.updates || [],
                        files: i.files || [],
                        parentId: i.parent_id
                    })),
                    itemColumnTitle: 'Item',
                    itemColumnWidth: 500
                };
            });

            // ... (Active Workspace/Board determination) ...
            // Simplified for brevity in replacement constraint

            // Determine Active Workspace
            const currentWorkspaceId = get().activeWorkspaceId;
            const validCurrentWorkspace = workspaces.find((w: any) => w.id === currentWorkspaceId);
            let activeWorkspaceId = validCurrentWorkspace ? validCurrentWorkspace.id : '';
            if (!activeWorkspaceId) {
                const lastWorkspaceId = localStorage.getItem('lastActiveWorkspaceId');
                const validWorkspace = workspaces.find((w: any) => w.id === lastWorkspaceId);
                activeWorkspaceId = validWorkspace ? validWorkspace.id : (workspaces[0]?.id || '');
            }

            // Determine Active Board
            const currentBoardId = get().activeBoardId;
            const validCurrentBoard = fullBoards.find(b => b.id === currentBoardId);
            let activeBoardId = validCurrentBoard ? validCurrentBoard.id : null;
            if (!activeBoardId) {
                const lastBoardId = localStorage.getItem('lastActiveBoardId');
                const validBoard = fullBoards.find(b => b.id === lastBoardId);
                activeBoardId = validBoard ? validBoard.id : null;
            }

            const boardRoles: Record<string, string> = {};
            sharedBoardsData?.forEach((r: any) => {
                if (r.board_id) boardRoles[r.board_id] = r.role || 'viewer';
            });

            const workspaceRoles: Record<string, string> = {};
            sharedWorkspacesData?.forEach((r: any) => {
                if (r.workspace_id) workspaceRoles[r.workspace_id] = r.role || 'member';
            });

            set({
                workspaces: workspaces.map((w: any) => ({
                    id: w.id,
                    title: w.title,
                    order: w.order,
                    owner_id: w.owner_id,
                    ownerName: ownerProfilesMap[w.owner_id] // Add ownerName
                })),
                boards: fullBoards,
                sharedBoardIds: sharedBoardsData?.map((r: any) => r.board_id) || [],
                sharedWorkspaceIds: sharedWorkspacesData?.map((r: any) => r.workspace_id) || [],
                userBoardRoles: boardRoles,
                userWorkspaceRoles: workspaceRoles,
                isLoading: false,
                activeWorkspaceId,
                activeBoardId
            });

            if (activeBoardId) {
                if (isSilent && activeBoardId === get().activeBoardId) {
                    const members = await get().getBoardMembers(activeBoardId);
                    set({ activeBoardMembers: members });
                } else {
                    get().setActiveBoard(activeBoardId);
                }
            }

        } catch (e) {
            console.error(e);
            set({ error: (e as Error).message, isLoading: false, isSyncing: false, isInitializing: false });
        } finally {
            set({ isSyncing: false, isInitializing: false });
        }
    },

    setActiveBoard: async (id) => {
        set({ activeBoardId: id, activePage: 'board' });
        localStorage.setItem('lastActiveBoardId', id || '');

        if (id) {
            window.history.pushState(null, '', `/board/${id}`);

            // Fire and forget: Update last_viewed_at
            const { data: { user } } = await supabase.auth.getUser();
            const nowISO = new Date().toISOString();

            if (user) {
                // Optimistically update local state immediately
                const updatedBoards = get().boards.map(b =>
                    b.id === id ? { ...b, lastViewedAt: nowISO } : b
                );
                set({ boards: updatedBoards });

                // Update DB and await
                const { error } = await supabase.from('board_members')
                    .update({ last_viewed_at: nowISO })
                    .eq('board_id', id)
                    .eq('user_id', user.id);

                if (error) {
                    console.error('Failed to update last_viewed_at:', error);
                }
            }

            set({ isLoadingMembers: true });
            const members = await get().getBoardMembers(id);
            set({ activeBoardMembers: members, isLoadingMembers: false });
        } else {
            set({ activeBoardMembers: [], isLoadingMembers: false });
        }
    },

    addBoard: async (title, _subWorkspaceId) => {
        const { activeWorkspaceId, boards } = get();
        if (!activeWorkspaceId) return;

        const boardId = uuidv4();
        const defaultGroups = [
            { id: uuidv4(), title: 'Group 1', color: '#579bfc', order: 0 },
            { id: uuidv4(), title: 'Group 2', color: '#784bd1', order: 1 }
        ];
        const defaultColumns = [
            {
                id: uuidv4(), title: 'Status', type: 'status' as ColumnType, order: 0, width: 140, options: [
                    { id: 'c4c4c4c4-c4c4-c4c4-c4c4-c4c4c4c4c4c4', label: 'Default', color: '#c4c4c4' }, // Status ID must be UUID to avoid DB triggers failing
                    { id: '00c87500-c875-c875-c875-00c87500c875', label: 'Done', color: '#00c875' },     // Using consistent pseudo-UUIDs for defaults
                    { id: 'e2445c00-445c-445c-445c-e2445c00e244', label: 'Stuck', color: '#e2445c' },
                    { id: 'fdab3d00-ab3d-ab3d-ab3d-fdab3d00fdab', label: 'Working on it', color: '#fdab3d' }
                ]
            },
            { id: uuidv4(), title: 'Date', type: 'date' as ColumnType, order: 1, width: 140 },
            { id: uuidv4(), title: 'Person', type: 'people', order: 2, width: 140 },
        ];

        const newBoard: Board = {
            id: boardId,
            workspaceId: activeWorkspaceId,
            title,
            columns: defaultColumns.map(c => ({ ...c, type: c.type as ColumnType, options: c.options })),
            groups: defaultGroups.map(g => ({ ...g, items: [] })),
            items: []
        };

        set({ boards: [...boards, newBoard], activeBoardId: boardId });

        await supabase.from('boards').insert({ id: boardId, workspace_id: activeWorkspaceId, title, order: boards.length });
        await supabase.from('groups').insert(defaultGroups.map(g => ({ id: g.id, board_id: boardId, title: g.title, color: g.color, order: g.order })));
        await supabase.from('columns').insert(defaultColumns.map(c => ({ id: c.id, board_id: boardId, title: c.title, type: c.type, order: c.order, width: c.width, options: c.options || [] })));

        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            await supabase.from('board_members').insert({
                board_id: boardId,
                user_id: user.id,
                role: 'owner'
            });

            const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
            set({
                activeBoardMembers: [{
                    id: uuidv4(),
                    user_id: user.id,
                    role: 'owner',
                    profiles: profile || { email: user.email, id: user.id, full_name: user.user_metadata?.full_name }
                }]
            });
        }
        get().loadUserData(true);
    },

    deleteBoard: async (id) => {
        set(state => ({
            boards: state.boards.map(b => b.id === id ? { ...b, is_archived: true } : b),
            activeBoardId: state.activeBoardId === id ? null : state.activeBoardId
        }));
        await supabase.from('boards').update({ is_archived: true }).eq('id', id);
    },

    restoreBoard: async (id) => {
        set(state => ({
            boards: state.boards.map(b => b.id === id ? { ...b, is_archived: false } : b)
        }));
        await supabase.from('boards').update({ is_archived: false }).eq('id', id);
    },

    updateBoard: async (boardId, updates) => {
        set(state => ({
            boards: state.boards.map(b => b.id === boardId ? { ...b, ...updates } : b)
        }));
        await supabase.from('boards').update(updates).eq('id', boardId);
    },

    duplicateBoard: async (boardId) => {
        const board = get().boards.find(b => b.id === boardId);
        if (board) {
            await get().duplicateBoardToWorkspace(boardId, board.workspaceId || get().activeWorkspaceId);
        }
    },

    moveBoard: async (activeId, overId) => {
        const { boards } = get();
        const activeIndex = boards.findIndex(b => b.id === activeId);
        const overIndex = boards.findIndex(b => b.id === overId);
        if (activeIndex === -1 || overIndex === -1) return;

        const newBoards = arrayMove(boards, activeIndex, overIndex);
        set({ boards: newBoards });

        const boardIds = newBoards.map(b => b.id);
        await supabase.rpc('reorder_boards', { _board_ids: boardIds });
    },

    duplicateBoardToWorkspace: async (boardId, workspaceId) => {
        const { boards, activeWorkspaceId } = get();
        const targetWorkspaceId = workspaceId || activeWorkspaceId;
        if (!targetWorkspaceId) return;

        const sourceBoard = boards.find(b => b.id === boardId);
        if (!sourceBoard) return;

        const newBoardId = uuidv4();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // 1. Prepare Columns Mapping
        const columnIdMap: Record<string, string> = {};
        const newColumns = sourceBoard.columns.map(c => {
            const newId = uuidv4();
            columnIdMap[c.id] = newId;
            return { ...c, id: newId, board_id: newBoardId };
        });

        // 2. Prepare Groups Mapping
        const groupIdMap: Record<string, string> = {};
        const newGroups = sourceBoard.groups.map(g => {
            const newId = uuidv4();
            groupIdMap[g.id] = newId;
            return { ...g, id: newId, board_id: newBoardId };
        });

        // 3. Prepare Items (Correcting value keys and group links)
        const newItems = sourceBoard.items.map((item, idx) => {
            const newId = uuidv4();
            const newValues: Record<string, any> = {};
            Object.keys(item.values || {}).forEach(oldColId => {
                const newColId = columnIdMap[oldColId] || oldColId;
                newValues[newColId] = item.values[oldColId];
            });

            return {
                ...item,
                id: newId,
                boardId: newBoardId,
                groupId: groupIdMap[item.groupId] || item.groupId,
                values: newValues,
                order: item.order ?? idx,
                parentId: item.parentId
            };
        });

        // 4. Update Local State for immediate feedback
        const duplicatedBoard: Board = {
            ...sourceBoard,
            id: newBoardId,
            workspaceId: targetWorkspaceId,
            title: `Copy of ${sourceBoard.title}`,
            columns: newColumns.map(c => ({
                id: c.id,
                title: c.title,
                type: c.type as ColumnType,
                options: c.options,
                order: c.order,
                width: c.width,
                aggregation: c.aggregation
            })),
            groups: newGroups.map(g => ({
                id: g.id,
                title: g.title,
                color: g.color,
                items: newItems.filter(i => i.groupId === g.id)
            })),
            items: newItems
        };

        set(state => ({
            boards: [...state.boards, duplicatedBoard],
            activeBoardId: newBoardId
        }));

        // 5. Persist to DB
        try {
            await supabase.from('boards').insert({
                id: newBoardId,
                workspace_id: targetWorkspaceId,
                title: duplicatedBoard.title,
                order: boards.length
            });

            if (newGroups.length > 0) {
                await supabase.from('groups').insert(newGroups.map((g, idx) => ({
                    id: g.id,
                    board_id: newBoardId,
                    title: g.title,
                    color: g.color,
                    order: g.order ?? idx
                })));
            }

            if (newColumns.length > 0) {
                await supabase.from('columns').insert(newColumns.map(c => ({
                    id: c.id,
                    board_id: newBoardId,
                    title: c.title,
                    type: c.type,
                    order: c.order,
                    width: c.width || 140,
                    options: c.options ? JSON.stringify(c.options) : '{}'
                })));
            }

            if (newItems.length > 0) {
                await supabase.from('items').insert(newItems.map(i => ({
                    id: i.id,
                    board_id: newBoardId,
                    group_id: i.groupId,
                    title: i.title,
                    values: i.values,
                    order: i.order,
                    parent_id: i.parentId
                })));
            }

            await supabase.from('board_members').insert({
                board_id: newBoardId,
                user_id: user.id,
                role: 'owner'
            });

        } catch (err: any) {
            console.error('[Duplicate] Failed to persist duplicated board:', err);
            get().loadUserData(true);
        }
    },

    moveBoardToWorkspace: async (boardId, workspaceId) => {
        if (!boardId || !workspaceId) return;
        set(state => ({
            boards: state.boards.map(b => b.id === boardId ? { ...b, workspaceId } : b)
        }));
        const { error } = await supabase.from('boards').update({ workspace_id: workspaceId }).eq('id', boardId);
        if (error) {
            console.error('[Move] Failed to move board:', error);
            get().loadUserData(true);
        }
    },

    toggleFavorite: async (boardId) => {
        const { boards } = get();
        const board = boards.find(b => b.id === boardId);
        if (!board) return;

        const newFavoriteStatus = !board.isFavorite;

        // Optimistic update
        set(state => ({
            boards: state.boards.map(b => 
                b.id === boardId ? { ...b, isFavorite: newFavoriteStatus } : b
            )
        }));

        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("User not authenticated");

            if (newFavoriteStatus) {
                const { error } = await supabase
                    .from('user_favorites')
                    .insert({ board_id: boardId, user_id: user.id });
                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from('user_favorites')
                    .delete()
                    .eq('board_id', boardId)
                    .eq('user_id', user.id);
                if (error) throw error;
            }
        } catch (err) {
            console.error('[Favorite] Failed to toggle favorite:', err);
            // Revert on error
            set(state => ({
                boards: state.boards.map(b => 
                    b.id === boardId ? { ...b, isFavorite: !newFavoriteStatus } : b
                )
            }));
        }
    },
});
