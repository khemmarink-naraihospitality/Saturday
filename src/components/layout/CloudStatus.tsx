import { useBoardStore } from '../../store/useBoardStore';
import { Cloud, CloudOff, RefreshCw, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export const CloudStatus = () => {
    const isSyncing = useBoardStore(state => state.isSyncing);
    const error = useBoardStore(state => state.error);

    if (error) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#e2445c' }} title={error}>
                <CloudOff size={16} />
                <span style={{ fontSize: '12px', fontWeight: 500 }}>Offline</span>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#676879', minWidth: '80px', justifyContent: 'flex-end' }}>
            <AnimatePresence mode="wait">
                {isSyncing ? (
                    <motion.div
                        key="syncing"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                        <RefreshCw size={14} className="spin" />
                        <span style={{ fontSize: '12px', fontWeight: 500 }}>Syncing...</span>
                    </motion.div>
                ) : (
                    <motion.div
                        key="saved"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                        title="All changes saved to cloud"
                    >
                        <Cloud size={16} />
                        <span style={{ fontSize: '12px', fontWeight: 500 }}>Saved</span>
                        <Check size={12} strokeWidth={3} style={{ marginLeft: '-2px' }} />
                    </motion.div>
                )}
            </AnimatePresence>
            <style>{`
                .spin { animation: spin 1s linear infinite; }
                @keyframes spin { 100% { transform: rotate(360deg); } }
            `}</style>
        </div>
    );
};
