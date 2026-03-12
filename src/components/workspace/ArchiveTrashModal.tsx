import { Trash2, RotateCcw, X } from 'lucide-react';
import { useBoardStore } from '../../store/useBoardStore';

interface ArchiveTrashModalProps {
    onClose: () => void;
}

export const ArchiveTrashModal = ({ onClose }: ArchiveTrashModalProps) => {
    const { boards, restoreBoard } = useBoardStore();

    // In a real implementation with a huge DB, we would fetch archived boards from the server.
    // For now, since boards might be filtered out of the main 'boards' array, let's assume 
    // we need to fetch them from supabase here, OR the store keeps them.
    // Actually, if we filter them out of 'boards' in the store, we can't map them here.
    // Let's check `useBoardStore` - we'll keep them in `boards` but add a property `is_archived`.
    // Then we filter them out in `WorkspaceList.tsx`, so we CAN access them here.
    
    // We only show archived boards where the user is an owner (based on workspace or board members)
    // Wait, the store's `boards` array will include them.
    const archivedBoards = boards.filter((b: any) => b.is_archived);

    return (
        <div style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 3000
        }} onClick={onClose}>
            <div style={{
                backgroundColor: 'hsl(var(--color-bg-surface))',
                padding: '24px',
                borderRadius: '8px',
                width: '480px',
                maxHeight: '80vh',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
            }} onClick={e => e.stopPropagation()}>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h3 style={{ margin: 0, fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Trash2 size={20} /> Archive & Trash
                    </h3>
                    <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'hsl(var(--color-text-secondary))' }}>
                        <X size={20} />
                    </button>
                </div>

                <div style={{ flex: 1, overflowY: 'auto' }}>
                    {archivedBoards.length === 0 ? (
                        <div style={{ padding: '32px', textAlign: 'center', color: 'hsl(var(--color-text-secondary))' }}>
                            No archived boards found.
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {archivedBoards.map((board: any) => (
                                <div key={board.id} style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    padding: '12px', borderRadius: '6px', border: '1px solid hsl(var(--color-border))',
                                    backgroundColor: 'hsl(var(--color-bg-canvas))'
                                }}>
                                    <span style={{ fontWeight: 500, color: 'hsl(var(--color-text-primary))' }}>{board.title}</span>
                                    
                                    <button 
                                        onClick={() => {
                                            if (restoreBoard) restoreBoard(board.id);
                                        }}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '6px',
                                            padding: '6px 12px', borderRadius: '4px',
                                            border: '1px solid hsl(var(--color-border))',
                                            backgroundColor: 'white', cursor: 'pointer',
                                            fontSize: '13px', fontWeight: 500, color: 'hsl(var(--color-text-primary))'
                                        }}
                                        onMouseOver={e => e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-hover))'}
                                        onMouseOut={e => e.currentTarget.style.backgroundColor = 'white'}
                                    >
                                        <RotateCcw size={14} /> Restore
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
