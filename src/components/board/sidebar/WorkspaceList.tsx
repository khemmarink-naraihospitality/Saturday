import { useState, useEffect } from 'react';
import { LayoutDashboard, Plus, Trash2, Edit2, Copy, ChevronRight, Users, MoreHorizontal } from 'lucide-react';
import { clsx } from 'clsx';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent
} from '@dnd-kit/core';
import {
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy
} from '@dnd-kit/sortable';

import { useBoardStore } from '../../../store/useBoardStore';
import { useUserStore } from '../../../store/useUserStore';
import { usePermission } from '../../../hooks/usePermission';
import { ConfirmModal } from '../../ui/ConfirmModal';
import { ShareWorkspaceModal } from '../../workspace/ShareWorkspaceModal';
import { ShareBoardModal } from '../../workspace/ShareBoardModal';
import { BoardIcon, WorkspaceIcon } from './SidebarIcons';
import { SortableBoardItem } from './SortableBoardItem';

interface WorkspaceListProps {
    activeTab: 'my-workspaces' | 'shared';
    searchQuery: string;
}

export const WorkspaceList = ({ activeTab, searchQuery }: WorkspaceListProps) => {
    const {
        boards, activeBoardId, addBoard, setActiveBoard, deleteBoard, updateBoard, moveBoard, duplicateBoardToWorkspace, moveBoardToWorkspace,
        workspaces, activeWorkspaceId, setActiveWorkspace, deleteWorkspace, updateWorkspace, sharedBoardIds, sharedWorkspaceIds
    } = useBoardStore();

    const { currentUser } = useUserStore();
    const { can } = usePermission();
    const user = currentUser;

    const [creatingBoardInWorkspaceId, setCreatingBoardInWorkspaceId] = useState<string | null>(null);
    const [newBoardTitle, setNewBoardTitle] = useState('');

    // Deletion State
    const [boardToDelete, setBoardToDelete] = useState<string | null>(null);
    const [workspaceToDelete, setWorkspaceToDelete] = useState<string | null>(null);

    // Renaming State
    const [editingBoardId, setEditingBoardId] = useState<string | null>(null);
    const [editTitle, setEditTitle] = useState('');

    // Workspace Renaming
    const [editingWorkspaceId, setEditingWorkspaceId] = useState<string | null>(null);
    const [editWorkspaceTitle, setEditWorkspaceTitle] = useState('');

    // Context Menus
    const [activeBoardMenu, setActiveBoardMenu] = useState<string | null>(null);
    const [activeWorkspaceMenu, setActiveWorkspaceMenu] = useState<string | null>(null);
    const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
    const [activeSubmenu, setActiveSubmenu] = useState<'move' | 'duplicate' | null>(null);

    // Share workspace modal
    const [shareWorkspaceId, setShareWorkspaceId] = useState<string | null>(null);
    const [shareBoardId, setShareBoardId] = useState<string | null>(null);

    // Tree expansion state
    const [expandedWorkspaces, setExpandedWorkspaces] = useState<Set<string>>(new Set([workspaces[0]?.id].filter(Boolean)));
    const searchActive = searchQuery.trim().length > 0;

    const toggleWorkspace = (wsId: string) => {
        const next = new Set(expandedWorkspaces);
        if (next.has(wsId)) next.delete(wsId);
        else next.add(wsId);
        setExpandedWorkspaces(next);
    };

    // Filter workspaces based on active tab and search query
    const filteredWorkspaces = (activeTab === 'my-workspaces'
        ? workspaces.filter(w => {
            const isOwner = w.owner_id === user?.id;
            const isWorkspaceShared = sharedWorkspaceIds.includes(w.id);
            const containsSharedBoard = boards.some(b => b.workspaceId === w.id && sharedBoardIds.includes(b.id));
            return isOwner || isWorkspaceShared || containsSharedBoard;
        })
        : workspaces.filter(w => {
            if (w.owner_id === user?.id) return false;
            const isWorkspaceShared = sharedWorkspaceIds.includes(w.id);
            const containsSharedBoard = boards.some(b => b.workspaceId === w.id && sharedBoardIds.includes(b.id));
            return isWorkspaceShared || containsSharedBoard;
        })
    ).filter(w => {
        if (!searchQuery.trim()) return true;
        const wsMatch = w.title.toLowerCase().includes(searchQuery.toLowerCase());
        const boardMatch = boards.some(b => b.workspaceId === w.id && b.title.toLowerCase().includes(searchQuery.toLowerCase()));
        return wsMatch || boardMatch;
    });

    const allAccessibleWorkspaces = workspaces.filter((w, index, self) => {
        const isAccessible = w.owner_id === user?.id ||
            sharedWorkspaceIds.includes(w.id) ||
            boards.some(b => b.workspaceId === w.id && sharedBoardIds.includes(b.id));

        return isAccessible && self.findIndex(i => i.id === w.id) === index;
    });

    // Auto-expand on search
    useEffect(() => {
        if (searchActive) {
            const matches = filteredWorkspaces.map(ws => ws.id);
            setExpandedWorkspaces(prev => {
                const next = new Set(prev);
                matches.forEach(id => next.add(id));
                return next;
            });
        }
    }, [searchQuery, searchActive, filteredWorkspaces]); // Dependencies fixed

    // Close menus on outside click
    useEffect(() => {
        const handleClickOutside = () => {
            setActiveBoardMenu(null);
            setActiveWorkspaceMenu(null);
        };
        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, []);

    const handleRename = (boardId: string) => {
        if (editTitle.trim()) {
            updateBoard(boardId, { title: editTitle });
        }
        setEditingBoardId(null);
    };

    const handleRenameWorkspace = (wsId: string) => {
        if (editWorkspaceTitle.trim()) {
            updateWorkspace(wsId, editWorkspaceTitle);
        }
        setEditingWorkspaceId(null);
    };

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (active.id !== over?.id && over) {
            moveBoard(active.id as string, over.id as string);
        }
    };

    return (
        <div className="sidebar-content" style={{ padding: '0' }}>
            <div className="tree-container">
                {filteredWorkspaces.map(ws => {
                    const isExpanded = expandedWorkspaces.has(ws.id);
                    const isActive = activeWorkspaceId === ws.id;

                    const wsBoards = boards.filter(b => {
                        if (b.workspaceId !== ws.id) return false;

                        const isAccessible = ws.owner_id === user?.id || sharedWorkspaceIds.includes(ws.id) || sharedBoardIds.includes(b.id);
                        if (!isAccessible) return false;

                        if (searchQuery.trim()) {
                            const workspaceMatches = ws.title.toLowerCase().includes(searchQuery.toLowerCase());
                            if (workspaceMatches) return true;
                            return b.title.toLowerCase().includes(searchQuery.toLowerCase());
                        }
                        return true;
                    });

                    return (
                        <div key={ws.id} className="tree-node">
                            {/* Workspace Header */}
                            <div
                                className={clsx('tree-node-parent', { expanded: isExpanded, active: isActive })}
                                style={{
                                    backgroundColor: isActive ? 'hsl(var(--color-brand-light))' : 'transparent',
                                    color: isActive ? 'hsl(var(--color-brand-primary))' : 'hsl(var(--color-text-primary))',
                                }}
                                onClick={() => {
                                    toggleWorkspace(ws.id);
                                    setActiveWorkspace(ws.id);
                                }}
                            >
                                <WorkspaceIcon title={ws.title} isActive={isExpanded} />
                                {editingWorkspaceId === ws.id ? (
                                    <input
                                        autoFocus
                                        type="text"
                                        className="sidebar-item-input"
                                        style={{ margin: 0, padding: '2px 4px', flex: 1 }}
                                        value={editWorkspaceTitle}
                                        onChange={(e) => setEditWorkspaceTitle(e.target.value)}
                                        onBlur={() => handleRenameWorkspace(ws.id)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') handleRenameWorkspace(ws.id);
                                            if (e.key === 'Escape') setEditingWorkspaceId(null);
                                        }}
                                        onClick={(e) => e.stopPropagation()}
                                    />
                                ) : (
                                    <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {ws.title}
                                    </span>
                                )}

                                {/* Workspace Actions */}
                                <div className="sidebar-item-action" onClick={(e) => e.stopPropagation()}>
                                    <MoreHorizontal
                                        size={14}
                                        onClick={(e) => {
                                            const rect = e.currentTarget.getBoundingClientRect();
                                            setMenuPosition({ top: rect.bottom, left: rect.left });
                                            setActiveWorkspaceMenu(activeWorkspaceMenu === ws.id ? null : ws.id);
                                            setActiveBoardMenu(null);
                                        }}
                                    />
                                </div>

                                <ChevronRight size={16} className="chevron" />
                            </div>

                            {/* Expanded Content */}
                            {isExpanded && (
                                <div className="tree-node-children">
                                    <DndContext
                                        sensors={sensors}
                                        collisionDetection={closestCenter}
                                        onDragEnd={handleDragEnd}
                                    >
                                        <SortableContext
                                            items={wsBoards.map(b => b.id)}
                                            strategy={verticalListSortingStrategy}
                                        >
                                            {wsBoards.map((board, index) => (
                                                <SortableBoardItem
                                                    key={board.id}
                                                    board={board}
                                                    activeBoardId={activeBoardId}
                                                    setActiveBoard={setActiveBoard}
                                                    editingBoardId={editingBoardId}
                                                    setEditingBoardId={setEditingBoardId}
                                                    editTitle={editTitle}
                                                    setEditTitle={setEditTitle}
                                                    handleRename={handleRename}
                                                    handleContextMenu={(e, id, rect) => {
                                                        e.stopPropagation();
                                                        setMenuPosition({ top: rect.bottom, left: rect.left });
                                                        setActiveBoardMenu(activeBoardMenu === id ? null : id);
                                                        setActiveWorkspaceMenu(null);
                                                    }}
                                                    can={can as any}
                                                    isLastChild={index === wsBoards.length - 1}
                                                />
                                            ))}
                                        </SortableContext>
                                    </DndContext>

                                    {/* Add Board Button Inside Tree */}
                                    {!searchActive && (
                                        <div className="tree-node-leaf last-child">
                                            {creatingBoardInWorkspaceId === ws.id ? (
                                                <div className="tree-sidebar-item" style={{ paddingLeft: '4px', cursor: 'default' }}>
                                                    <BoardIcon size={16} style={{ color: '#0073ea' }} />
                                                    <form
                                                        onSubmit={(e) => {
                                                            e.preventDefault();
                                                            if (newBoardTitle.trim()) {
                                                                addBoard(newBoardTitle);
                                                                setNewBoardTitle('');
                                                                setCreatingBoardInWorkspaceId(null);
                                                            }
                                                        }}
                                                        style={{ flex: 1, display: 'flex' }}
                                                    >
                                                        <input
                                                            autoFocus
                                                            type="text"
                                                            placeholder="New Board"
                                                            className="sidebar-item-input"
                                                            style={{ margin: 0, padding: '2px 4px', width: '100%' }}
                                                            value={newBoardTitle}
                                                            onChange={(e) => setNewBoardTitle(e.target.value)}
                                                            onBlur={() => {
                                                                if (newBoardTitle.trim()) {
                                                                    addBoard(newBoardTitle);
                                                                    setNewBoardTitle('');
                                                                }
                                                                setCreatingBoardInWorkspaceId(null);
                                                            }}
                                                        />
                                                    </form>
                                                </div>
                                            ) : (
                                                <div
                                                    className="tree-sidebar-item"
                                                    style={{ color: 'hsl(var(--color-brand-primary))', opacity: 0.8 }}
                                                    onClick={() => {
                                                        setActiveWorkspace(ws.id);
                                                        setCreatingBoardInWorkspaceId(ws.id);
                                                    }}
                                                >
                                                    <Plus size={14} />
                                                    <span>Add board</span>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}

                {filteredWorkspaces.length === 0 && (
                    <div style={{ padding: '32px 16px', textAlign: 'center', color: 'hsl(var(--color-text-secondary))', fontSize: '13px' }}>
                        No workspaces found
                    </div>
                )}
            </div>

            {/* Board Context Menu */}
            {activeBoardMenu && (
                <div className="context-menu" style={{
                    position: 'fixed',
                    top: menuPosition.top,
                    left: menuPosition.left,
                    backgroundColor: 'white',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    borderRadius: '4px',
                    padding: '4px',
                    zIndex: 9999,
                    width: '200px'
                }} onClick={(e) => e.stopPropagation()}
                    onMouseLeave={() => setActiveSubmenu(null)}
                >
                    <div className="menu-item" onClick={() => {
                        const b = boards.find(b => b.id === activeBoardMenu);
                        if (b) {
                            setEditingBoardId(b.id);
                            setEditTitle(b.title);
                        }
                        setActiveBoardMenu(null);
                    }} onMouseEnter={() => setActiveSubmenu(null)}>
                        <Edit2 size={14} /> Rename
                    </div>

                    <div className="menu-item" onClick={() => {
                        setShareBoardId(activeBoardMenu);
                        setActiveBoardMenu(null);
                    }} onMouseEnter={() => setActiveSubmenu(null)}>
                        <Users size={14} /> Share
                    </div>

                    {/* Move To Submenu */}
                    <div
                        className="menu-item"
                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative' }}
                        onMouseEnter={() => setActiveSubmenu('move')}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <LayoutDashboard size={14} /> Move to
                        </div>
                        <ChevronRight size={14} />

                        {activeSubmenu === 'move' && (
                            <div style={{
                                position: 'absolute',
                                left: '100%',
                                top: 0,
                                width: '180px',
                                backgroundColor: 'hsl(var(--color-bg-surface))',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                                borderRadius: '4px',
                                padding: '4px',
                                marginLeft: '4px',
                                maxHeight: '200px',
                                overflowY: 'auto',
                                border: '1px solid hsl(var(--color-border))'
                            }}>
                                {allAccessibleWorkspaces.map(ws => (
                                    <div
                                        key={ws.id}
                                        className="menu-item"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            moveBoardToWorkspace(activeBoardMenu, ws.id);
                                            setActiveBoardMenu(null);
                                            setActiveSubmenu(null);
                                        }}
                                    >
                                        {ws.title}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Duplicate To Submenu */}
                    <div
                        className="menu-item"
                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative' }}
                        onMouseEnter={() => setActiveSubmenu('duplicate')}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Copy size={14} /> Duplicate to
                        </div>
                        <ChevronRight size={14} />

                        {activeSubmenu === 'duplicate' && (
                            <div style={{
                                position: 'absolute',
                                left: '100%',
                                top: 0,
                                width: '180px',
                                backgroundColor: 'hsl(var(--color-bg-surface))',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                                borderRadius: '4px',
                                padding: '4px',
                                marginLeft: '4px',
                                maxHeight: '200px',
                                overflowY: 'auto',
                                border: '1px solid hsl(var(--color-border))'
                            }}>
                                {allAccessibleWorkspaces.map(ws => (
                                    <div
                                        key={ws.id}
                                        className="menu-item"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            duplicateBoardToWorkspace(activeBoardMenu, ws.id);
                                            setActiveBoardMenu(null);
                                            setActiveSubmenu(null);
                                        }}
                                    >
                                        {ws.title}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="menu-item delete" onClick={() => {
                        setBoardToDelete(activeBoardMenu);
                        setActiveBoardMenu(null);
                    }} onMouseEnter={() => setActiveSubmenu(null)}>
                        <Trash2 size={14} /> Delete
                    </div>
                </div>
            )}

            {/* Workspace Context Menu */}
            {activeWorkspaceMenu && (
                <div className="context-menu" style={{
                    position: 'fixed',
                    top: menuPosition.top,
                    left: menuPosition.left,
                    backgroundColor: 'hsl(var(--color-bg-surface))',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    borderRadius: '4px',
                    padding: '4px',
                    zIndex: 9999,
                    width: '180px',
                    border: '1px solid hsl(var(--color-border))'
                }} onClick={(e) => e.stopPropagation()}>
                    <div className="menu-item" onClick={() => {
                        setShareWorkspaceId(activeWorkspaceMenu);
                        setActiveWorkspaceMenu(null);
                    }}>
                        <Users size={14} /> Share
                    </div>
                    <div className="menu-item" onClick={() => {
                        const ws = workspaces.find(w => w.id === activeWorkspaceMenu);
                        if (ws) {
                            setEditingWorkspaceId(ws.id);
                            setEditWorkspaceTitle(ws.title);
                        }
                        setActiveWorkspaceMenu(null);
                    }} >
                        <Edit2 size={14} /> Rename
                    </div>
                    <div className="menu-item delete" onClick={() => {
                        setWorkspaceToDelete(activeWorkspaceMenu);
                        setActiveWorkspaceMenu(null);
                    }}>
                        <Trash2 size={14} /> Delete
                    </div>
                </div>
            )}

            <ConfirmModal
                isOpen={!!boardToDelete}
                title="Delete Board"
                message="Are you sure you want to delete this board? This action cannot be undone."
                confirmText="Delete"
                variant="danger"
                onConfirm={() => {
                    if (boardToDelete) deleteBoard(boardToDelete);
                    setBoardToDelete(null);
                }}
                onCancel={() => setBoardToDelete(null)}
            />

            <ConfirmModal
                isOpen={!!workspaceToDelete}
                title="Delete Workspace"
                message="Are you sure you want to delete this workspace? All boards inside it will be deleted! This action cannot be undone."
                confirmText="Delete Workspace"
                variant="danger"
                onConfirm={() => {
                    if (workspaceToDelete) deleteWorkspace(workspaceToDelete);
                    setWorkspaceToDelete(null);
                }}
                onCancel={() => setWorkspaceToDelete(null)}
            />

            {shareWorkspaceId && (
                <ShareWorkspaceModal
                    workspaceId={shareWorkspaceId}
                    onClose={() => setShareWorkspaceId(null)}
                />
            )}

            {shareBoardId && (
                <ShareBoardModal
                    boardId={shareBoardId}
                    onClose={() => setShareBoardId(null)}
                />
            )}

            <style>{`
                .workspace-item-row:hover .action-icon {
                    opacity: 1;
                }
                .action-icon {
                    opacity: 0;
                    margin-left: auto;
                    color: hsl(var(--color-text-secondary));
                    border-radius: 4px;
                    padding: 2px;
                }
                .action-icon:hover {
                    background-color: hsl(var(--color-bg-hover));
                    color: hsl(var(--color-text-primary));
                }
                .tree-node {
                    margin-bottom: 4px;
                }
                .tree-sidebar-item {
                    margin-bottom: 2px;
                }
                .context-menu {
                    display: flex;
                    flex-direction: column;
                    text-align: left;
                }
                .menu-item {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 8px;
                    cursor: pointer;
                    font-size: 13px;
                    color: hsl(var(--color-text-primary));
                    border-radius: 4px;
                }
                .menu-item:hover {
                    background-color: hsl(var(--color-bg-hover));
                }
                .menu-item.delete {
                    color: hsl(var(--color-dangerous));
                }
                .menu-item.delete:hover {
                    background-color: hsl(var(--color-dangerous-subtle));
                }
            `}</style>
        </div>
    );
};
