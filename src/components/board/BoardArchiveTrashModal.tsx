import { useEffect, useState } from 'react';
import { Trash2, RotateCcw, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useBoardStore } from '../../store/useBoardStore';

interface ArchivedGroup {
    id: string;
    title: string;
}

interface ArchivedItem {
    id: string;
    title: string;
    parent_id: string | null;
}

interface BoardArchiveTrashModalProps {
    boardId: string;
    onClose: () => void;
}

export const BoardArchiveTrashModal = ({ boardId, onClose }: BoardArchiveTrashModalProps) => {
    const restoreGroup = useBoardStore(state => state.restoreGroup);
    const restoreItem = useBoardStore(state => state.restoreItem);
    const [archivedGroups, setArchivedGroups] = useState<ArchivedGroup[]>([]);
    const [archivedItems, setArchivedItems] = useState<ArchivedItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [restoringId, setRestoringId] = useState<string | null>(null);

    const fetchArchived = async () => {
        setIsLoading(true);
        const [{ data: groups }, { data: items }] = await Promise.all([
            supabase
                .from('groups')
                .select('id, title')
                .eq('board_id', boardId)
                .eq('is_archived', true)
                .order('title'),
            supabase
                .from('items')
                .select('id, title, parent_id')
                .eq('board_id', boardId)
                .eq('is_archived', true)
                .order('title')
        ]);
        setArchivedGroups(groups || []);
        setArchivedItems(items || []);
        setIsLoading(false);
    };

    useEffect(() => {
        fetchArchived();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [boardId]);

    const handleRestoreGroup = async (groupId: string, groupTitle: string) => {
        setRestoringId(groupId);
        await restoreGroup(groupId, boardId, groupTitle);
        setArchivedGroups(prev => prev.filter(g => g.id !== groupId));
        setRestoringId(null);
    };

    const handleRestoreItem = async (itemId: string, itemTitle: string) => {
        setRestoringId(itemId);
        await restoreItem(itemId, boardId, itemTitle);
        setArchivedItems(prev => prev.filter(i => i.id !== itemId));
        setRestoringId(null);
    };

    const renderRow = (id: string, label: string, sublabel: string | null, onRestore: () => void) => (
        <div key={id} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px', borderRadius: '6px', border: '1px solid hsl(var(--color-border))',
            backgroundColor: 'hsl(var(--color-bg-canvas))'
        }}>
            <span style={{ fontWeight: 500, color: 'hsl(var(--color-text-primary))', display: 'flex', alignItems: 'center', gap: '8px' }}>
                {label}
                {sublabel && (
                    <span style={{
                        fontSize: '11px', fontWeight: 500, color: 'hsl(var(--color-text-tertiary))',
                        backgroundColor: 'hsl(var(--color-bg-subtle))', padding: '2px 6px', borderRadius: '4px'
                    }}>
                        {sublabel}
                    </span>
                )}
            </span>

            <button
                onClick={onRestore}
                disabled={restoringId === id}
                style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '6px 12px', borderRadius: '4px',
                    border: '1px solid hsl(var(--color-border))',
                    backgroundColor: 'white', cursor: restoringId === id ? 'not-allowed' : 'pointer',
                    fontSize: '13px', fontWeight: 500, color: 'hsl(var(--color-text-primary))',
                    opacity: restoringId === id ? 0.6 : 1
                }}
                onMouseOver={e => e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-hover))'}
                onMouseOut={e => e.currentTarget.style.backgroundColor = 'white'}
            >
                <RotateCcw size={14} /> {restoringId === id ? 'Restoring...' : 'Restore'}
            </button>
        </div>
    );

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
                    {isLoading ? (
                        <div style={{ padding: '32px', textAlign: 'center', color: 'hsl(var(--color-text-secondary))' }}>
                            Loading...
                        </div>
                    ) : (
                        <>
                            <div style={{ fontSize: '12px', fontWeight: 600, color: 'hsl(var(--color-text-tertiary))', textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: '8px' }}>
                                Groups
                            </div>
                            {archivedGroups.length === 0 ? (
                                <div style={{ padding: '16px', textAlign: 'center', color: 'hsl(var(--color-text-secondary))', fontSize: '13px' }}>
                                    No archived groups.
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
                                    {archivedGroups.map(group => renderRow(group.id, group.title, null, () => handleRestoreGroup(group.id, group.title)))}
                                </div>
                            )}

                            <div style={{ fontSize: '12px', fontWeight: 600, color: 'hsl(var(--color-text-tertiary))', textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: '8px' }}>
                                Tasks
                            </div>
                            {archivedItems.length === 0 ? (
                                <div style={{ padding: '16px', textAlign: 'center', color: 'hsl(var(--color-text-secondary))', fontSize: '13px' }}>
                                    No archived tasks.
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {archivedItems.map(item => renderRow(
                                        item.id,
                                        item.title,
                                        item.parent_id ? 'sub-item' : null,
                                        () => handleRestoreItem(item.id, item.title)
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};
