import { AnimatePresence, motion } from 'framer-motion';
import { create } from 'zustand';

type ToastKind = 'info' | 'success' | 'error';

interface ToastState {
    toast: { id: number; message: string; kind: ToastKind } | null;
    show: (message: string, kind?: ToastKind) => void;
    clear: (id: number) => void;
}

let toastSeq = 0;

const useToastStore = create<ToastState>()(set => ({
    toast: null,
    show: (message, kind = 'info') => {
        const id = ++toastSeq;
        set({ toast: { id, message, kind } });
        window.setTimeout(() => useToastStore.getState().clear(id), kind === 'error' ? 5000 : 2600);
    },
    clear: (id) => set(state => (state.toast?.id === id ? { toast: null } : state)),
}));

/** A short message floating above the tab bar ("Link copied", "Comment not saved"). */
export const mobileToast = (message: string, kind: ToastKind = 'info') => useToastStore.getState().show(message, kind);

export const MobileToastHost = () => {
    const toast = useToastStore(state => state.toast);
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
                            padding: '12px 16px',
                            borderRadius: 14,
                            fontSize: 15,
                            fontWeight: 500,
                            color: '#fff',
                            background: toast.kind === 'error' ? 'hsl(var(--color-danger))' : 'hsl(230 20% 16% / 0.94)',
                            boxShadow: '0 8px 24px rgba(0,0,0,0.25)'
                        }}
                    >
                        {toast.message}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
