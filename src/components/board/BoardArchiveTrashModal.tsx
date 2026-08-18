import { useEffect, useState } from 'react';
import { Trash2, RotateCcw, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useBoardStore } from '../../store/useBoardStore';

interface ArchivedGroup {
    id: string;
    title: string;
}

interface BoardArchiveTrashModalProps {
    boardId: string;
    onClose: () => void;
}

export const BoardArchiveTrashModal = ({ boardId, onClose }: BoardArchiveTrashModalProps) => {
    const restoreGroup = useBoardStore(state => state.restoreGroup);
    const [archivedGroups, setArchivedGroups] = useState<ArchivedGroup[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [restoringId, setRestoringId] = useState<string | null>(null);

    const fetchArchivedGroups = async () => {
        setIsLoading(true);
        const { data } = await supabase
            .from('groups')
            .select('id, title')
            .eq('board_id', boardId)
            .eq('is_archived', true)
            .order('title');
        setArchivedGroups(data || []);
        setIsLoading(false);
    };

    useEffect(() => {
        fetchArchivedGroups();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [boardId]);

    const handleRestore = async (groupId: string) => {
        setRestoringId(groupId);
        await restoreGroup(groupId, boardId);
        setArchivedGroups(prev => prev.filter(g => g.id !== groupId));
        setRestoringId(null);
    };

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
                        <Trash2 size={20} /> Archive & Trash — Groups
                    </h3>
                    <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'hsl(var(--color-text-secondary))' }}>
                        <X size={20} />
                    </button>
                </div>

                <div style={{ flex: 1, overflowY: 'auto' }}>
                    {isLoading ? (
                        <div style={{ padding: '32px', textAlign: 'center', color: 'hsl(var(--color-text-secondary))' }}>
                            Loading...
                        </div>
                    ) : archivedGroups.length === 0 ? (
                        <div style={{ padding: '32px', textAlign: 'center', color: 'hsl(var(--color-text-secondary))' }}>
                            No archived groups found.
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {archivedGroups.map(group => (
                                <div key={group.id} style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    padding: '12px', borderRadius: '6px', border: '1px solid hsl(var(--color-border))',
                                    backgroundColor: 'hsl(var(--color-bg-canvas))'
                                }}>
                                    <span style={{ fontWeight: 500, color: 'hsl(var(--color-text-primary))' }}>{group.title}</span>

                                    <button
                                        onClick={() => handleRestore(group.id)}
                                        disabled={restoringId === group.id}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '6px',
                                            padding: '6px 12px', borderRadius: '4px',
                                            border: '1px solid hsl(var(--color-border))',
                                            backgroundColor: 'white', cursor: restoringId === group.id ? 'not-allowed' : 'pointer',
                                            fontSize: '13px', fontWeight: 500, color: 'hsl(var(--color-text-primary))',
                                            opacity: restoringId === group.id ? 0.6 : 1
                                        }}
                                        onMouseOver={e => e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-hover))'}
                                        onMouseOut={e => e.currentTarget.style.backgroundColor = 'white'}
                                    >
                                        <RotateCcw size={14} /> {restoringId === group.id ? 'Restoring...' : 'Restore'}
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
