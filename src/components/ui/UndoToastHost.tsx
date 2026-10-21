import { AnimatePresence, motion } from 'framer-motion';
import { Undo2, X } from 'lucide-react';
import { useUndoToast } from '../../store/useUndoToast';
import { useIsMobile } from '../../hooks/useIsMobile';

/** Draws the one undo toast (store/useUndoToast.ts): the message, an Undo button and a bar that runs out with the time left. */
export const UndoToastHost = () => {
    const toast = useUndoToast(state => state.toast);
    const dismiss = useUndoToast(state => state.dismiss);
    const isMobile = useIsMobile();
    return (
        <div style={{
            position: 'fixed', left: 16, right: 16, display: 'flex', justifyContent: 'center', pointerEvents: 'none', zIndex: 100000,
            bottom: isMobile ? 'calc(98px + env(safe-area-inset-bottom, 0px))' : 28,
        }}>
            <AnimatePresence>
                {toast && (
                    <motion.div
                        key={toast.id}
                        role="status"
                        aria-live="polite"
                        initial={{ opacity: 0, y: 14, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 8 }}
                        transition={{ duration: 0.18 }}
                        style={{
                            position: 'relative', overflow: 'hidden', pointerEvents: 'auto', maxWidth: 520, width: 'fit-content',
                            display: 'flex', alignItems: 'center', gap: 14, padding: '10px 10px 12px 18px',
                            borderRadius: 14, fontSize: 14, fontWeight: 500, color: '#fff',
                            background: 'hsl(230 20% 14% / 0.96)', boxShadow: '0 12px 32px rgba(0,0,0,0.3)',
                        }}
                    >
                        <span style={{ minWidth: 0, lineHeight: 1.4 }}>{toast.message}</span>
                        <button
                            type="button"
                            onClick={() => { dismiss(toast.id); toast.onAction(); }}
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0, height: 34, padding: '0 14px',
                                borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer',
                                color: '#cfeab8', background: 'hsl(0 0% 100% / 0.12)',
                            }}
                        >
                            <Undo2 size={15} /> {toast.actionLabel}
                        </button>
                        <button
                            type="button"
                            aria-label="Dismiss"
                            onClick={() => dismiss(toast.id)}
                            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, flexShrink: 0, borderRadius: 8, cursor: 'pointer', color: 'hsl(0 0% 100% / 0.6)' }}
                        >
                            <X size={15} />
                        </button>
                        <motion.div
                            initial={{ scaleX: 1 }}
                            animate={{ scaleX: 0 }}
                            transition={{ duration: toast.durationMs / 1000, ease: 'linear' }}
                            style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, background: '#9ccf7e', transformOrigin: 'left' }}
                        />
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
