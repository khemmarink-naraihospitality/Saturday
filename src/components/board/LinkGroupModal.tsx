import { useMemo, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, LayoutDashboard, ChevronRight, ChevronDown, Link2, AlertTriangle } from 'lucide-react';
import { useBoardStore } from '../../store/useBoardStore';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';

const WRITE_ROLES = ['member', 'editor', 'admin', 'owner'];

interface LinkGroupModalProps {
    onClose: () => void;
}

type Step = 'pick-group' | 'confirm';

interface SelectedSource {
    sourceBoardId: string;
    sourceGroupId: string;
    sourceGroupTitle: string;
    sourceBoardTitle: string;
}

export const LinkGroupModal = ({ onClose }: LinkGroupModalProps) => {
    const { user } = useAuth();
    const boards = useBoardStore(state => state.boards);
    const workspaces = useBoardStore(state => state.workspaces);
    const userBoardRoles = useBoardStore(state => state.userBoardRoles);
    const userWorkspaceRoles = useBoardStore(state => state.userWorkspaceRoles);
    const activeBoardId = useBoardStore(state => state.activeBoardId);
    const loadBoardData = useBoardStore(state => state.loadBoardData);
    const linkGroupToOther = useBoardStore(state => state.linkGroupToOther);

    const [step, setStep] = useState<Step>('pick-group');
    const [expandedBoards, setExpandedBoards] = useState<Record<string, boolean>>({});
    const [alreadyLinkedGroupIds, setAlreadyLinkedGroupIds] = useState<Set<string>>(new Set());
    const [selected, setSelected] = useState<SelectedSource | null>(null);
    const [newGroupTitle, setNewGroupTitle] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    useEffect(() => {
        supabase.from('group_links').select('group_a_id, group_b_id').then(({ data }) => {
            const ids = new Set<string>();
            (data || []).forEach(l => { ids.add(l.group_a_id); ids.add(l.group_b_id); });
            setAlreadyLinkedGroupIds(ids);
        });
    }, []);

    const editableBoards = useMemo(() => boards.filter(b => {
        if (b.id === activeBoardId) return false;
        if (b.is_archived) return false;
        const boardRole = userBoardRoles[b.id];
        if (boardRole && WRITE_ROLES.includes(boardRole)) return true;
        const ws = workspaces.find(w => w.id === b.workspaceId);
        if (ws?.owner_id === user?.id) return true;
        const wsRole = userWorkspaceRoles[b.workspaceId || ''];
        return wsRole ? WRITE_ROLES.includes(wsRole) : false;
    }), [boards, workspaces, userBoardRoles, userWorkspaceRoles, user?.id, activeBoardId]);

    const boardsByWorkspace = useMemo(() => workspaces
        .map(ws => ({ workspace: ws, boards: editableBoards.filter(b => b.workspaceId === ws.id) }))
        .filter(ws => ws.boards.length > 0), [workspaces, editableBoards]);

    const handleToggleBoard = (boardId: string, isDataLoaded: boolean) => {
        if (!expandedBoards[boardId] && !isDataLoaded) {
            loadBoardData(boardId);
        }
        setExpandedBoards(prev => ({ ...prev, [boardId]: !prev[boardId] }));
    };

    const handlePickGroup = (boardId: string, boardTitle: string, groupId: string, groupTitle: string) => {
        setSelected({ sourceBoardId: boardId, sourceGroupId: groupId, sourceGroupTitle: groupTitle, sourceBoardTitle: boardTitle });
        setNewGroupTitle(groupTitle);
        setStep('confirm');
    };

    const handleConfirm = async () => {
        if (!selected || !newGroupTitle.trim()) return;

        setIsSubmitting(true);
        setErrorMessage(null);
        const result = await linkGroupToOther(selected.sourceBoardId, selected.sourceGroupId, newGroupTitle.trim());
        setIsSubmitting(false);
        if (result.success) {
            onClose();
        } else {
            setErrorMessage(result.error || 'Failed to create the link.');
        }
    };

    return createPortal(
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
            <div style={{
                backgroundColor: 'hsl(var(--color-bg-surface))',
                borderRadius: '8px',
                width: '480px',
                maxWidth: '90vw',
                maxHeight: '85vh',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
                border: '1px solid hsl(var(--color-border))',
                overflow: 'hidden'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid hsl(var(--color-border))' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Link2 size={18} />
                        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>Link to other group</h3>
                    </div>
                    <button onClick={onClose} className="icon-btn"><X size={20} /></button>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
                    {step === 'pick-group' && (
                        <>
                            <p style={{ fontSize: '13px', color: 'hsl(var(--color-text-secondary))', marginTop: 0, marginBottom: '12px' }}>
                                Pick a group from another board to link with. Any of the source board's columns this board doesn't already have will be added automatically.
                            </p>
                            {boardsByWorkspace.length === 0 && (
                                <div style={{ padding: '12px', fontSize: '13px', color: 'hsl(var(--color-text-secondary))' }}>No accessible boards found.</div>
                            )}
                            {boardsByWorkspace.map(({ workspace, boards: wsBoards }) => (
                                <div key={workspace.id} style={{ marginBottom: '8px' }}>
                                    <div style={{ padding: '6px 4px 2px', fontSize: '11px', fontWeight: 700, color: 'hsl(var(--color-text-secondary))', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                        {workspace.title}
                                    </div>
                                    {wsBoards.map(board => {
                                        const isExpanded = !!expandedBoards[board.id];
                                        return (
                                            <div key={board.id}>
                                                <div
                                                    onClick={() => handleToggleBoard(board.id, !!board.isDataLoaded)}
                                                    style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 8px', cursor: 'pointer', borderRadius: '5px', fontSize: '13px' }}
                                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-hover))'}
                                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                                >
                                                    <LayoutDashboard size={13} style={{ flexShrink: 0 }} />
                                                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{board.title}</span>
                                                    {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                                                </div>
                                                {isExpanded && (
                                                    board.isDataLoaded
                                                        ? board.groups.filter(g => !alreadyLinkedGroupIds.has(g.id)).length > 0
                                                            ? board.groups.filter(g => !alreadyLinkedGroupIds.has(g.id)).map(g => (
                                                                <div
                                                                    key={g.id}
                                                                    onClick={() => handlePickGroup(board.id, board.title, g.id, g.title)}
                                                                    style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px 6px 28px', cursor: 'pointer', borderRadius: '5px', fontSize: '13px' }}
                                                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-hover))'}
                                                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                                                >
                                                                    <div style={{ width: 9, height: 9, borderRadius: '50%', backgroundColor: g.color, flexShrink: 0 }} />
                                                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.title}</span>
                                                                </div>
                                                            ))
                                                            : <div style={{ padding: '6px 8px 6px 28px', fontSize: '12px', color: 'hsl(var(--color-text-secondary))' }}>No linkable groups</div>
                                                        : <div style={{ padding: '6px 8px 6px 28px', fontSize: '12px', color: 'hsl(var(--color-text-secondary))' }}>Loading…</div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            ))}
                        </>
                    )}

                    {step === 'confirm' && selected && (
                        <>
                            <p style={{ fontSize: '13px', color: 'hsl(var(--color-text-secondary))', marginTop: 0 }}>
                                Linking to <strong>{selected.sourceGroupTitle}</strong> in board <strong>{selected.sourceBoardTitle}</strong>.
                            </p>
                            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px', marginTop: '12px' }}>New group name</label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', borderRadius: '4px', border: '1px solid hsl(var(--color-border))', fontSize: '14px', backgroundColor: 'hsl(var(--color-bg-hover))', color: 'hsl(var(--color-text-secondary))' }}>
                                <Link2 size={14} style={{ flexShrink: 0 }} />
                                {newGroupTitle}
                            </div>
                            <p style={{ fontSize: '12px', color: 'hsl(var(--color-text-tertiary))', marginTop: '4px', marginBottom: '16px' }}>
                                The linked group keeps the same name as its source so the two stay easy to identify together.
                            </p>

                            <div style={{ display: 'flex', gap: '10px', padding: '12px', borderRadius: '6px', backgroundColor: 'hsl(var(--color-bg-hover))', border: '1px solid hsl(var(--color-border))' }}>
                                <AlertTriangle size={18} color="hsl(var(--color-text-secondary))" style={{ flexShrink: 0, marginTop: '1px' }} />
                                <div style={{ fontSize: '12px', color: 'hsl(var(--color-text-secondary))', lineHeight: 1.5 }}>
                                    Any columns from <strong>{selected.sourceBoardTitle}</strong> that this board doesn't already have will be added so every field syncs — this affects the whole board, so the new columns will also appear (empty) on every other group here. Existing columns and data are never changed or removed.
                                </div>
                            </div>

                            {errorMessage && (
                                <div style={{ marginTop: '12px', fontSize: '13px', color: '#e11d48' }}>{errorMessage}</div>
                            )}
                        </>
                    )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 20px', borderTop: '1px solid hsl(var(--color-border))' }}>
                    <button
                        onClick={() => step === 'confirm' ? setStep('pick-group') : onClose()}
                        style={{ padding: '8px 16px', borderRadius: '4px', border: '1px solid hsl(var(--color-border))', background: 'transparent', cursor: 'pointer', fontSize: '13px' }}
                    >
                        {step === 'pick-group' ? 'Cancel' : 'Back'}
                    </button>

                    {step === 'confirm' && (
                        <button
                            onClick={handleConfirm}
                            disabled={isSubmitting || !newGroupTitle.trim()}
                            className="btn-primary"
                            style={{ padding: '8px 16px', borderRadius: '4px', cursor: (isSubmitting || !newGroupTitle.trim()) ? 'not-allowed' : 'pointer', fontSize: '13px', opacity: (isSubmitting || !newGroupTitle.trim()) ? 0.7 : 1 }}
                        >
                            {isSubmitting ? 'Linking...' : 'Confirm & Link'}
                        </button>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
};
