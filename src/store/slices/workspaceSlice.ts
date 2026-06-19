import type { StateCreator } from 'zustand';
import { supabase } from '../../lib/supabase';
import { v4 as uuidv4 } from 'uuid';
import type { Workspace, Board, ColumnType, Column, Item } from '../../types';
import type { BoardState } from '../useBoardStore';

export interface WorkspaceSlice {
    workspaces: Workspace[];
    activeWorkspaceId: string;
    sharedWorkspaceIds: string[];

    // Actions
    addWorkspace: (title: string) => Promise<void>;
    addSubWorkspace: (parentId: string, title: string) => Promise<void>;
    deleteWorkspace: (id: string) => Promise<void>;
    updateWorkspace: (id: string, title: string) => Promise<void>;
    setActiveWorkspace: (id: string) => void;
    duplicateWorkspace: (id: string) => Promise<void>;
    renameWorkspace: (id: string, newTitle: string) => Promise<void>;
    inviteToWorkspace: (workspaceId: string, email: string, role: string) => Promise<void>;
    getWorkspaceMembers: (workspaceId: string) => Promise<any[]>;
    reorderWorkspaces: (sourceId: string, destinationId: string) => Promise<void>;
    transferWorkspaceOwnership: (workspaceId: string, newOwnerUserId: string) => Promise<void>;
}

export const createWorkspaceSlice: StateCreator<
    BoardState,
    [],
    [],
    WorkspaceSlice
