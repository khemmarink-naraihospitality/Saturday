import type { StateCreator } from 'zustand';
import { supabase } from '../../lib/supabase';
import { v4 as uuidv4 } from 'uuid';
import type { Workspace, Board, ColumnType, Item } from '../../types';
import type { BoardState } from '../useBoardStore';

export interface WorkspaceSlice {
    workspaces: Workspace[];
    activeWorkspaceId: string;
    sharedWorkspaceIds: string[];

    // Actions
    addWorkspace: (title: string) => Promise<void>;
    deleteWorkspace: (id: string) => Promise<void>;
    updateWorkspace: (id: string, title: string) => Promise<void>;
    setActiveWorkspace: (id: string) => void;
    duplicateWorkspace: (id: string) => Promise<void>;
    renameWorkspace: (id: string, newTitle: string) => Promise<void>;
    inviteToWorkspace: (workspaceId: string, email: string, role: string) => Promise<void>;
    getWorkspaceMembers: (workspaceId: string) => Promise<any[]>;
    reorderWorkspaces: (sourceId: string, destinationId: string) => Promise<void>;
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

            const defaultColumns = [
                { id: uuidv4(), title: 'Status', type: 'status' as ColumnType, order: 0, width: 140, options: [{ id: uuidv4(), label: 'Done', color: '#00c875' }, { id: uuidv4(), label: 'Working', color: '#fdab3d' }, { id: uuidv4(), label: 'Stuck', color: '#e2445c' }] },
                { id: uuidv4(), title: 'Date', type: 'date' as ColumnType, order: 1, width: 140 },
                { id: uuidv4(), title: 'Priority', type: 'status' as ColumnType, order: 2, width: 140, options: [{ id: uuidv4(), label: 'High', color: '#e2445c' }, { id: uuidv4(), label: 'Medium', color: '#fdab3d' }, { id: uuidv4(), label: 'Low', color: '#579bfc' }] },
            ];

            const defaultGroups = [
                { id: groupId, title: 'Getting Started', color: '#579bfc', order: 0 }
            ];

            const statusCol = defaultColumns[0];
            const priorityCol = defaultColumns[2];
            const defaultValues = {
                [statusCol.id]: statusCol.options?.[1].id,
                [priorityCol.id]: priorityCol.options?.[1].id,
                [defaultColumns[1].id]: new Date().toISOString().split('T')[0]
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
                items: [newItem]
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

            get().loadUserData(true);
        } catch (err) {
            console.error('[AddWorkspace] Full Error context:', err);
            // Re-load to undo optimistic state if needed
            get().loadUserData(true);
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
                // Send Invite Notification ONLY
                await get().createNotification(
                    foundUser.id,
                    'workspace_invite',
                    `You have been invited to join workspace`,
                    workspaceId,
                    { role, workspaceName: 'Workspace' }
                );
            } else {
                // Call Edge Function to send email invite and record pending
                const { error: fnError } = await supabase.functions.invoke('invite-user', {
                    body: { 
                        email, 
                        workspaceId,
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
        return data || [];
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
            await Promise.all(
                updatedWorkspaces.map(w => 
                    supabase.from('workspaces').update({ order: w.order }).eq('id', w.id)
                )
            );
        } catch (error) {
            console.error('[ReorderWorkspaces] Failed to save new order:', error);
            get().loadUserData(true);
        }
    }
});
