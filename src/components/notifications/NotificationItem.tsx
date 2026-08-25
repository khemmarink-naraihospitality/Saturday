
import { formatDistanceToNow } from 'date-fns';
import { useBoardStore } from '../../store/useBoardStore';
import type { Notification } from '../../types';
import { Check, X, Bell, UserPlus, FileText, MessageSquare, ThumbsUp, CalendarClock, RefreshCw } from 'lucide-react';
import { useState } from 'react';


interface NotificationItemProps {
    notification: Notification;
    onClose?: () => void;
}

export const NotificationItem = ({ notification, onClose }: NotificationItemProps) => {
    const markNotificationAsRead = useBoardStore(state => state.markNotificationAsRead);
    const handleAcceptInvite = useBoardStore(state => state.handleAcceptInvite);
    const handleDeclineInvite = useBoardStore(state => state.handleDeclineInvite);
    const dismissNotification = useBoardStore(state => state.dismissNotification);
    const setActiveBoard = useBoardStore(state => state.setActiveBoard);
    const setActiveWorkspace = useBoardStore(state => state.setActiveWorkspace);
    const setActiveItem = useBoardStore(state => state.setActiveItem);
    const navigateTo = useBoardStore(state => state.navigateTo);
    const [isProcessing, setIsProcessing] = useState(false);

    const isInvite = notification.type === 'workspace_invite' || notification.type === 'board_invite';
    const isAssignment = notification.type === 'assignment';
    const isMention = notification.type === 'mention';
    const isComment = notification.type === 'comment';
    const isLike = notification.type === 'like';
    const isDueDateReminder = notification.type === 'due_date_reminder';
    const isStatusUpdate = notification.type === 'status_update';

    const handleAction = async (action: 'accept' | 'decline') => {
        setIsProcessing(true);
        try {
            if (action === 'accept') {
                await handleAcceptInvite(notification);
            } else {
                await handleDeclineInvite(notification);
            }
        } finally {
            setIsProcessing(false);
        }
    };

    const handleClick = () => {
        if (!notification.is_read) {
            markNotificationAsRead(notification.id);
        }

        // Navigation Logic
        if (notification.data?.board_id) {
            setActiveBoard(notification.data.board_id);
            // If linked to an item (mention/assignment), open it. Board-scoped
            // notifications such as access_granted carry the board id as their
            // entity_id, and opening that as an item left the side panel stuck
            // on its loading spinner looking for an item that cannot exist.
            if (notification.entity_id && notification.entity_id !== notification.data.board_id) {
                setActiveItem(notification.entity_id);
            }
            if (onClose) onClose();
        } else if (notification.data?.workspace_id) {
            setActiveWorkspace(notification.data.workspace_id);
            navigateTo('home');
            if (onClose) onClose();
        }
    };

    const getIcon = () => {
        if (isInvite) return <UserPlus size={16} color="hsl(var(--color-brand-primary))" />;
        if (isAssignment) return <FileText size={16} color="hsl(var(--color-status-green-bg))" />;
        if (isMention) return <MessageSquare size={16} color="#f97316" />; // Keeping orange for now as no var
        if (isComment) return <MessageSquare size={16} color="hsl(var(--color-text-secondary))" />;
        if (isLike) return <ThumbsUp size={16} color="#D4A000" />;
        if (isDueDateReminder) return <CalendarClock size={16} color="#e2445c" />;
        if (isStatusUpdate) return <RefreshCw size={16} color="hsl(var(--color-brand-primary))" />;
        return <Bell size={16} color="hsl(var(--color-text-secondary))" />;
    };

    return (
        <div
            onClick={handleClick}
            style={{
                padding: '16px',
                borderBottom: '1px solid hsl(var(--color-border))',
                cursor: 'pointer',
                position: 'relative',
                backgroundColor: !notification.is_read ? 'hsl(var(--color-brand-light))' : 'transparent',
                transition: 'background-color 0.2s'
            }}
            onMouseEnter={(e) => {
                if (notification.is_read) e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-surface-hover))';
                // Show dismiss button on hover (requires separate state or CSS approach, using opacity for now)
                const dismissBtn = e.currentTarget.querySelector('.dismiss-btn') as HTMLElement;
                if (dismissBtn) dismissBtn.style.opacity = '1';
            }}
            onMouseLeave={(e) => {
                if (notification.is_read) e.currentTarget.style.backgroundColor = 'transparent';
                const dismissBtn = e.currentTarget.querySelector('.dismiss-btn') as HTMLElement;
                if (dismissBtn) dismissBtn.style.opacity = '0';
            }}
        >
            <div style={{ display: 'flex', gap: '12px' }}>
                {/* Icon/Avatar Placeholder */}
                <div style={{
                    marginTop: '4px', flexShrink: 0, width: '32px', height: '32px', borderRadius: '50%',
                    backgroundColor: 'hsl(var(--color-bg-surface))', border: '1px solid hsl(var(--color-border))', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: 'var(--shadow-sm)'
                }}>
                    {getIcon()}
                </div>

                <div style={{ flex: 1, minWidth: 0, paddingRight: '20px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                            <p style={{
                                fontSize: '14px', color: 'hsl(var(--color-text-primary))', margin: 0,
                                fontWeight: !notification.is_read ? 600 : 500
                            }}>
                                {notification.title || notification.content}
                            </p>
                            <span style={{ fontSize: '11px', color: 'hsl(var(--color-text-tertiary))', whiteSpace: 'nowrap', marginLeft: '8px' }}>
                                {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true }).replace('about ', '')}
                            </span>
                        </div>
                    </div>

                    {notification.message && (
                        <p style={{ fontSize: '13px', color: 'hsl(var(--color-text-secondary))', marginTop: '4px', lineHeight: '1.4' }}>
                            {notification.message}
                        </p>
                    )}

                    {isMention && notification.data?.updatePreview && (
                        <div style={{
                            marginTop: '8px',
                            padding: '8px 12px',
                            backgroundColor: 'hsl(var(--color-bg-canvas))',
                            borderLeft: '3px solid #f97316',
                            borderRadius: '0 6px 6px 0',
                            fontSize: '12px',
                            color: 'hsl(var(--color-text-secondary))',
                            lineHeight: '1.5',
                            fontStyle: 'italic',
                            overflow: 'hidden',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                        } as React.CSSProperties}>
                            "{notification.data.updatePreview}"
                        </div>
                    )}

                    {/* Invite Actions */}
                    {isInvite && (!notification.status || notification.status === 'pending') && (
                        <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }} onClick={e => e.stopPropagation()}>
                            <button
                                onClick={() => handleAction('accept')}
                                disabled={isProcessing}
                                style={{
                                    flex: 1, padding: '6px 12px', backgroundColor: 'hsl(var(--color-brand-primary))', color: 'white', border: 'none',
                                    borderRadius: '4px', fontSize: '12px', fontWeight: 500, cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                                }}
                            >
                                {isProcessing ? '...' : <><Check size={12} /> Accept</>}
                            </button>
                            <button
                                onClick={() => handleAction('decline')}
                                disabled={isProcessing}
                                style={{
                                    flex: 1, padding: '6px 12px', backgroundColor: 'hsl(var(--color-bg-surface))', color: 'hsl(var(--color-text-primary))', border: '1px solid hsl(var(--color-border))',
                                    borderRadius: '4px', fontSize: '12px', fontWeight: 500, cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                                }}
                            >
                                <X size={12} /> Decline
                            </button>
                        </div>
                    )}

                    {/* Status Feedback */}
                    {notification.status && notification.status !== 'pending' && (
                        <div style={{
                            marginTop: '8px', fontSize: '12px', padding: '4px 8px', borderRadius: '4px', width: 'fit-content',
                            display: 'flex', alignItems: 'center', gap: '6px',
                            backgroundColor: notification.status === 'accepted' ? 'hsl(var(--color-status-green-bg) / 0.1)' : 'hsl(var(--color-status-red-bg) / 0.1)',
                            color: notification.status === 'accepted' ? 'hsl(var(--color-status-green-bg))' : 'hsl(var(--color-status-red-bg))',
                            border: `1px solid ${notification.status === 'accepted' ? 'hsl(var(--color-status-green-bg) / 0.3)' : 'hsl(var(--color-status-red-bg) / 0.3)'}`
                        }}>
                            {notification.status === 'accepted' ? <Check size={10} /> : <X size={10} />}
                            {notification.status === 'accepted' ? 'Accepted' : 'Declined'}
                        </div>
                    )}
                </div>

                {/* Unread Indicator */}
                {!notification.is_read && (
                    <div style={{ position: 'absolute', top: '16px', right: '10px', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#2563eb' }} />
                )}

                {/* Group Hover Dismiss Button */}
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        dismissNotification(notification.id);
                    }}
                    className="dismiss-btn"
                    style={{
                        position: 'absolute', top: '4px', right: '4px', padding: '4px', border: 'none', background: 'transparent',
                        color: '#9ca3af', borderRadius: '6px', cursor: 'pointer', opacity: 0, transition: 'opacity 0.2s',
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}
                    title="Dismiss"
                    onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.backgroundColor = '#fef2f2'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = '#9ca3af'; e.currentTarget.style.backgroundColor = 'transparent'; }}
                >
                    <X size={14} />
                </button>
            </div>
        </div>
    );
};
