import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Search, RefreshCw, ExternalLink, Users } from 'lucide-react';
import { useUserStore } from '../../store/useUserStore';
import { slugify } from '../../lib/utils';
import { AdminBoardMembersModal } from './AdminBoardMembersModal';

interface BoardMemberSummary {
    id: string;
    full_name: string | null;
    email: string | null;
    avatar_url: string | null;
}

interface BoardRow {
    id: string;
    title: string;
    created_at: string;
    owner_id: string;
    workspace_id: string;
    owner_name: string;
    owner_email: string;
    workspace_title: string;
    members: BoardMemberSummary[];
}

export const BoardTable = () => {
    const { currentUser } = useUserStore();
    const [boards, setBoards] = useState<BoardRow[]>([]);
    const [filteredBoards, setFilteredBoards] = useState<BoardRow[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [managingBoard, setManagingBoard] = useState<{ id: string; title: string } | null>(null);

    const fetchBoards = async () => {
        setLoading(true);
        setError(null);
        try {
            // Fetch boards with workspace and owner info (owner comes from workspace)
            const { data, error: fetchError } = await supabase
                .from('boards')
                .select(`
                    id,
                    title,
                    created_at,
                    workspace_id,
                    workspaces!boards_workspace_id_fkey (
                        title,
                        owner_id,
                        profiles!workspaces_owner_id_fkey (
                            full_name,
                            email
                        )
                    )
                `)
                .order('created_at', { ascending: false });

            if (fetchError) throw fetchError;

            const boardIds = (data || []).map((board: any) => board.id);
            const membersByBoard: Record<string, BoardMemberSummary[]> = {};
            if (boardIds.length > 0) {
                const { data: memberRows } = await supabase
                    .from('board_members')
                    .select('board_id, profiles(id, full_name, email, avatar_url)')
                    .in('board_id', boardIds);

                (memberRows || []).forEach((row: any) => {
                    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
                    if (!profile) return;
                    if (!membersByBoard[row.board_id]) membersByBoard[row.board_id] = [];
                    membersByBoard[row.board_id].push(profile);
                });
            }

            const mapped: BoardRow[] = (data || []).map((board: any) => ({
                id: board.id,
                title: board.title,
                created_at: board.created_at,
                owner_id: board.workspaces?.owner_id || '',
                workspace_id: board.workspace_id,
                owner_name: board.workspaces?.profiles?.full_name || 'Unknown',
                owner_email: board.workspaces?.profiles?.email || 'N/A',
                workspace_title: board.workspaces?.title || 'Unknown Workspace',
                members: membersByBoard[board.id] || []
            }));

            setBoards(mapped);
            setFilteredBoards(mapped);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchBoards();
    }, []);

    useEffect(() => {
        if (!searchQuery.trim()) {
            setFilteredBoards(boards);
        } else {
            const query = searchQuery.toLowerCase();
            setFilteredBoards(
                boards.filter(board =>
                    board.title.toLowerCase().includes(query) ||
                    board.owner_name.toLowerCase().includes(query) ||
                    board.workspace_title.toLowerCase().includes(query)
                )
            );
        }
    }, [searchQuery, boards]);

    return (
        <div style={{ backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                    <Search size={18} color="#64748b" />
                    <input
                        type="text"
                        placeholder="Search boards..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={{
                            border: 'none',
                            outline: 'none',
                            fontSize: '14px',
                            flex: 1,
                            color: '#0f172a'
                        }}
                    />
                </div>
                <button
                    onClick={fetchBoards}
                    style={{
                        padding: '6px 12px',
                        backgroundColor: '#f1f5f9',
                        border: '1px solid #e2e8f0',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '13px',
                        color: '#475569'
                    }}
                >
                    <RefreshCw size={14} />
                    Refresh
                </button>
            </div>

            {/* Table */}
            {loading ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>Loading boards...</div>
            ) : error ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#ef4444' }}>Error: {error}</div>
            ) : (
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                <th style={{ padding: '12px 20px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Board</th>
                                <th style={{ padding: '12px 20px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Workspace</th>
                                <th style={{ padding: '12px 20px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Owner</th>
                                <th style={{ padding: '12px 20px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Members</th>
                                <th style={{ padding: '12px 20px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Created</th>
                                <th style={{ padding: '12px 20px', textAlign: 'right', fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredBoards.length === 0 ? (
                                <tr>
                                    <td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                                        No boards found
                                    </td>
                                </tr>
                            ) : (
                                filteredBoards.map((board) => (
                                    <tr key={board.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                        <td style={{ padding: '16px 20px' }}>
                                            <div style={{ fontWeight: 500, color: '#0f172a', fontSize: '14px' }}>{board.title}</div>
                                        </td>
                                        <td style={{ padding: '16px 20px' }}>
                                            <div style={{ fontSize: '14px', color: '#64748b' }}>{board.workspace_title}</div>
                                        </td>
                                        <td style={{ padding: '16px 20px' }}>
                                            <div style={{ fontSize: '14px', color: '#0f172a' }}>{board.owner_name}</div>
                                            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{board.owner_email}</div>
                                        </td>
                                        <td style={{ padding: '16px 20px' }}>
                                            <button
                                                onClick={() => setManagingBoard({ id: board.id, title: board.title })}
                                                title="Manage members"
                                                style={{
                                                    background: 'none',
                                                    border: 'none',
                                                    padding: 0,
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '8px'
                                                }}
                                            >
                                                {board.members.length === 0 ? (
                                                    <span style={{
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '6px',
                                                        fontSize: '13px',
                                                        color: '#94a3b8'
                                                    }}>
                                                        <Users size={14} />
                                                        No members
                                                    </span>
                                                ) : (
                                                    <>
                                                        <div style={{ display: 'flex' }}>
                                                            {board.members.slice(0, 4).map((member, idx) => (
                                                                <div
                                                                    key={member.id}
                                                                    title={member.full_name || member.email || ''}
                                                                    style={{
                                                                        width: '26px',
                                                                        height: '26px',
                                                                        borderRadius: '50%',
                                                                        backgroundColor: member.avatar_url ? 'transparent' : '#6366f1',
                                                                        color: 'white',
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        justifyContent: 'center',
                                                                        fontSize: '11px',
                                                                        fontWeight: 600,
                                                                        overflow: 'hidden',
                                                                        border: '2px solid white',
                                                                        marginLeft: idx === 0 ? 0 : '-8px',
                                                                        flexShrink: 0
                                                                    }}
                                                                >
                                                                    {member.avatar_url ? (
                                                                        <img
                                                                            src={member.avatar_url}
                                                                            alt=""
                                                                            referrerPolicy="no-referrer"
                                                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                                        />
                                                                    ) : (
                                                                        (member.full_name?.[0] || member.email?.[0] || '?').toUpperCase()
                                                                    )}
                                                                </div>
                                                            ))}
                                                        </div>
                                                        {board.members.length > 4 && (
                                                            <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 500 }}>
                                                                +{board.members.length - 4}
                                                            </span>
                                                        )}
                                                        <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                                                            ({board.members.length})
                                                        </span>
                                                    </>
                                                )}
                                            </button>
                                        </td>
                                        <td style={{ padding: '16px 20px', fontSize: '14px', color: '#64748b' }}>
                                            {new Date(board.created_at).toLocaleDateString()}
                                        </td>
                                        <td style={{ padding: '16px 20px', textAlign: 'right' }}>
                                            <button
                                                onClick={() => {
                                                    const username = slugify(currentUser.name || 'u');
                                                    const wsName = slugify(board.workspace_title);
                                                    const bName = slugify(board.title);
                                                    const url = `/${username}/${wsName}/${bName}`;
                                                    window.open(url, '_blank');
                                                }}
                                                style={{
                                                    padding: '6px 12px',
                                                    backgroundColor: '#f1f5f9',
                                                    border: '1px solid #cbd5e1',
                                                    borderRadius: '6px',
                                                    cursor: 'pointer',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '6px',
                                                    fontSize: '13px',
                                                    fontWeight: 500,
                                                    color: '#334155',
                                                    transition: 'all 0.2s'
                                                }}
                                                onMouseEnter={(e) => {
                                                    e.currentTarget.style.backgroundColor = '#e2e8f0';
                                                    e.currentTarget.style.color = '#0f172a';
                                                }}
                                                onMouseLeave={(e) => {
                                                    e.currentTarget.style.backgroundColor = '#f1f5f9';
                                                    e.currentTarget.style.color = '#334155';
                                                }}
                                            >
                                                <ExternalLink size={14} />
                                                Access
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {managingBoard && (
                <AdminBoardMembersModal
                    boardId={managingBoard.id}
                    boardTitle={managingBoard.title}
                    onClose={() => setManagingBoard(null)}
                    onMembersChanged={fetchBoards}
                />
            )}
        </div>
    );
};
