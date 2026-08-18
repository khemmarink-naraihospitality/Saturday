import { useEffect, useState } from 'react';
import { Search, RefreshCw, RotateCcw, Trello, Layers } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useUserStore } from '../../store/useUserStore';
import { useBoardStore } from '../../store/useBoardStore';

interface ArchivedBoardRow {
    id: string;
    title: string;
    workspaceTitle: string;
}

interface ArchivedGroupRow {
    id: string;
    title: string;
    boardId: string;
    boardTitle: string;
    workspaceTitle: string;
}

export const TrashManagement = () => {
    const { currentUser } = useUserStore();
    const canRestore = currentUser.system_role === 'super_admin';

    const [boards, setBoards] = useState<ArchivedBoardRow[]>([]);
    const [groups, setGroups] = useState<ArchivedGroupRow[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [restoringId, setRestoringId] = useState<string | null>(null);

    const fetchTrash = async () => {
        setIsLoading(true);
        const [{ data: boardData }, { data: groupData }] = await Promise.all([
            supabase
                .from('boards')
                .select('id, title, workspace_id, workspaces(title)')
                .eq('is_archived', true)
                .order('title'),
            supabase
                .from('groups')
                .select('id, title, board_id, boards(title, workspace_id, workspaces(title))')
                .eq('is_archived', true)
                .order('title')
        ]);

        setBoards((boardData || []).map((b: any) => ({
            id: b.id,
            title: b.title,
            workspaceTitle: b.workspaces?.title || 'Unknown Workspace'
        })));

        setGroups((groupData || []).map((g: any) => ({
            id: g.id,
            title: g.title,
            boardId: g.board_id,
            boardTitle: g.boards?.title || 'Unknown Board',
            workspaceTitle: g.boards?.workspaces?.title || 'Unknown Workspace'
        })));

        setIsLoading(false);
    };

    useEffect(() => {
        fetchTrash();
    }, []);

    const handleRestoreBoard = async (id: string) => {
        setRestoringId(id);
        await useBoardStore.getState().restoreBoard(id);
        setBoards(prev => prev.filter(b => b.id !== id));
        setRestoringId(null);
    };

    const handleRestoreGroup = async (id: string, boardId: string) => {
        setRestoringId(id);
        await useBoardStore.getState().restoreGroup(id, boardId);
        setGroups(prev => prev.filter(g => g.id !== id));
        setRestoringId(null);
    };

    const q = searchQuery.trim().toLowerCase();
    const filteredBoards = q ? boards.filter(b => b.title.toLowerCase().includes(q) || b.workspaceTitle.toLowerCase().includes(q)) : boards;
    const filteredGroups = q ? groups.filter(g => g.title.toLowerCase().includes(q) || g.boardTitle.toLowerCase().includes(q) || g.workspaceTitle.toLowerCase().includes(q)) : groups;

    const restoreButton = (id: string, onClick: () => void) => (
        <button
            onClick={canRestore ? onClick : undefined}
            disabled={!canRestore || restoringId === id}
            title={canRestore ? undefined : 'Only Super Admin can restore'}
            style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '6px 12px', borderRadius: '4px',
                border: '1px solid #e2e8f0',
                backgroundColor: canRestore ? 'white' : '#f8fafc',
                cursor: canRestore ? (restoringId === id ? 'not-allowed' : 'pointer') : 'not-allowed',
                fontSize: '13px', fontWeight: 500,
                color: canRestore ? '#0f172a' : '#94a3b8',
                opacity: restoringId === id ? 0.6 : 1
            }}
        >
            <RotateCcw size={14} /> {restoringId === id ? 'Restoring...' : 'Restore'}
        </button>
    );

    return (
        <div style={{ backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Search size={18} color="#64748b" />
                <input
                    type="text"
                    placeholder="Search trash..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{ border: 'none', outline: 'none', fontSize: '14px', flex: 1, color: '#0f172a' }}
                />
                <button
                    onClick={fetchTrash}
                    style={{
                        padding: '6px 12px', backgroundColor: '#f1f5f9', border: '1px solid #e2e8f0',
                        borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center',
                        gap: '6px', fontSize: '13px', color: '#475569'
                    }}
                >
                    <RefreshCw size={14} /> Refresh
                </button>
            </div>

            {!canRestore && (
                <div style={{ padding: '10px 20px', fontSize: '12px', color: '#92400e', backgroundColor: '#fef3c7', borderBottom: '1px solid #e2e8f0' }}>
                    You can view everything that's been deleted, but only a Super Admin can restore it.
                </div>
            )}

            {isLoading ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>Loading...</div>
            ) : (
                <div style={{ padding: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                        <Trello size={16} color="#64748b" />
                        <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>Archived Boards ({filteredBoards.length})</h3>
                    </div>
                    {filteredBoards.length === 0 ? (
                        <div style={{ padding: '16px', textAlign: 'center', color: '#94a3b8', fontSize: '13px', marginBottom: '24px' }}>No archived boards.</div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px' }}>
                            {filteredBoards.map(b => (
                                <div key={b.id} style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    padding: '12px', borderRadius: '6px', border: '1px solid #e2e8f0', backgroundColor: '#f8fafc'
                                }}>
                                    <div>
                                        <div style={{ fontWeight: 500, fontSize: '14px', color: '#0f172a' }}>{b.title}</div>
                                        <div style={{ fontSize: '12px', color: '#94a3b8' }}>{b.workspaceTitle}</div>
                                    </div>
                                    {restoreButton(b.id, () => handleRestoreBoard(b.id))}
                                </div>
                            ))}
                        </div>
                    )}

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                        <Layers size={16} color="#64748b" />
                        <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>Archived Groups ({filteredGroups.length})</h3>
                    </div>
                    {filteredGroups.length === 0 ? (
                        <div style={{ padding: '16px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>No archived groups.</div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {filteredGroups.map(g => (
                                <div key={g.id} style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    padding: '12px', borderRadius: '6px', border: '1px solid #e2e8f0', backgroundColor: '#f8fafc'
                                }}>
                                    <div>
                                        <div style={{ fontWeight: 500, fontSize: '14px', color: '#0f172a' }}>{g.title}</div>
                                        <div style={{ fontSize: '12px', color: '#94a3b8' }}>{g.boardTitle} › {g.workspaceTitle}</div>
                                    </div>
                                    {restoreButton(g.id, () => handleRestoreGroup(g.id, g.boardId))}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
