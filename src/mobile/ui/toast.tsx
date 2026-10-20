import { AnimatePresence, motion } from 'framer-motion';
import { create } from 'zustand';

type ToastKind = 'info' | 'success' | 'error';

/** A button in the toast ("Undo"). */
export interface ToastAction {
    label: string;
    onClick: () => void;
}

interface ToastState {
    toast: { id: number; message: string; kind: ToastKind; action?: ToastAction } | null;
    show: (message: string, kind?: ToastKind, action?: ToastAction) => void;
    clear: (id: number) => void;
}

let toastSeq = 0;

const useToastStore = create<ToastState>()(set => ({
    toast: null,
    show: (message, kind = 'info', action) => {
        const id = ++toastSeq;
        set({ toast: { id, message, kind, action } });
        // Long enough to read, and to reach an "Undo" with a thumb.
        const ms = action ? 6000 : kind === 'error' ? 5000 : 2600;
        window.setTimeout(() => useToastStore.getState().clear(id), ms);
    },
    clear: (id) => set(state => (state.toast?.id === id ? { toast: null } : state)),
}));

/** A short message floating above the tab bar ("Link copied", "Comment not saved"), optionally with an action. */
export const mobileToast = (message: string, kind: ToastKind = 'info', action?: ToastAction) =>
    useToastStore.getState().show(message, kind, action);

export const MobileToastHost = () => {
    const toast = useToastStore(state => state.toast);
    const clear = useToastStore(state => state.clear);
    return (
        <div style={{
            position: 'fixed',
            left: 16,
            right: 16,
            bottom: 'calc(var(--m-tabbar-h) + 26px + var(--m-safe-bottom))',
            display: 'flex',
            justifyContent: 'center',
            pointerEvents: 'none',
            zIndex: 2000
        }}>
            <AnimatePresence>
                {toast && (
                    <motion.div
                        key={toast.id}
                        role="status"
                        initial={{ opacity: 0, y: 12, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 8 }}
                        transition={{ duration: 0.18 }}
                        style={{
                            maxWidth: 420,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 14,
                            padding: toast.action ? '8px 8px 8px 16px' : '12px 16px',
                            borderRadius: 14,
                            fontSize: 15,
                            fontWeight: 500,
                            color: '#fff',
                            background: toast.kind === 'error' ? 'hsl(var(--color-danger))' : 'hsl(230 20% 16% / 0.94)',
                            boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
                            pointerEvents: toast.action ? 'auto' : 'none'
                        }}
                    >
                        <span>{toast.message}</span>
                        {toast.action && (
                            <button
                                type="button"
                                onClick={() => {
                                    clear(toast.id);
                                    toast.action?.onClick();
                                }}
                                style={{
                                    minHeight: 36,
                                    padding: '0 12px',
                                    borderRadius: 10,
                                    fontSize: 15,
                                    fontWeight: 700,
                                    color: 'hsl(var(--m-toast-action, 255 100% 82%))',
                                    background: 'hsl(0 0% 100% / 0.1)'
                                }}
                            >
                                {toast.action.label}
                            </button>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
