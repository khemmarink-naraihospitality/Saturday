import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import type { Notification } from '../../types';
import { NotificationItem } from './NotificationItem';
import { useBoardStore } from '../../store/useBoardStore';

interface ToastCardProps {
    notification: Notification;
    onRemove: (id: string) => void;
}

const ToastCard = ({ notification, onRemove }: ToastCardProps) => {
    // No auto-dismiss timer — this card is meant to stay put until the user has
    // actually looked at it. Instead, watch the real notification in the store:
    // clicking the card marks it read (NotificationItem's own click handler),
    // and its dismiss button deletes it outright — either way it stops matching
    // here (is_read flips true, or the row disappears entirely) and the toast
    // removes itself at that point, never on a blind timer.
    const liveNotification = useBoardStore(state => state.notifications.find(n => n.id === notification.id));

    useEffect(() => {
        if (!liveNotification || liveNotification.is_read) {
            onRemove(notification.id);
        }
    }, [liveNotification, notification.id, onRemove]);

    return (
        <motion.div
            layout
            initial={{ opacity: 0, x: 60, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 60, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            style={{
                width: '340px',
                backgroundColor: 'hsl(var(--color-bg-surface))',
                borderRadius: '10px',
                boxShadow: '0 12px 28px rgba(0,0,0,0.2)',
                border: '1px solid hsl(var(--color-border))',
                overflow: 'hidden',
                pointerEvents: 'auto'
            }}
        >
            <NotificationItem notification={liveNotification ?? notification} onClose={() => onRemove(notification.id)} />
        </motion.div>
    );
};

interface NotificationToastStackProps {
    toasts: Notification[];
    onRemove: (id: string) => void;
}

export const NotificationToastStack = ({ toasts, onRemove }: NotificationToastStackProps) => {
    if (toasts.length === 0) return null;

    return createPortal(
        <div style={{
            position: 'fixed',
            top: '68px',
            right: '24px',
            zIndex: 2000,
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            pointerEvents: 'none'
        }}>
            <AnimatePresence>
                {toasts.map(notification => (
                    <ToastCard key={notification.id} notification={notification} onRemove={onRemove} />
                ))}
            </AnimatePresence>
        </div>,
        document.body
    );
};
