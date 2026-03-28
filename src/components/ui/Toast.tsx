import { useEffect } from 'react';
import { CheckCircle, XCircle, Info, AlertCircle, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastProps {
    message: string;
    type?: ToastType;
    duration?: number;
    onClose: () => void;
}

const iconMap = {
    success: CheckCircle,
    error: XCircle,
    info: Info,
    warning: AlertCircle
};

const colorMap = {
    success: {
        bg: '#10b981',
        icon: '#ffffff'
    },
    error: {
        bg: '#ef4444',
        icon: '#ffffff'
    },
    info: {
        bg: '#3b82f6',
        icon: '#ffffff'
    },
    warning: {
        bg: '#f59e0b',
        icon: '#ffffff'
    }
};

export const Toast = ({ message, type = 'success', duration = 3000, onClose }: ToastProps) => {
    const Icon = iconMap[type];
    const colors = colorMap[type];

    useEffect(() => {
        const timer = setTimeout(() => {
            onClose();
        }, duration);

        return () => clearTimeout(timer);
    }, [duration, onClose]);

    return (
        <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            style={{
                backgroundColor: colors.bg,
                color: '#ffffff',
                padding: '12px 16px',
                borderRadius: '8px',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                minWidth: '300px',
                maxWidth: '500px',
                pointerEvents: 'auto'
            }}
        >
            <Icon size={20} color={colors.icon} />
            <span style={{ flex: 1, fontSize: '14px', fontWeight: 500 }}>
                {message}
            </span>
            <button
                onClick={onClose}
                style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '4px',
                    opacity: 0.8,
                    transition: 'opacity 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                onMouseLeave={(e) => e.currentTarget.style.opacity = '0.8'}
            >
                <X size={16} color={colors.icon} />
            </button>
        </motion.div>
    );
};

interface ToastContainerProps {
    toasts: Array<{ id: string; message: string; type: ToastType }>;
    onRemove: (id: string) => void;
}

export const ToastContainer = ({ toasts, onRemove }: ToastContainerProps) => {
    return (
        <div style={{
            position: 'fixed',
            top: '24px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 10000,
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            alignItems: 'center',
            pointerEvents: 'none'
        }}>
            <AnimatePresence>
                {toasts.map((toast) => (
                    <Toast
                        key={toast.id}
                        message={toast.message}
                        type={toast.type}
                        onClose={() => onRemove(toast.id)}
                    />
                ))}
            </AnimatePresence>
        </div>
    );
};
