import type { StateCreator } from 'zustand';
import { supabase } from '../../lib/supabase';
// import { v4 as uuidv4 } from 'uuid';
import type { Notification } from '../../types';
import type { BoardState } from '../useBoardStore';

export interface MemberSlice {
    activeBoardMembers: any[];
    isLoadingMembers: boolean;
    sharedBoardIds: string[];

    // Member Actions
    inviteToBoard: (boardId: string, email: string, role: string) => Promise<void>;
    getBoardMembers: (boardId: string) => Promise<any[]>;
    updateMemberRole: (memberId: string, newRole: string, type: 'workspace' | 'board') => Promise<void>;
    removeMember: (memberId: string, type: 'workspace' | 'board') => Promise<void>;
    inviteAndAssignUser: (boardId: string, userId: string, role: string, itemId: string, columnId: string) => Promise<void>;
    searchUsers: (query: string) => Promise<any[]>;

    // Realtime & Logging
    logActivity: (actionType: string, targetType: string, targetId: string, metadata?: any) => Promise<void>;
    subscribeToRealtime: () => void;
    unsubscribeFromRealtime: () => void;
    realtimeSubscription: any;

    // Notifications
    notifications: Notification[];
    loadNotifications: () => Promise<void>;
    startNotificationSubscription: () => void; // New helper to init listener
    markNotificationAsRead: (id: string) => Promise<void>;
    markAllNotificationsAsRead: () => Promise<void>;
    dismissNotification: (id: string) => Promise<void>;
    handleAcceptInvite: (notification: Notification) => Promise<void>;
    handleDeclineInvite: (notification: Notification) => Promise<void>;
    createNotification: (userId: string, type: string, content: string, entityId?: string, extraData?: any) => Promise<void>;
}

export const createMemberSlice: StateCreator<
    BoardState,
    [],
    [],
    MemberSlice