> = (set, get) => ({
    workspaces: [],
    activeWorkspaceId: '',
    sharedWorkspaceIds: [],

    setActiveWorkspace: (id) => {
        set({ activeWorkspaceId: id });
        localStorage.setItem('lastActiveWorkspaceId', id);
    },

    addWorkspace: async (title) => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                console.error('[AddWorkspace] No authenticated user found');
                return;
            }
            
            const newWsId = uuidv4();
            const { workspaces } = get();
            const order = workspaces.length;

            const newWorkspace: Workspace = { id: newWsId, title, order, owner_id: user.id };
            
            // Optimistic update
            set(state => ({
                workspaces: [...state.workspaces, newWorkspace],
                activeWorkspaceId: newWsId
            }));

            // 1. Create Workspace
            const { error: wsError } = await supabase.from('workspaces').insert({ id: newWsId, title, owner_id: user.id, order });
            if (wsError) {
                console.error('[AddWorkspace] Failed to create workspace row:', wsError);
                throw wsError;
            }

            // Create Default Template for new Workspace
            const boardId = uuidv4();
            const groupId = uuidv4();
            const itemId = uuidv4();

            const defaultColumns: Column[] = [
                {
                    id: uuidv4(), title: 'Status', type: 'status' as ColumnType, order: 0, width: 140, options: [
                        { id: 'c4c4c4c4-c4c4-c4c4-c4c4-c4c4c4c4c4c4', label: 'Default', color: '#c4c4c4' },
                        { id: '00c87500-c875-c875-c875-00c87500c875', label: 'Done', color: '#00c875' },
                        { id: 'e2445c00-445c-445c-445c-e2445c00e244', label: 'Stuck', color: '#e2445c' },
                        { id: 'fdab3d00-ab3d-ab3d-ab3d-fdab3d00fdab', label: 'Working on it', color: '#fdab3d' }
                    ]
                },
                { id: uuidv4(), title: 'Files', type: 'files' as ColumnType, order: 1, width: 140 },
                { id: uuidv4(), title: 'Person', type: 'people' as ColumnType, order: 2, width: 140 },
                { id: uuidv4(), title: 'Timeline', type: 'timeline' as ColumnType, order: 3, width: 160 },
                { id: uuidv4(), title: 'Date', type: 'date' as ColumnType, order: 4, width: 140 },
                { id: uuidv4(), title: 'Text', type: 'text' as ColumnType, order: 5, width: 200 },
            ];

            const defaultGroups = [
                { id: groupId, title: 'Getting Started', color: '#579bfc', order: 0 }
            ];

            const statusCol = defaultColumns[0];
            const dateCol = defaultColumns[4];
            const defaultValues = {
                [statusCol.id]: statusCol.options?.[1].id, // 'Done'
                [dateCol.id]: new Date().toISOString().split('T')[0]
            };

            const newItem: Item = {
                id: itemId,
                title: 'My First Task',
                boardId: boardId,
                groupId: groupId,
                values: defaultValues,
                order: 0,
                updates: []
            };

            const newBoard: Board = {
                id: boardId,
                workspaceId: newWsId,
                title: 'Starting Board',
                columns: defaultColumns,
                groups: defaultGroups.map(g => ({ ...g, items: [newItem] })),
                items: [newItem],
                itemColumnTitle: 'Item',
                itemColumnWidth: 350,
                isDataLoaded: true
            };

            set(state => ({
                boards: [...state.boards, newBoard],
                activeBoardId: boardId
            }));

            // 2. Create Board
            const { error: brdError } = await supabase.from('boards').insert({ id: boardId, workspace_id: newWsId, title: 'Starting Board', order: 0 });
            if (brdError) {
                console.error('[AddWorkspace] Failed to create default board:', brdError);
                throw brdError;
            }

            // 3. Create Groups
            const { error: grpError } = await supabase.from('groups').insert(defaultGroups.map(g => ({ id: g.id, board_id: boardId, title: g.title, color: g.color, order: g.order })));
            if (grpError) console.error('[AddWorkspace] Group insertion error (non-fatal for UI):', grpError);

            // 4. Create Columns
            const { error: colError } = await supabase.from('columns').insert(defaultColumns.map(c => ({ id: c.id, board_id: boardId, title: c.title, type: c.type, order: c.order, width: c.width, options: c.options || [] })));
            if (colError) console.error('[AddWorkspace] Column insertion error (non-fatal for UI):', colError);

            // 5. Create Item
            const { error: itemError } = await supabase.from('items').insert({
                id: itemId,
                board_id: boardId,
                group_id: groupId,
                title: 'My First Task',
                values: defaultValues,
                order: 0
            });
            if (itemError) console.error('[AddWorkspace] Item insertion error (non-fatal for UI):', itemError);

            // 6. Create Board Member
            const { error: memError } = await supabase.from('board_members').insert({ board_id: boardId, user_id: user.id, role: 'owner' });
            if (memError) console.error('[AddWorkspace] Board member creation error:', memError);

            set(state => ({
                userWorkspaceRoles: { ...state.userWorkspaceRoles, [newWsId]: 'owner' },
                userBoardRoles: { ...state.userBoardRoles, [boardId]: 'owner' }
            }));
            
            // Removed loadUserData(true) to avoid UI flicker/race conditions with DB replication
        } catch (err) {
            console.error('[AddWorkspace] Full Error context:', err);
            // Re-load to undo optimistic state if needed
            await get().loadUserData(true);
            throw err;
        }
    },

    addSubWorkspace: async (parentId, title) => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                console.error('[AddSubWorkspace] No authenticated user found');
                return;
            }
            
            const newWsId = uuidv4();
            const { workspaces } = get();
            const order = workspaces.filter(w => w.parentId === parentId).length;

            const newWorkspace: Workspace = { id: newWsId, title, order, owner_id: user.id, parentId };
            
            // Optimistic update
            set(state => ({
                workspaces: [...state.workspaces, newWorkspace],
                activeWorkspaceId: newWsId
            }));

            // 1. Create Workspace
            const { error: wsError } = await supabase.from('workspaces').insert({ id: newWsId, title, owner_id: user.id, order, parent_id: parentId });
            if (wsError) {
                console.error('[AddSubWorkspace] Failed to create workspace row:', wsError);
                throw wsError;
            }

            // Create Default Template for new Workspace
            const boardId = uuidv4();
            const groupId = uuidv4();
            const itemId = uuidv4();

            const defaultColumns: Column[] = [
                {
                    id: uuidv4(), title: 'Status', type: 'status' as ColumnType, order: 0, width: 140, options: [
                        { id: 'c4c4c4c4-c4c4-c4c4-c4c4-c4c4c4c4c4c4', label: 'Default', color: '#c4c4c4' },
                        { id: '00c87500-c875-c875-c875-00c87500c875', label: 'Done', color: '#00c875' },
                        { id: 'e2445c00-445c-445c-445c-e2445c00e244', label: 'Stuck', color: '#e2445c' },
                        { id: 'fdab3d00-ab3d-ab3d-ab3d-fdab3d00fdab', label: 'Working on it', color: '#fdab3d' }
                    ]
                },
                { id: uuidv4(), title: 'Files', type: 'files' as ColumnType, order: 1, width: 140 },
                { id: uuidv4(), title: 'Person', type: 'people' as ColumnType, order: 2, width: 140 },
                { id: uuidv4(), title: 'Timeline', type: 'timeline' as ColumnType, order: 3, width: 160 },
                { id: uuidv4(), title: 'Date', type: 'date' as ColumnType, order: 4, width: 140 },
                { id: uuidv4(), title: 'Text', type: 'text' as ColumnType, order: 5, width: 200 },
            ];

            const defaultGroups = [
                { id: groupId, title: 'Getting Started', color: '#579bfc', order: 0 }
            ];

            const statusCol = defaultColumns[0];
            const dateCol = defaultColumns[4];
            const defaultValues = {
                [statusCol.id]: statusCol.options?.[1].id, // 'Done'
                [dateCol.id]: new Date().toISOString().split('T')[0]
            };

            const newItem: Item = {
                id: itemId,
                title: 'My First Task',
                boardId: boardId,
                groupId: groupId,
                values: defaultValues,
                order: 0,
                updates: []
            };

            const newBoard: Board = {
                id: boardId,
                workspaceId: newWsId,
                title: 'Starting Board',
                columns: defaultColumns,
                groups: defaultGroups.map(g => ({ ...g, items: [newItem] })),
                items: [newItem],
                itemColumnTitle: 'Item',
                itemColumnWidth: 350,
                isDataLoaded: true
            };

            set(state => ({
                boards: [...state.boards, newBoard],
                activeBoardId: boardId
            }));

            // 2. Create Board
            const { error: brdError } = await supabase.from('boards').insert({ id: boardId, workspace_id: newWsId, title: 'Starting Board', order: 0 });
            if (brdError) {
                console.error('[AddSubWorkspace] Failed to create default board:', brdError);
                throw brdError;
            }

            // 3. Create Groups
            const { error: grpError } = await supabase.from('groups').insert(defaultGroups.map(g => ({ id: g.id, board_id: boardId, title: g.title, color: g.color, order: g.order })));
            if (grpError) console.error('[AddSubWorkspace] Group insertion error (non-fatal for UI):', grpError);

            // 4. Create Columns
            const { error: colError } = await supabase.from('columns').insert(defaultColumns.map(c => ({ id: c.id, board_id: boardId, title: c.title, type: c.type, order: c.order, width: c.width, options: c.options || [] })));
            if (colError) console.error('[AddSubWorkspace] Column insertion error (non-fatal for UI):', colError);

            // 5. Create Item
            const { error: itemError } = await supabase.from('items').insert({
                id: itemId,
                board_id: boardId,
                group_id: groupId,
                title: 'My First Task',
                values: defaultValues,
                order: 0
            });
            if (itemError) console.error('[AddSubWorkspace] Item insertion error (non-fatal for UI):', itemError);

            // 6. Create Board Member
            const { error: memError } = await supabase.from('board_members').insert({ board_id: boardId, user_id: user.id, role: 'owner' });
            if (memError) console.error('[AddSubWorkspace] Board member creation error:', memError);

            set(state => ({
                userWorkspaceRoles: { ...state.userWorkspaceRoles, [newWsId]: 'owner' },
                userBoardRoles: { ...state.userBoardRoles, [boardId]: 'owner' }
            }));
            
        } catch (err) {
            console.error('[AddSubWorkspace] Full Error context:', err);
            await get().loadUserData(true);
            throw err;
        }
    },

    deleteWorkspace: async (id) => {
        set(state => ({
            workspaces: state.workspaces.filter(w => w.id !== id),
            boards: state.boards.filter(b => b.workspaceId !== id)
        }));
        await supabase.from('workspaces').delete().eq('id', id);
    },

    updateWorkspace: async (id, title) => {
        set(state => ({
            workspaces: state.workspaces.map(w => w.id === id ? { ...w, title } : w)
        }));
        await supabase.from('workspaces').update({ title }).eq('id', id);
    },

    renameWorkspace: async (id, newTitle) => {
        set(state => ({ workspaces: state.workspaces.map(w => w.id === id ? { ...w, title: newTitle } : w) }));
        await supabase.from('workspaces').update({ title: newTitle }).eq('id', id);
    },

    duplicateWorkspace: async (id) => {
        const { workspaces, boards } = get();
        const ws = workspaces.find(w => w.id === id);
        if (!ws) return;

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const newWsId = uuidv4();
        const newTitle = `${ws.title} (Copy)`;
        const newOrder = workspaces.length;

        const newWorkspace: Workspace = {
            id: newWsId,
            title: newTitle,
            owner_id: user.id,
            order: newOrder
        };

        set(state => ({
            workspaces: [...state.workspaces, newWorkspace]
        }));

        const { error } = await supabase.from('workspaces').insert({
            id: newWsId,
            title: newTitle,
            owner_id: user.id,
            order: newOrder
        });

        if (error) {
            alert(`Failed to duplicate workspace: ${error.message}`);
            get().loadUserData(true);
            return;
        }

        const wsBoards = boards.filter(b => b.workspaceId === id);
        for (const board of wsBoards) {
            await get().duplicateBoardToWorkspace(board.id, newWsId);
        }
    },

    inviteToWorkspace: async (workspaceId, email, role) => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("Not authenticated");

            const { data: foundUser } = await supabase.from('profiles').select('id, full_name').eq('email', email).single();

            if (foundUser) {
                // Automatically add the existing user to workspace_members
                await supabase.from('workspace_members').insert({
                    workspace_id: workspaceId,
                    user_id: foundUser.id,
                    role
                });

                const { workspaces } = get();
                const ws = workspaces.find(w => w.id === workspaceId);
                const workspaceName = ws?.title || 'NHG Saturday';

                // Send email notification for existing user added
                await supabase.functions.invoke('invite-user', {
                    body: { 
                        email, 
                        workspaceId,
                        workspaceName,
                        redirectTo: 'https://saturdaycom.vercel.app/'
                    }
                });

                // Send Access Granted Notification (No need to accept)
                await get().createNotification(
                    foundUser.id,
                    'access_granted',
                    `You have been added to workspace`,
                    workspaceId,
                    { role, workspaceName }
                );
            } else {
                const { workspaces } = get();
                const ws = workspaces.find(w => w.id === workspaceId);
                const workspaceName = ws?.title || 'NHG Saturday';

                // Call Edge Function to send email invite and record pending
                const { data: responseData, error: fnError } = await supabase.functions.invoke('invite-user', {
                    body: { 
                        email, 
                        workspaceId,
                        workspaceName,
                        redirectTo: 'https://saturdaycom.vercel.app/'
                    }
                });

                if (fnError) {
                    console.error('Edge Function Invite Error:', fnError);
                    // Fallback to manual insert if function fails
                    await supabase.from('pending_invites').insert({
                        email,
                        workspace_id: workspaceId,
                        role,
                        invited_by: user.id
                    });
                } else if (responseData?.userId) {
                    // Automatically add the new user to workspace_members since they are a brand new user
                    await supabase.from('workspace_members').insert({
                        workspace_id: workspaceId,
                        user_id: responseData.userId,
                        role
                    });
                }
            }

        } catch (e) {
            console.error("Invite failed", e);
            throw e;
        }
    },

    getWorkspaceMembers: async (workspaceId) => {
        const { data, error } = await supabase
            .from('workspace_members')
            .select('*, profiles(*)')
            .eq('workspace_id', workspaceId);

        if (error) throw error;
        const members = data || [];

        // Ownership is tracked via workspaces.owner_id and doesn't always have a matching
        // workspace_members row (e.g. workspaces created before that linkage existed, or a
        // transfer target who was never separately invited) — synthesize one so the owner
        // is never silently missing from the members list.
        const ownerId = get().workspaces.find(w => w.id === workspaceId)?.owner_id;
        if (ownerId && !members.some((m: any) => m.user_id === ownerId)) {
            const { data: ownerProfile } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', ownerId)
                .single();
            if (ownerProfile) {
                members.unshift({
                    id: `owner-${ownerId}`,
                    user_id: ownerId,
                    workspace_id: workspaceId,
                    role: 'owner',
                    profiles: ownerProfile
                });
            }
        }

        return members;
    },

    transferWorkspaceOwnership: async (workspaceId, newOwnerUserId) => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        const previousOwnerId = user.id;

        // Optimistic update so the UI reflects the new owner immediately
        set(state => ({
            workspaces: state.workspaces.map(w => w.id === workspaceId ? { ...w, owner_id: newOwnerUserId } : w)
        }));

        try {
            // 1. The workspace's owner_id is the single source of truth for "who is owner"
            const { error: wsError } = await supabase
                .from('workspaces')
                .update({ owner_id: newOwnerUserId })
                .eq('id', workspaceId);
            if (wsError) throw wsError;

            // 2. Demote the previous owner's membership row to member, so it displays
            // correctly once they no longer match the workspace's owner_id
            const { error: demoteError } = await supabase
                .from('workspace_members')
                .update({ role: 'member' })
                .eq('workspace_id', workspaceId)
                .eq('user_id', previousOwnerId);
            if (demoteError) console.error('[TransferOwnership] Failed to demote previous owner:', demoteError);

            // 3. Keep the new owner's membership role field consistent (display logic
            // already overrides via owner_id match, but keep the stored value accurate)
            const { error: promoteError } = await supabase
                .from('workspace_members')
                .update({ role: 'owner' })
                .eq('workspace_id', workspaceId)
                .eq('user_id', newOwnerUserId);
            if (promoteError) console.error('[TransferOwnership] Failed to update new owner role field:', promoteError);
        } catch (err) {
            console.error('[TransferOwnership] Failed, reverting:', err);
            await get().loadUserData(true);
            throw err;
        }
    },

    reorderWorkspaces: async (sourceId, destinationId) => {
        const { workspaces } = get();
        const sourceIndex = workspaces.findIndex(w => w.id === sourceId);
        const destIndex = workspaces.findIndex(w => w.id === destinationId);
        
        if (sourceIndex === -1 || destIndex === -1 || sourceIndex === destIndex) return;

        const newWorkspaces = [...workspaces];
        const [moved] = newWorkspaces.splice(sourceIndex, 1);
        newWorkspaces.splice(destIndex, 0, moved);

        const updatedWorkspaces = newWorkspaces.map((w, index) => ({ ...w, order: index }));
        set({ workspaces: updatedWorkspaces });

        try {
            const workspaceIds = updatedWorkspaces.map(w => w.id);
            await supabase.rpc('reorder_workspaces', { _workspace_ids: workspaceIds });
        } catch (error) {
            console.error('[ReorderWorkspaces] Failed to save new order:', error);
            get().loadUserData(true);
        }
    }
});
