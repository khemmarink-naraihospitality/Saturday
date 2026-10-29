import { Trash2, RotateCcw, X } from 'lucide-react';
import { useBoardStore } from '../../store/useBoardStore';
import { useTerms } from '../../lib/terms';

interface ArchiveTrashModalProps {
    onClose: () => void;
    workspaceId?: string;
    workspaceTitle?: string;
}

export const ArchiveTrashModal = ({ onClose, workspaceId, workspaceTitle }: ArchiveTrashModalProps) => {
    const boards = useBoardStore(state => state.boards);
    const restoreBoard = useBoardStore(state => state.restoreBoard);
    const t = useTerms();

    const archivedBoards = boards.filter((b: any) => b.is_archived && (!workspaceId || b.workspaceId === workspaceId));

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
                        <Trash2 size={20} /> Archive & Trash{workspaceTitle ? ` — ${workspaceTitle}` : ''}
                    </h3>
                    <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'hsl(var(--color-text-secondary))' }}>
                        <X size={20} />
                    </button>
                </div>

                <div style={{ flex: 1, overflowY: 'auto' }}>
                    {archivedBoards.length === 0 ? (
                        <div style={{ padding: '32px', textAlign: 'center', color: 'hsl(var(--color-text-secondary))' }}>
                            {`No archived ${t.boards} found.`}
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
