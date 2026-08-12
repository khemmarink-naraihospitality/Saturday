import type { StateCreator } from 'zustand';
import { supabase } from '../../lib/supabase';
import { v4 as uuidv4 } from 'uuid';
import { arrayMove } from '@dnd-kit/sortable';
import type { Board, ColumnType, Column } from '../../types';
import type { BoardState } from '../useBoardStore';
import { getDefaultStatusOptions } from '../../lib/statusDefaults';

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
    loadBoardData: (boardId: string, _skipLinkedAutoLoad?: boolean) => Promise<void>;
    loadingBoardIds: Set<string>;

    // Import Actions
    importExcelBoard: (
        data: {
            title: string;
            description?: string;
            groups: { title: string; color: string; items: any[] }[];
            columns: { title: string; type: ColumnType; options?: any[] }[];
        }
    ) => Promise<void>;
}

const parseSqlJson = (val: any, fallback: any) => {
    if (typeof val === 'string') {
        try { return JSON.parse(val); } catch (e) { return fallback; }
    }
    return val ?? fallback;
};

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
    activePage: 'home',
    userBoardRoles: {},
    userWorkspaceRoles: {},
    sharedBoardIds: [],
    sharedWorkspaceIds: [],
    loadingBoardIds: new Set(),

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

        // Safety timeout: force-release loading screen after 15s to prevent infinite spinner
        const timeoutId = setTimeout(() => {
            if (get().isLoading) {
                console.warn('[Store] loadUserData timeout — releasing loading state');
                set({ isLoading: false, isInitializing: false, isSyncing: false });
            }
        }, 15000);

        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                set({ isLoading: false, isInitializing: false });
                return;
            }

            // None of these queries depend on each other's results, so fire them together
            // instead of awaiting one round-trip at a time.
            let [workspacesRes, { data: boards }, { data: sharedBoardsData }, { data: sharedWorkspacesData }, { data: userFavoritesData }, { data: existingProfile }]: [any, any, any, any, any, any] = await Promise.all([
                supabase.from('workspaces').select('id, title, order, owner_id, parent_id').order('order'),
                supabase.from('boards').select('*, is_archived, is_favorite').order('order'),
                supabase.from('board_members').select('board_id, role, last_viewed_at, settings').eq('user_id', user.id),
                supabase.from('workspace_members').select('workspace_id, role').eq('user_id', user.id),
                supabase.from('user_favorites').select('board_id').eq('user_id', user.id),
                supabase.from('profiles').select('id, system_role, is_approved, full_name, email, avatar_url').eq('id', user.id).single()
            ]);

            // parent_id (sub-workspace support) may not exist yet on every environment's
            // workspaces table — if selecting it errors (e.g. undefined column), retry
            // without it so a missing migration doesn't wipe out the entire app's data.
            if (workspacesRes.error) {
                console.warn('[loadUserData] workspaces.parent_id unavailable, retrying without it:', workspacesRes.error.message);
                workspacesRes = await supabase.from('workspaces').select('id, title, order, owner_id').order('order');
            }
            const workspaces: any[] | null = workspacesRes.data;

            // --- SELF HEALING: Fix 'Person' columns that are somehow 'text' type ---
            // Removed global sweep to save time, logic moved to loadBoardData if needed
            // ---------------------------------------------------------------------

            if (!workspaces || !boards) throw new Error('Failed to load core data');

            // Fetch profiles for workspace owners to display names (depends on workspaces, so stays sequential)
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

            // ENSURE PROFILE — fire and forget, nothing below reads its result
            supabase.from('profiles').upsert({
                id: user.id,
                email: user.email,
                full_name: user.user_metadata?.full_name || user.email?.split('@')[0],
                avatar_url: user.user_metadata?.avatar_url,
                system_role: existingProfile?.system_role || 'user'
            }, { onConflict: 'id' }).then(({ error }) => {
                if (error) console.error("Failed to ensure profile:", error);
            });

            // console.log('DEBUG: loadUserData sharedBoardsData:', sharedBoardsData);

            const lastViewedMap: Record<string, string> = {};
            const boardSettingsMap: Record<string, any> = {};
            if (sharedBoardsData) {
                sharedBoardsData.forEach((r: any) => {
                    if (r.board_id) {
                        if (r.last_viewed_at) lastViewedMap[r.board_id] = r.last_viewed_at;
                        if (r.settings) boardSettingsMap[r.board_id] = r.settings;
                    }
                });
            }

            const favoritedBoardIds = new Set(userFavoritesData?.map((f: any) => f.board_id) || []);


            const fullBoards: Board[] = boards.map((b: any) => {
                // Determine if we should preserve existing groups/columns/items from local state cache
                const existingBoard = get().boards.find(eb => eb.id === b.id);
                
                return {
                    id: b.id,
                    workspaceId: b.workspace_id,
                    title: b.title,
                    description: b.description,
                    is_archived: b.is_archived,
                    is_private: b.is_private,
                    isFavorite: favoritedBoardIds.has(b.id),
                    lastViewedAt: lastViewedMap[b.id] || undefined,
                    columns: existingBoard?.columns || [],
                    groups: existingBoard?.groups || [],
                    items: existingBoard?.items || [],
                    isDataLoaded: existingBoard?.isDataLoaded || false,
                    itemColumnTitle: 'Item',
                    itemColumnWidth: boardSettingsMap[b.id]?.itemColumnWidth || 350
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
                    ownerName: ownerProfilesMap[w.owner_id] || 'Unknown User',
                    parentId: w.parent_id
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
            clearTimeout(timeoutId);
            set({ isSyncing: false, isInitializing: false });
        }
    },

    setActiveBoard: async (id) => {
        set({ activeBoardId: id, activePage: 'board' });
        localStorage.setItem('lastActiveBoardId', id || '');

        if (id) {
            // Keep activeWorkspaceId in sync with whichever board is open, so actions that
            // target "the current workspace" (e.g. Import) land in the right place even when
            // the board was opened without first explicitly switching workspaces.
            const board = get().boards.find(b => b.id === id);
            if (board?.workspaceId && board.workspaceId !== get().activeWorkspaceId) {
                set({ activeWorkspaceId: board.workspaceId });
            }

            // FIRE AND FORGET: URL push removed here because App.tsx handles it with correct slugs
            // window.history.pushState(null, '', `/board/${id}`);

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

            // Trigger lazy load implementation
            get().loadBoardData(id);
        } else {
            set({ activeBoardMembers: [], isLoadingMembers: false });
        }
    },

    loadBoardData: async (boardId: string, _skipLinkedAutoLoad = false) => {
        const { boards, loadingBoardIds } = get();
        const board = boards.find(b => b.id === boardId);

        if (!board || loadingBoardIds.has(boardId)) return;

        const autoLoadLinked = () => {
            if (_skipLinkedAutoLoad) return;
            const current = get().boards.find(b => b.id === boardId);
            const ids = new Set((current?.groups || []).filter(g => g.linkedBoardId).map(g => g.linkedBoardId!));
            // Pass _skipLinkedAutoLoad=true to prevent the linked board from triggering another round
            ids.forEach(id => get().loadBoardData(id, true));
        };

        // Already loaded: silently refresh items only when this board has linked groups,
        // so that mirror items created by the DB trigger while the user was elsewhere
        // are picked up immediately without a full page reload.
        if (board.isDataLoaded) {
            const hasLinkedGroups = board.groups.some(g => g.linkedGroupId);
            if (!hasLinkedGroups) return;

            const { data: items } = await supabase
                .from('items')
                .select('id, title, board_id, group_id, values, updates, files, order, is_hidden, created_at, parent_id')
                .eq('board_id', boardId)
                .order('order');

            if (!items) return;

            set(state => {
                const boardIndex = state.boards.findIndex(b => b.id === boardId);
                if (boardIndex === -1) return state;

                const b = state.boards[boardIndex];
                const parsedItemsMap: Record<string, any[]> = {};
                const parsedItems = items.map(i => {
                    const p = {
                        id: i.id, title: i.title, groupId: i.group_id, boardId,
                        values: parseSqlJson(i.values, {}), isHidden: i.is_hidden,
                        updates: parseSqlJson(i.updates, []), files: parseSqlJson(i.files, []),
                        order: i.order, parentId: i.parent_id, createdAt: i.created_at
                    };
                    if (!parsedItemsMap[i.group_id]) parsedItemsMap[i.group_id] = [];
                    parsedItemsMap[i.group_id].push(p);
                    return p;
                });

                const newBoards = [...state.boards];
                newBoards[boardIndex] = {
                    ...b,
                    items: parsedItems,
                    groups: b.groups.map(g => ({
                        ...g,
                        items: (parsedItemsMap[g.id] || [])
                            .filter(i => !i.parentId)
                            .sort((a, bItem) => (a.order || 0) - (bItem.order || 0) || a.id.localeCompare(bItem.id))
                    }))
                };
                return { boards: newBoards };
            });
            autoLoadLinked();
            return;
        }

        set(state => ({ loadingBoardIds: new Set(state.loadingBoardIds).add(boardId) }));

        try {
            const [
                { data: groups },
                { data: columns },
                { data: items },
                { data: groupLinks }
            ] = await Promise.all([
                supabase.from('groups').select('id, title, color, order, board_id').eq('board_id', boardId).order('order'),
                supabase.from('columns').select('id, title, type, width, order, options, board_id, aggregation, number_format, currency_code').eq('board_id', boardId).order('order'),
                supabase.from('items').select('id, title, board_id, group_id, values, updates, files, order, is_hidden, created_at, parent_id').eq('board_id', boardId).order('order'),
                supabase.from('group_links').select('id, board_a_id, group_a_id, board_b_id, group_b_id').or(`board_a_id.eq.${boardId},board_b_id.eq.${boardId}`)
            ]);

            set(state => {
                const boardIndex = state.boards.findIndex(b => b.id === boardId);
                const nextLoading = new Set(state.loadingBoardIds);
                nextLoading.delete(boardId);

                if (boardIndex === -1) return { loadingBoardIds: nextLoading };

                const bGroups = groups || [];
                const bColumns = columns || [];
                const bItems = items || [];
                const bGroupLinks = groupLinks || [];

                const linkByGroupId = new Map<string, { linkedGroupId: string; linkedBoardId: string }>();
                bGroupLinks.forEach(l => {
                    const isAThisBoard = l.board_a_id === boardId;
                    const thisSideGroupId = isAThisBoard ? l.group_a_id : l.group_b_id;
                    const otherGroupId = isAThisBoard ? l.group_b_id : l.group_a_id;
                    const otherBoardId = isAThisBoard ? l.board_b_id : l.board_a_id;
                    linkByGroupId.set(thisSideGroupId, { linkedGroupId: otherGroupId, linkedBoardId: otherBoardId });
                });

                const parsedItemsMap: Record<string, any[]> = {};
                
                const parsedItems = bItems.map(i => {
                    const parsedItem = {
                        id: i.id,
                        title: i.title,
                        groupId: i.group_id,
                        boardId,
                        values: parseSqlJson(i.values, {}),
                        isHidden: i.is_hidden,
                        updates: parseSqlJson(i.updates, []),
                        files: parseSqlJson(i.files, []),
                        order: i.order,
                        parentId: i.parent_id,
                        createdAt: i.created_at
                    };

                    if (!parsedItemsMap[i.group_id]) {
                        parsedItemsMap[i.group_id] = [];
                    }
                    parsedItemsMap[i.group_id].push(parsedItem);

                    return parsedItem;
                });

                const updatedBoard: Board = {
                    ...state.boards[boardIndex],
                    isDataLoaded: true,
                    itemColumnTitle: state.boards[boardIndex].itemColumnTitle || 'Item',
                    itemColumnWidth: state.boards[boardIndex].itemColumnWidth || 350,
                    columns: bColumns.map(c => ({
                        id: c.id,
                        title: c.title,
                        type: c.type as ColumnType,
                        width: c.width,
                        order: c.order,
                        options: typeof c.options === 'string' ? JSON.parse(c.options) : (c.options || []),
                        aggregation: c.aggregation,
                        numberFormat: c.number_format,
                        currencyCode: c.currency_code
                    })),
                    groups: bGroups.map(g => {
                        const groupItems = (parsedItemsMap[g.id] || [])
                            .filter(i => !i.parentId) // Only top-level items in the main group list
                            .slice()
                            .sort((a, b) => (a.order || 0) - (b.order || 0) || a.id.localeCompare(b.id));

                        return {
                            id: g.id,
                            title: g.title,
                            color: g.color,
                            order: g.order,
                            items: groupItems,
                            linkedGroupId: linkByGroupId.get(g.id)?.linkedGroupId,
                            linkedBoardId: linkByGroupId.get(g.id)?.linkedBoardId
                        };
                    }),
                    items: parsedItems
                };

                const newBoards = [...state.boards];
                newBoards[boardIndex] = updatedBoard;
                return {
                    boards: newBoards,
                    loadingBoardIds: nextLoading
                };
            });

            // After full load, auto-load each linked board in the background so that
            // realtime events from the DB trigger are wired up for both sides immediately.
            autoLoadLinked();
        } catch (err) {
            console.error('Failed to load board data', err);
            set(state => {
                const nextLoading = new Set(state.loadingBoardIds);
                nextLoading.delete(boardId);
                
                const boardIndex = state.boards.findIndex(b => b.id === boardId);
                if (boardIndex === -1) return { loadingBoardIds: nextLoading };
                
                const newBoards = [...state.boards];
                // Force marked as loaded to release the spinner, even on error
                newBoards[boardIndex] = { ...newBoards[boardIndex], isDataLoaded: true };
                
                return { 
                    boards: newBoards,
                    loadingBoardIds: nextLoading,
                    error: 'Failed to load board data. Please try again.'
                };
            });
        }
    },

    addBoard: async (title, _subWorkspaceId) => {
        const { activeWorkspaceId, boards } = get();
        if (!activeWorkspaceId) return;

        const boardId = uuidv4();
        const defaultGroups = [
            { id: uuidv4(), title: 'Group Title', color: '#579bfc', order: 0 }
        ];
        const statusOptions = await getDefaultStatusOptions();
        const defaultColumns: Column[] = [
            {
                id: uuidv4(), title: 'Status', type: 'status' as ColumnType, order: 0, width: 140, options: statusOptions
            },
            { id: uuidv4(), title: 'Files', type: 'files' as ColumnType, order: 1, width: 140 },
            { id: uuidv4(), title: 'Person', type: 'people' as ColumnType, order: 2, width: 140 },
            { id: uuidv4(), title: 'Timeline', type: 'timeline' as ColumnType, order: 3, width: 160 },
            { id: uuidv4(), title: 'Date', type: 'date' as ColumnType, order: 4, width: 140 },
            { id: uuidv4(), title: 'Text', type: 'text' as ColumnType, order: 5, width: 200 },
        ];

        const newBoard: Board = {
            id: boardId,
            workspaceId: activeWorkspaceId,
            title,
            columns: defaultColumns.map(c => ({ ...c, type: c.type as ColumnType, options: c.options })),
            groups: defaultGroups.map(g => ({ ...g, items: [] })),
            items: [],
            itemColumnTitle: 'Item',
            itemColumnWidth: 350,
            isDataLoaded: true
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

            const { data: profile } = await supabase.from('profiles').select('id, full_name, email, avatar_url').eq('id', user.id).single();
            set(state => ({
                activeBoardMembers: [{
                    id: uuidv4(),
                    user_id: user.id,
                    role: 'owner',
                    profiles: profile || { email: user.email, id: user.id, full_name: user.user_metadata?.full_name }
                }],
                userBoardRoles: { ...state.userBoardRoles, [boardId]: 'owner' }
            }));
        }
        
        // Removed loadUserData(true) to prevent race condition where DB replicas 
        // haven't resolved the insert yet, which would momentarily wipe the optimistic columns.
        // Realtime channels and optimistic state will handle the rest.
    },

    deleteBoard: async (id) => {
        const board = get().boards.find(b => b.id === id);
        set(state => ({
            boards: state.boards.map(b => b.id === id ? { ...b, is_archived: true } : b),
            activeBoardId: state.activeBoardId === id ? null : state.activeBoardId,
            ...(board?.workspaceId ? { activeWorkspaceId: board.workspaceId } : {})
        }));
        // Land on the deleted board's workspace dashboard instead of leaving the user on a
        // now-gone board page.
        if (board?.workspaceId) {
            get().navigateTo('dashboard');
        }
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
            items: newItems,
            itemColumnTitle: sourceBoard.itemColumnTitle || 'Item',
            itemColumnWidth: sourceBoard.itemColumnWidth || 350
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

    importExcelBoard: async (data) => {
        const { activeWorkspaceId, boards } = get();
        if (!activeWorkspaceId) throw new Error('No active workspace');

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        // Collapses whitespace (incl. non-breaking spaces) so a status label survives
        // matching even if the source Excel cell has stray/odd whitespace around it.
        const normalizeLabel = (s: any): string =>
            String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

        // 1. Create a new board
        const boardId = uuidv4();
        const { error: boardErr } = await supabase.from('boards').insert({
            id: boardId,
            workspace_id: activeWorkspaceId,
            title: data.title,
            description: data.description || null,
            order: boards.length
        });
        if (boardErr) throw new Error(`Board creation failed: ${boardErr.message}`);

        // 2. Add current user as owner
        await supabase.from('board_members').insert({ board_id: boardId, user_id: user.id, role: 'owner' });

        // 3. Insert columns
        const dbColumns = data.columns.map((c, idx) => ({
            id: uuidv4(),
            board_id: boardId,
            title: c.title,
            type: c.type,
            order: idx,
            width: c.type === 'status' ? 140 : 200,
            options: c.options || []
        }));
        const { error: cErr } = await supabase.from('columns').insert(dbColumns);
        if (cErr) throw new Error(`Columns creation failed: ${cErr.message}`);

        // 4. Prepare groups and items
        const dbGroups: any[] = [];
        const dbItems: any[] = [];

        data.groups.forEach((group, gIdx) => {
            const groupId = uuidv4();
            dbGroups.push({
                id: groupId,
                board_id: boardId,
                title: group.title,
                color: group.color,
                order: gIdx
            });

            group.items.forEach((item, iIdx) => {
                const itemId = uuidv4();
                const itemValues: Record<string, any> = {};
                Object.entries(item.values).forEach(([colTitle, val]) => {
                    const col = dbColumns.find(c => c.title === colTitle);
                    if (col) {
                        if (col.type === 'status' && col.options) {
                            const matchedOption = (col.options as any[]).find(opt =>
                                normalizeLabel(opt.label) === normalizeLabel(val)
                            );
                            itemValues[col.id] = matchedOption ? matchedOption.id : 'c4c4c4c4-c4c4-c4c4-c4c4-c4c4c4c4c4c4';
                        } else {
                            itemValues[col.id] = val;
                        }
                    }
                });

                dbItems.push({
                    id: itemId,
                    board_id: boardId,
                    group_id: groupId,
                    title: item.title,
                    values: itemValues,
                    updates: item.updates || [],
                    order: iIdx,
                    parent_id: null
                });

                if (item.subitems && Array.isArray(item.subitems)) {
                    item.subitems.forEach((sub: any, sIdx: number) => {
                        const subValues: Record<string, any> = {};
                        Object.entries(sub.values || {}).forEach(([colTitle, val]) => {
                            const col = dbColumns.find(c => c.title === colTitle);
                            if (col) {
                                if (col.type === 'status' && col.options) {
                                    const hybridColumns = ['SOR Complete', 'RFI Sent'];
                                    if (hybridColumns.includes(col.title)) {
                                        subValues[col.id] = val || null;
                                    } else {
                                        const matchedOption = (col.options as any[]).find(opt =>
                                            normalizeLabel(opt.label) === normalizeLabel(val)
                                        );
                                        subValues[col.id] = matchedOption ? matchedOption.id : 'c4c4c4c4-c4c4-c4c4-c4c4-c4c4c4c4c4c4';
                                    }
                                } else {
                                    subValues[col.id] = val;
                                }
                            }
                        });
                        dbItems.push({
                            id: uuidv4(),
                            board_id: boardId,
                            group_id: groupId,
                            title: sub.title,
                            values: subValues,
                            order: (iIdx * 100) + sIdx + 1,
                            parent_id: itemId
                        });
                    });
                }
            });
        });

        // 5. Insert groups then items
        if (dbGroups.length > 0) {
            const { error: gErr } = await supabase.from('groups').insert(dbGroups);
            if (gErr) throw new Error(`Groups creation failed: ${gErr.message}`);
        }
        if (dbItems.length > 0) {
            const { error: iErr } = await supabase.from('items').insert(dbItems);
            if (iErr) throw new Error(`Items creation failed: ${iErr.message}`);
        }

        // 6. Reload board list and navigate to the new board
        await get().loadUserData(true);
        await get().setActiveBoard(boardId);
    }
});
