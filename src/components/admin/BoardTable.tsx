import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { Search, RefreshCw, ExternalLink, Users, Trash2 } from 'lucide-react';
import { useUserStore } from '../../store/useUserStore';
import { useBoardStore } from '../../store/useBoardStore';
import { slugify, buildBoardSlug } from '../../lib/utils';
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
    is_archived: boolean;
}

export const BoardTable = () => {
    const { currentUser } = useUserStore();
    const canDelete = currentUser.system_role === 'super_admin';
    const [boards, setBoards] = useState<BoardRow[]>([]);
    const [filteredBoards, setFilteredBoards] = useState<BoardRow[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [showDeleted, setShowDeleted] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [managingBoard, setManagingBoard] = useState<{ id: string; title: string } | null>(null);
    const [deletePopover, setDeletePopover] = useState<{
        boardId: string;
        boardTitle: string;
        workspaceId: string;
        top: number;
        left: number;
    } | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const fetchBoards = async () => {
        setLoading(true);
        setError(null);
        try {
            // Fetch boards with workspace and owner info (owner comes from workspace).
            //
            // Deleting a board archives the row rather than removing it, and these
            // stay listed on purpose: a user can own nothing but deleted boards, and
            // an admin looking them up still needs to find them. They're marked as
            // deleted in the row instead, because shown-as-normal made "Access" look
            // broken — the deep link resolver deliberately refuses an archived board,
            // so the new tab just landed somewhere else with no explanation.
            const { data, error: fetchError } = await supabase
                .from('boards')
                .select(`
                    id,
                    title,
                    created_at,
                    workspace_id,
                    is_archived,
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
                members: membersByBoard[board.id] || [],
                is_archived: !!board.is_archived
            }));

            setBoards(mapped);
            setFilteredBoards(mapped);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteClick = (board: BoardRow, e: React.MouseEvent) => {
        if (!canDelete || board.is_archived) return;
        const rect = e.currentTarget.getBoundingClientRect();
        let left = rect.right - 260;
        if (left < 10) left = 10;
        setDeletePopover({
            boardId: board.id,
            boardTitle: board.title,
            workspaceId: board.workspace_id,
            top: rect.bottom + 4,
            left
        });
    };

    const handleConfirmDelete = async () => {
        if (!deletePopover) return;
        const { boardId, boardTitle, workspaceId } = deletePopover;
        setDeletingId(boardId);
        setDeletePopover(null);
        try {
            await supabase.from('boards').update({ is_archived: true }).eq('id', boardId);
            await useBoardStore.getState().logActivity('board_deleted', 'workspace', workspaceId, {
                workspace_id: workspaceId,
                board_title: boardTitle
            });
            // Stays in the list, now flagged as deleted, rather than vanishing —
            // same as any other already-deleted board here.
            const markDeleted = (rows: BoardRow[]) =>
                rows.map(b => b.id === boardId ? { ...b, is_archived: true } : b);
            setBoards(markDeleted);
            setFilteredBoards(markDeleted);
        } finally {
            setDeletingId(null);
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
            // Owner here is the *workspace* owner, so searching a person only ever
            // found boards in a workspace they happen to own — never the boards
            // they were actually added to. Looking someone up by the email printed
            // in the Owner column didn't work either, since only the name was
            // matched. Both now count, alongside the board's own members.
            const matches = (value: string | null | undefined) =>
                !!value && value.toLowerCase().includes(query);

            setFilteredBoards(
                boards.filter(board =>
                    matches(board.title) ||
                    matches(board.owner_name) ||
                    matches(board.owner_email) ||
                    matches(board.workspace_title) ||
                    board.members.some(m => matches(m.full_name) || matches(m.email))
                )
            );
        }
    }, [searchQuery, boards]);

    // Deleted boards are hidden by default — they're the majority of the table
    // and can't be opened anyway, so they only get in the way of the usual job
    // of finding a live board. They stay one toggle away rather than gone,
    // because a user can own nothing but deleted boards and still need looking up.
    const visibleBoards = showDeleted ? filteredBoards : filteredBoards.filter(b => !b.is_archived);
    const hiddenDeletedCount = showDeleted ? 0 : filteredBoards.length - visibleBoards.length;

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
                <label
                    title="Deleted boards live in Trash and can't be opened until restored"
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        marginRight: '12px',
                        fontSize: '13px',
                        color: '#475569',
                        cursor: 'pointer',
                        userSelect: 'none',
                        whiteSpace: 'nowrap'
                    }}
                >
                    <input
                        type="checkbox"
                        checked={showDeleted}
                        onChange={(e) => setShowDeleted(e.target.checked)}
                        style={{ width: '15px', height: '15px', cursor: 'pointer', accentColor: '#4f46e5' }}
                    />
                    Show deleted boards
                    {hiddenDeletedCount > 0 && (
                        <span style={{ color: '#94a3b8' }}>({hiddenDeletedCount} hidden)</span>
                    )}
                </label>
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
                                {/* Says "workspace owner" because that's what it is — the
                                    boards table has no owner of its own. Labelled plain
                                    "Owner" it read as the person who runs the board, which
                                    is often someone else entirely in the Members column. */}
                                <th style={{ padding: '12px 20px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Workspace Owner</th>
                                <th style={{ padding: '12px 20px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Members</th>
                                <th style={{ padding: '12px 20px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Created</th>
                                <th style={{ padding: '12px 20px', textAlign: 'right', fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {visibleBoards.length === 0 ? (
                                <tr>
                                    <td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                                        {/* Without this, a search that only matches deleted boards reads
                                            as "this user has no boards at all", which is a different and
                                            much more alarming thing than "they're all in Trash". */}
                                        {hiddenDeletedCount > 0
                                            ? `No live boards found — ${hiddenDeletedCount} deleted ${hiddenDeletedCount === 1 ? 'board matches' : 'boards match'}. Tick "Show deleted boards" to see them.`
                                            : 'No boards found'}
                                    </td>
                                </tr>
                            ) : (
                                visibleBoards.map((board) => (
                                    <tr key={board.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                        <td style={{ padding: '16px 20px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <div style={{ fontWeight: 500, color: board.is_archived ? '#64748b' : '#0f172a', fontSize: '14px' }}>{board.title}</div>
                                                {board.is_archived && (
                                                    <span
                                                        title="This board was deleted — restore it from Trash to open it again"
                                                        style={{
                                                            fontSize: '11px',
                                                            fontWeight: 600,
                                                            color: '#b91c1c',
                                                            backgroundColor: '#fee2e2',
                                                            border: '1px solid #fecaca',
                                                            borderRadius: '4px',
                                                            padding: '1px 6px',
                                                            whiteSpace: 'nowrap'
                                                        }}
                                                    >
                                                        Deleted
                                                    </span>
                                                )}
                                            </div>
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
                                                // Names on hover, so a row that matched a
                                                // search on a member shows why it matched
                                                // instead of just a row of avatars.
                                                title={board.members.length > 0
                                                    ? `Manage members — ${board.members.map(m => m.full_name || m.email).join(', ')}`
                                                    : 'Manage members'}
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
                                                    const bName = buildBoardSlug(board.title, board.id);
                                                    const url = `/${username}/${wsName}/${bName}`;
                                                    window.open(url, '_blank');
                                                }}
                                                disabled={board.is_archived}
                                                title={board.is_archived
                                                    ? 'This board is deleted — restore it from Trash to open it'
                                                    : 'Open board in a new tab'}
                                                style={{
                                                    padding: '6px 12px',
                                                    backgroundColor: '#f1f5f9',
                                                    border: '1px solid #cbd5e1',
                                                    borderRadius: '6px',
                                                    cursor: board.is_archived ? 'not-allowed' : 'pointer',
                                                    opacity: board.is_archived ? 0.45 : 1,
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '6px',
                                                    fontSize: '13px',
                                                    fontWeight: 500,
                                                    color: '#334155',
                                                    transition: 'all 0.2s'
                                                }}
                                                onMouseEnter={(e) => {
                                                    if (board.is_archived) return;
                                                    e.currentTarget.style.backgroundColor = '#e2e8f0';
                                                    e.currentTarget.style.color = '#0f172a';
                                                }}
                                                onMouseLeave={(e) => {
                                                    if (board.is_archived) return;
                                                    e.currentTarget.style.backgroundColor = '#f1f5f9';
                                                    e.currentTarget.style.color = '#334155';
                                                }}
                                            >
                                                <ExternalLink size={14} />
                                                Access
                                            </button>
                                            <button
                                                onClick={(e) => handleDeleteClick(board, e)}
                                                disabled={!canDelete || board.is_archived || deletingId === board.id}
                                                title={board.is_archived
                                                    ? 'Already deleted — manage it under Trash'
                                                    : (canDelete ? 'Delete board' : 'Only Super Admin can delete')}
                                                style={{
                                                    marginLeft: '8px',
                                                    padding: '6px 12px',
                                                    backgroundColor: canDelete && !board.is_archived ? '#fef2f2' : '#f8fafc',
                                                    border: canDelete && !board.is_archived ? '1px solid #fecaca' : '1px solid #e2e8f0',
                                                    borderRadius: '6px',
                                                    cursor: canDelete && !board.is_archived && deletingId !== board.id ? 'pointer' : 'not-allowed',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '6px',
                                                    fontSize: '13px',
                                                    fontWeight: 500,
                                                    color: canDelete && !board.is_archived ? '#dc2626' : '#94a3b8',
                                                    opacity: deletingId === board.id ? 0.6 : 1,
                                                    transition: 'all 0.2s'
                                                }}
                                                onMouseEnter={(e) => {
                                                    if (!canDelete || board.is_archived) return;
                                                    e.currentTarget.style.backgroundColor = '#fee2e2';
                                                }}
                                                onMouseLeave={(e) => {
                                                    if (!canDelete || board.is_archived) return;
                                                    e.currentTarget.style.backgroundColor = '#fef2f2';
                                                }}
                                            >
                                                <Trash2 size={14} />
                                                {deletingId === board.id ? 'Deleting...' : 'Delete'}
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

            {deletePopover && createPortal(
                <>
                    <div
                        style={{ position: 'fixed', inset: 0, zIndex: 9999 }}
                        onClick={() => setDeletePopover(null)}
                    />
                    <div style={{
                        position: 'fixed',
                        top: deletePopover.top,
                        left: deletePopover.left,
                        zIndex: 10000,
                        backgroundColor: 'white',
                        padding: '16px',
                        borderRadius: '8px',
                        boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
                        border: '1px solid #e2e8f0',
                        width: '260px'
                    }}>
                        <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: 600 }}>
                            Delete "{deletePopover.boardTitle}"?
                        </h4>
                        <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: '#64748b' }}>
                            The board will be moved to Trash and can be restored later by a Super Admin.
                        </p>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <button
                                onClick={() => setDeletePopover(null)}
                                style={{
                                    padding: '6px 12px',
                                    border: '1px solid #e2e8f0',
                                    backgroundColor: 'white',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    fontSize: '13px'
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleConfirmDelete}
                                style={{
                                    padding: '6px 12px',
                                    border: 'none',
                                    backgroundColor: '#dc2626',
                                    color: 'white',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    fontSize: '13px',
                                    fontWeight: 500
                                }}
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </>,
                document.body
            )}
        </div>
    );
};
