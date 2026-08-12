import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import type { Notification } from '../../types';
import { NotificationItem } from './NotificationItem';

const AUTO_DISMISS_MS = 5000;

interface ToastCardProps {
    notification: Notification;
    onRemove: (id: string) => void;
}

const ToastCard = ({ notification, onRemove }: ToastCardProps) => {
    useEffect(() => {
        const timer = setTimeout(() => onRemove(notification.id), AUTO_DISMISS_MS);
        return () => clearTimeout(timer);
    }, [notification.id, onRemove]);

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
            {/* Auto-dismiss only hides this popup — the NotificationItem's own
                controls (mark-as-read on click, dismiss = delete) still act on
                the real notification, same as inside the bell popover. */}
            <NotificationItem notification={notification} onClose={() => onRemove(notification.id)} />
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
