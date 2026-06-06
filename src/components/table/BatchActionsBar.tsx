import { Trash2, Copy, Eye, EyeOff, LayoutDashboard, X, ChevronRight, ChevronDown } from 'lucide-react';
import { useBoardStore } from '../../store/useBoardStore';
import { useAuth } from '../../contexts/AuthContext';
import { useState } from 'react';

const WRITE_ROLES = ['member', 'editor', 'admin', 'owner'];

export const BatchActionsBar = () => {
    const selectedItemIds = useBoardStore(state => state.selectedItemIds);
    const clearSelection = useBoardStore(state => state.clearSelection);
    const deleteSelectedItems = useBoardStore(state => state.deleteSelectedItems);
    const duplicateSelectedItems = useBoardStore(state => state.duplicateSelectedItems);
    const hideSelectedItems = useBoardStore(state => state.hideSelectedItems);
    const unhideSelectedItems = useBoardStore(state => state.unhideSelectedItems);
    const moveSelectedItemsToTarget = useBoardStore(state => state.moveSelectedItemsToTarget);
    const showHiddenItems = useBoardStore(state => state.showHiddenItems);
    const activeBoardId = useBoardStore(state => state.activeBoardId);
    const boards = useBoardStore(state => state.boards);
    const workspaces = useBoardStore(state => state.workspaces);
    const userBoardRoles = useBoardStore(state => state.userBoardRoles);
    const userWorkspaceRoles = useBoardStore(state => state.userWorkspaceRoles);
    const loadBoardData = useBoardStore(state => state.loadBoardData);
    const { user } = useAuth();

    const [showMoveMenu, setShowMoveMenu] = useState(false);
    const [expandedBoards, setExpandedBoards] = useState<Record<string, boolean>>({});

    const handleCloseMoveMenu = () => {
        setShowMoveMenu(false);
        setExpandedBoards({});
    };

    const handleToggleBoard = (boardId: string, isDataLoaded: boolean) => {
        if (!expandedBoards[boardId] && !isDataLoaded) {
            loadBoardData(boardId);
        }
        setExpandedBoards(prev => ({ ...prev, [boardId]: !prev[boardId] }));
    };

    // Boards the user can write to
    const editableBoards = boards.filter(b => {
        const boardRole = userBoardRoles[b.id];
        if (boardRole && WRITE_ROLES.includes(boardRole)) return true;
        const ws = workspaces.find(w => w.id === b.workspaceId);
        if (ws?.owner_id === user?.id) return true;
        const wsRole = userWorkspaceRoles[b.workspaceId || ''];
        return wsRole && WRITE_ROLES.includes(wsRole);
    });

    // Group by workspace
    const boardsByWorkspace = workspaces
        .map(ws => ({
            workspace: ws,
            boards: editableBoards.filter(b => b.workspaceId === ws.id)
        }))
        .filter(ws => ws.boards.length > 0);

    if (selectedItemIds.length === 0) return null;

    return (
        <div style={{
            position: 'fixed',
            bottom: '32px',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: 'hsl(var(--color-bg-surface))',
            borderRadius: '8px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
            padding: '8px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '24px',
            zIndex: 1000,
            border: '1px solid hsl(var(--color-border))',
            minWidth: '600px',
            justifyContent: 'space-between'
        }}>
            {/* Left: Count */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                    backgroundColor: 'hsl(var(--color-brand-primary))',
                    color: 'white',
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '12px',
                    fontWeight: 600
                }}>
                    {selectedItemIds.length}
                </div>
                <span style={{ fontWeight: 600, fontSize: '14px', color: 'hsl(var(--color-text-primary))' }}>Tasks selected</span>
            </div>

            {/* Center: Actions */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div
                    className="batch-action-btn"
                    onClick={() => duplicateSelectedItems()}
                    style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', padding: '8px', borderRadius: '4px' }}
                >
                    <Copy size={16} color="hsl(var(--color-text-secondary))" />
                    <span style={{ fontSize: '12px', color: 'hsl(var(--color-text-secondary))' }}>Duplicate</span>
                </div>

                <div
                    className="batch-action-btn"
                    onClick={() => showHiddenItems ? unhideSelectedItems() : hideSelectedItems()}
                    style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', padding: '8px', borderRadius: '4px' }}
                >
                    {showHiddenItems
                        ? <Eye size={16} color="hsl(var(--color-text-secondary))" />
                        : <EyeOff size={16} color="hsl(var(--color-text-secondary))" />
                    }
                    <span style={{ fontSize: '12px', color: 'hsl(var(--color-text-secondary))' }}>{showHiddenItems ? 'Unhide' : 'Hide'}</span>
                </div>

                <div
                    className="batch-action-btn"
                    onClick={deleteSelectedItems}
                    style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', padding: '8px', borderRadius: '4px' }}
                >
                    <Trash2 size={16} color="hsl(var(--color-text-secondary))" />
                    <span style={{ fontSize: '12px', color: 'hsl(var(--color-text-secondary))' }}>Delete</span>
                </div>

                {/* Move to — with cross-workspace menu */}
                <div
                    className="batch-action-btn"
                    onClick={() => setShowMoveMenu(prev => !prev)}
                    style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', padding: '8px', borderRadius: '4px', position: 'relative' }}
                >
                    <LayoutDashboard size={16} color="hsl(var(--color-text-secondary))" />
                    <span style={{ fontSize: '12px', color: 'hsl(var(--color-text-secondary))' }}>Move to</span>

                    {showMoveMenu && (
                        <div
                            style={{
                                position: 'absolute',
                                bottom: 'calc(100% + 12px)',
                                left: '50%',
                                transform: 'translateX(-50%)',
                                backgroundColor: 'hsl(var(--color-bg-surface))',
                                borderRadius: '8px',
                                boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
                                padding: '4px',
                                minWidth: '260px',
                                maxHeight: '380px',
                                overflowY: 'auto',
                                border: '1px solid hsl(var(--color-border))',
                                textAlign: 'left'
                            }}
                            onClick={e => e.stopPropagation()}
                        >
                            <div style={{ padding: '6px 10px 4px', fontSize: '11px', fontWeight: 700, color: 'hsl(var(--color-text-secondary))', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                                Select Destination
                            </div>

                            {boardsByWorkspace.length === 0 && (
                                <div style={{ padding: '12px 10px', fontSize: '13px', color: 'hsl(var(--color-text-secondary))' }}>
                                    No accessible boards found.
                                </div>
                            )}

                            {boardsByWorkspace.map(({ workspace, boards: wsBoards }) => (
                                <div key={workspace.id}>
                                    {/* Workspace label */}
                                    <div style={{
                                        padding: '8px 10px 2px',
                                        fontSize: '10px',
                                        fontWeight: 700,
                                        color: 'hsl(var(--color-text-secondary))',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.08em'
                                    }}>
                                        {workspace.title}
                                    </div>

                                    {wsBoards.map(board => {
                                        const isExpanded = !!expandedBoards[board.id];
                                        const isCurrent = board.id === activeBoardId;
                                        return (
                                            <div key={board.id}>
                                                {/* Board row */}
                                                <div
                                                    className="move-menu-item"
                                                    onClick={() => handleToggleBoard(board.id, !!board.isDataLoaded)}
                                                    style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '6px',
                                                        padding: '7px 10px',
                                                        cursor: 'pointer',
                                                        borderRadius: '5px',
                                                        fontSize: '13px',
                                                        color: isCurrent
                                                            ? 'hsl(var(--color-brand-primary))'
                                                            : 'hsl(var(--color-text-primary))'
                                                    }}
                                                >
                                                    <LayoutDashboard size={13} style={{ flexShrink: 0 }} />
                                                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {board.title}
                                                        {isCurrent && <span style={{ fontSize: '11px', marginLeft: '4px', opacity: 0.6 }}>(current)</span>}
                                                    </span>
                                                    {isExpanded
                                                        ? <ChevronDown size={13} style={{ flexShrink: 0 }} />
                                                        : <ChevronRight size={13} style={{ flexShrink: 0 }} />
                                                    }
                                                </div>

                                                {/* Groups within board */}
                                                {isExpanded && (
                                                    board.isDataLoaded
                                                        ? board.groups.length > 0
                                                            ? board.groups.map(g => (
                                                                <div
                                                                    key={g.id}
                                                                    className="move-menu-item"
                                                                    onClick={() => {
                                                                        moveSelectedItemsToTarget(g.id, board.id);
                                                                        handleCloseMoveMenu();
                                                                    }}
                                                                    style={{
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        gap: '8px',
                                                                        padding: '6px 10px 6px 30px',
                                                                        cursor: 'pointer',
                                                                        borderRadius: '5px',
                                                                        fontSize: '13px',
                                                                        color: 'hsl(var(--color-text-primary))'
                                                                    }}
                                                                >
                                                                    <div style={{ width: 9, height: 9, borderRadius: '50%', backgroundColor: g.color, flexShrink: 0 }} />
                                                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.title}</span>
                                                                </div>
                                                            ))
                                                            : <div style={{ padding: '6px 10px 6px 30px', fontSize: '12px', color: 'hsl(var(--color-text-secondary))' }}>No groups</div>
                                                        : <div style={{ padding: '6px 10px 6px 30px', fontSize: '12px', color: 'hsl(var(--color-text-secondary))' }}>Loading…</div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Right: Close */}
            <button
                onClick={clearSelection}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '4px' }}
            >
                <X size={20} color="hsl(var(--color-text-secondary))" />
            </button>

            <style>{`
                .batch-action-btn:hover {
                    background-color: hsl(var(--color-bg-hover));
                }
                .batch-action-btn:hover svg {
                    color: hsl(var(--color-text-primary)) !important;
                }
                .batch-action-btn:hover span {
                    color: hsl(var(--color-text-primary)) !important;
                }
                .move-menu-item:hover {
                    background-color: hsl(var(--color-bg-hover));
                }
            `}</style>
        </div>
    );
};
