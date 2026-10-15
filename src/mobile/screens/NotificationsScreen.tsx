import { useMemo, useState } from 'react';
import { Bell, BellRing, CalendarClock, Check, FileText, MessageSquare, RefreshCw, ThumbsUp, UserPlus, X } from 'lucide-react';
import './screens.css';
import { useBoardStore } from '../../store/useBoardStore';
import type { Notification } from '../../types';
import { Card, EmptyState, SegmentedTabs, relativeTime } from '../ui';
import { openBoard, openItem, openWorkspace } from '../nav/navigation';

type Filter = 'all' | 'unread' | 'mentions';

/** The Notifications tab — the same list and filters as the desktop page, sized for a phone. */
export const NotificationsScreen = () => {
    const notifications = useBoardStore(state => state.notifications || []);
    const markAllNotificationsAsRead = useBoardStore(state => state.markAllNotificationsAsRead);
    const [filter, setFilter] = useState<Filter>('all');

    const unread = notifications.filter(n => !n.is_read).length;
    const shown = useMemo(() => notifications.filter(n => {
        if (filter === 'unread') return !n.is_read;
        if (filter === 'mentions') return n.type === 'mention' || n.type === 'assignment';
        return true;
    }), [notifications, filter]);

    return (
        <div className="m-screen" data-testid="m-notifications">
            <div className="m-scroll m-scroll--tabbar">
                <div className="m-tab-title" style={{ justifyContent: 'space-between' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        Notifications
                        {unread > 0 && (
                            <span style={{ fontSize: 14, fontWeight: 700, color: '#fff', background: 'hsl(var(--color-danger))', borderRadius: 999, padding: '2px 9px' }}>
                                {unread}
                            </span>
                        )}
                    </span>
                    {unread > 0 && (
                        <button type="button" className="m-text-btn" style={{ fontSize: 15 }} onClick={() => void markAllNotificationsAsRead()}>
                            Mark all read
                        </button>
                    )}
                </div>

                <div style={{ padding: '6px 16px 12px' }}>
                    <SegmentedTabs<Filter>
                        ariaLabel="Show"
                        value={filter}
                        onChange={setFilter}
                        options={[
                            { value: 'all', label: 'All' },
                            { value: 'unread', label: 'Unread' },
                            { value: 'mentions', label: 'Mentions' },
                        ]}
                    />
                </div>

                <div style={{ padding: '0 16px' }}>
                    <Card style={{ overflow: 'hidden' }}>
                        {shown.map(notification => <NotificationRow key={notification.id} notification={notification} />)}
                        {shown.length === 0 && (
                            <EmptyState icon={<BellRing size={34} style={{ opacity: 0.35 }} />} title="All caught up!">
                                {filter === 'all'
                                    ? 'When something needs you, it will show up here.'
                                    : filter === 'unread'
                                        ? "You've read all your notifications."
                                        : "You haven't been mentioned or assigned anything yet."}
                            </EmptyState>
                        )}
                    </Card>
                </div>
            </div>
        </div>
    );
};

const iconFor = (type: Notification['type']) => {
    switch (type) {
        case 'workspace_invite':
        case 'board_invite':
            return <UserPlus size={18} color="hsl(var(--m-accent))" />;
        case 'assignment':
            return <FileText size={18} color="hsl(var(--color-status-green-bg))" />;
        case 'mention':
            return <MessageSquare size={18} color="#f97316" />;
        case 'comment':
            return <MessageSquare size={18} color="hsl(var(--m-text-2))" />;
        case 'like':
            return <ThumbsUp size={18} color="#D4A000" />;
        case 'due_date_reminder':
            return <CalendarClock size={18} color="#e2445c" />;
        case 'status_update':
            return <RefreshCw size={18} color="hsl(var(--m-accent))" />;
        default:
            return <Bell size={18} color="hsl(var(--m-text-2))" />;
    }
};

/**
 * One notification. Does what the desktop NotificationItem does on a click —
 * marks it read and opens the board and item it is about — with the dismiss
 * button always visible (there is no hover on a phone) and a workspace
 * notification opening that workspace's own screen.
 */
const NotificationRow = ({ notification }: { notification: Notification }) => {
    const markNotificationAsRead = useBoardStore(state => state.markNotificationAsRead);
    const dismissNotification = useBoardStore(state => state.dismissNotification);
    const handleAcceptInvite = useBoardStore(state => state.handleAcceptInvite);
    const handleDeclineInvite = useBoardStore(state => state.handleDeclineInvite);
    const [busy, setBusy] = useState(false);

    const isInvite = notification.type === 'workspace_invite' || notification.type === 'board_invite';
    const pendingInvite = isInvite && (!notification.status || notification.status === 'pending');

    const open = () => {
        if (!notification.is_read) void markNotificationAsRead(notification.id);
        const boardId = notification.data?.board_id;
        if (boardId) {
            openBoard(boardId);
            // Board-scoped notifications carry the board id as their entity_id;
            // only a different id is an item (same rule as NotificationItem).
            if (notification.entity_id && notification.entity_id !== boardId) openItem(notification.entity_id);
        } else if (notification.data?.workspace_id) {
            openWorkspace(notification.data.workspace_id);
        }
    };

    const respond = async (accept: boolean) => {
        setBusy(true);
        try {
            if (accept) await handleAcceptInvite(notification);
            else await handleDeclineInvite(notification);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div
            className={`m-notif${notification.is_read ? '' : ' m-notif--unread'}`}
            role="button"
            tabIndex={0}
            onClick={open}
            onKeyDown={(e) => { if (e.key === 'Enter') open(); }}
        >
            <span className="m-notif__icon">{iconFor(notification.type)}</span>
            <div className="m-notif__body">
                <div className="m-notif__title">{notification.title || notification.content}</div>
                {notification.message && <div className="m-notif__message">{notification.message}</div>}
                {notification.type === 'mention' && notification.data?.updatePreview && (
                    <div className="m-notif__quote">“{notification.data.updatePreview}”</div>
                )}
                <div className="m-notif__time">{relativeTime(notification.created_at)}</div>

                {pendingInvite && (
                    <div className="m-notif__actions" onClick={(e) => e.stopPropagation()}>
                        <button
                            type="button"
                            disabled={busy}
                            onClick={() => void respond(true)}
                            style={{ background: 'hsl(var(--m-accent))', color: '#fff' }}
                        >
                            <Check size={15} /> Accept
                        </button>
                        <button
                            type="button"
                            disabled={busy}
                            onClick={() => void respond(false)}
                            style={{ background: 'hsl(var(--m-chip))', color: 'hsl(var(--m-text))' }}
                        >
                            <X size={15} /> Decline
                        </button>
                    </div>
                )}
                {isInvite && notification.status && notification.status !== 'pending' && (
                    <div className="m-notif__time" style={{ color: notification.status === 'accepted' ? 'hsl(var(--color-success))' : 'hsl(var(--color-danger))' }}>
                        {notification.status === 'accepted' ? 'Accepted' : 'Declined'}
                    </div>
                )}
            </div>
            {!notification.is_read && <span className="m-notif__dot" aria-label="Unread" />}
            <button
                type="button"
                className="m-notif__dismiss"
                aria-label="Dismiss notification"
                onClick={(e) => {
                    e.stopPropagation();
                    void dismissNotification(notification.id);
                }}
            >
                <X size={16} />
            </button>
        </div>
    );
};