> = (set, get) => ({
    activeBoardMembers: [],
    isLoadingMembers: false,
    sharedBoardIds: [],
    realtimeSubscription: null,
    notifications: [],

    getBoardMembers: async (boardId) => {
        const { data, error } = await supabase
            .from('board_members')
            .select('*, profiles(*)')
            .eq('board_id', boardId);
        if (error) throw error;
        return data || [];
    },

    inviteToBoard: async (boardId, email, role) => {
        const { data: boardData } = await supabase.from('boards').select('workspace_id, title').eq('id', boardId).single();
        const { data: foundUser } = await supabase.from('profiles').select('id, full_name').eq('email', email).single();
        if (foundUser) {
            // Send Invite Notification ONLY - Do not add member directly
            await get().createNotification(
                foundUser.id,
                'board_invite',
                `You have been invited to join board`,
                boardId,
                { role, boardName: boardData?.title || 'Board', workspaceId: boardData?.workspace_id }
            );
        } else {
            // Call Edge Function to send email invite and record pending
            const { error: fnError } = await supabase.functions.invoke('invite-user', {
                body: { 
                    email, 
                    boardId, 
                    workspaceId: boardData?.workspace_id,
                    redirectTo: 'https://saturdaycom.vercel.app/'
                }
            });
            
            if (fnError) {
                console.error('Edge Function Invite Error:', fnError);
                // Fallback to manual insert if function fails
                await supabase.from('pending_invites').insert({
                    email,
                    board_id: boardId,
                    workspace_id: boardData?.workspace_id,
                    role
                });
            }
        }
    },

    updateMemberRole: async (memberId, newRole, type) => {
        const table = type === 'workspace' ? 'workspace_members' : 'board_members';
        await supabase.from(table).update({ role: newRole }).eq('id', memberId);
        if (type === 'board' && get().activeBoardId) {
            set({ activeBoardMembers: await get().getBoardMembers(get().activeBoardId!) });
        }
    },
    removeMember: async (memberId, type) => {
        const table = type === 'workspace' ? 'workspace_members' : 'board_members';
        await supabase.from(table).delete().eq('id', memberId);
        if (type === 'board' && get().activeBoardId) {
            set({ activeBoardMembers: await get().getBoardMembers(get().activeBoardId!) });
        }
    },

    searchUsers: async (query) => {
        if (!query || query.length < 2) return [];
        const { data } = await supabase.from('profiles').select('*').ilike('email', `%${query}%`).limit(5);
        return data || [];
    },

    inviteAndAssignUser: async (boardId, userId, role, itemId, columnId) => {
        await supabase.from('board_members').insert({ board_id: boardId, user_id: userId, role });
        await get().updateItemValue(itemId, columnId, [userId]);
    },

    logActivity: async (actionType, targetType, targetId, metadata) => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            const { error } = await supabase.rpc('log_activity', {
                p_action_type: actionType,
                p_target_type: targetType,
                p_target_id: targetId,
                p_metadata: metadata || {}
            });
            if (error) console.error("Log failed", error);
        } catch (e) { console.error("Log failed", e); }
    },

    subscribeToRealtime: () => {
        const { realtimeSubscription } = get();
        if (realtimeSubscription) return;

        supabase.auth.getUser().then(({ data: { user } }) => {
            if (!user) return;

            const channel = supabase.channel('member-realtime')
                .on('postgres_changes', {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'notifications',
                    filter: `user_id=eq.${user.id}`
                }, (payload) => {
                    const newNotification = payload.new as Notification;
                    set(state => ({ notifications: [newNotification, ...state.notifications] }));
                })
                .subscribe();

            set({ realtimeSubscription: channel });
        });
    },
    unsubscribeFromRealtime: () => {
        const sub = get().realtimeSubscription;
        if (sub) supabase.removeChannel(sub);
        set({ realtimeSubscription: null });
    },

    // Notifications
    loadNotifications: async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data, error } = await supabase.from('notifications')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(50);

        if (!error && data) {
            // Client-side filter for accepted/declined to keep history clean if desired, 
            // or just show them. Let's filter out 'accepted' and 'declined' from the main list 
            // if we want them to disappear after action.
            const activeNotifications = data.filter((n: any) => {
                const status = n.data?.status;
                return status !== 'accepted' && status !== 'declined';
            });
            set({ notifications: activeNotifications });
        }
    },
    startNotificationSubscription: () => {
        get().subscribeToRealtime();
    },
    markNotificationAsRead: async (id) => {
        set(state => ({ notifications: state.notifications.map(n => n.id === id ? { ...n, is_read: true } : n) }));
        await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    },
    markAllNotificationsAsRead: async () => {
        set(state => ({ notifications: state.notifications.map(n => ({ ...n, is_read: true })) }));
        const { data: { user } } = await supabase.auth.getUser();
        if (user) await supabase.from('notifications').update({ is_read: true }).eq('user_id', user.id);
    },
    dismissNotification: async (id) => {
        set(state => ({ notifications: state.notifications.filter(n => n.id !== id) }));
        await supabase.from('notifications').delete().eq('id', id);
    },

    handleAcceptInvite: async (notification) => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { type, entity_id, data } = notification;
            const role = data?.role || 'member';

            if (type === 'board_invite' && entity_id) {
                const { count } = await supabase.from('board_members').select('*', { count: 'exact', head: true })
                    .eq('board_id', entity_id).eq('user_id', user.id);

                if (!count) {
                    await supabase.from('board_members').insert({
                        board_id: entity_id,
                        user_id: user.id,
                        role
                    });

                    // Add to workspace as board-guest to ensure visibility
                    let workspaceId = data?.workspaceId;
                    if (!workspaceId) {
                        const { data: boardData } = await supabase.from('boards').select('workspace_id').eq('id', entity_id).single();
                        workspaceId = boardData?.workspace_id;
                    }

                    if (workspaceId) {
                        const { count: wsCount } = await supabase.from('workspace_members')
                            .select('*', { count: 'exact', head: true })
                            .eq('workspace_id', workspaceId)
                            .eq('user_id', user.id);

                        if (!wsCount) {
                            await supabase.from('workspace_members').insert({
                                workspace_id: workspaceId,
                                user_id: user.id,
                                role: 'board-guest'
                            });
                        }
                    }
                }
            } else if (type === 'workspace_invite' && entity_id) {
                const { count } = await supabase.from('workspace_members').select('*', { count: 'exact', head: true })
                    .eq('workspace_id', entity_id).eq('user_id', user.id);

                if (!count) {
                    await supabase.from('workspace_members').insert({
                        workspace_id: entity_id,
                        user_id: user.id,
                        role
                    });
                }
            }

            // Update status in JSON data
            const newData = { ...data, status: 'accepted' };
            await supabase.from('notifications').update({ data: newData, is_read: true }).eq('id', notification.id);

            // Refresh
            get().loadNotifications();
            get().loadUserData(true);

        } catch (e) {
            console.error("Accept invite failed:", e);
        }
    },

    handleDeclineInvite: async (notification) => {
        try {
            const newData = { ...notification.data, status: 'declined' };
            await supabase.from('notifications').update({ data: newData, is_read: true }).eq('id', notification.id);
            get().loadNotifications();
        } catch (e) {
            console.error("Decline invite failed:", e);
        }
    },

    createNotification: async (userId, type, content, entityId, extraData) => {
        const notificationData = { ...extraData, status: 'pending' };
        await supabase.from('notifications').insert({
            user_id: userId,
            type,
            content,
            entity_id: entityId,
            data: notificationData,
            is_read: false
        });
    }
});
