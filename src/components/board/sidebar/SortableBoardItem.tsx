import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { clsx } from 'clsx';
import { GripVertical, MoreHorizontal, Lock } from 'lucide-react';
import { BoardIcon } from './SidebarIcons';
import type { Board } from '../../../types';

interface SortableBoardItemProps {
    board: Board;
    activeBoardId: string | null;
    setActiveBoard: (id: string) => void;
    editingBoardId: string | null;
    setEditingBoardId: (id: string | null) => void;
    editTitle: string;
    setEditTitle: (title: string) => void;
    handleRename: (id: string) => void;
    handleContextMenu: (e: React.MouseEvent, id: string, rect: DOMRect) => void;
    can: (action: string) => boolean;
    isLastChild: boolean;
}

export const SortableBoardItem = ({
    board,
    activeBoardId,
    setActiveBoard,
    editingBoardId,
    setEditingBoardId,
    editTitle,
    setEditTitle,
    handleRename,
    handleContextMenu,
    can,
    isLastChild
}: SortableBoardItemProps) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: board.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        position: 'relative' as const,
        zIndex: isDragging ? 999 : 'auto'
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={clsx('tree-node-leaf', { 'last-child': isLastChild })}
        >
            <div
                className={clsx('tree-sidebar-item', { active: activeBoardId === board.id })}
                onClick={() => setActiveBoard(board.id)}
                onDoubleClick={(e) => {
                    e.stopPropagation();
                    if (can('create_board')) {
                        setEditingBoardId(board.id);
                        setEditTitle(board.title);
                    }
                }}
            >
                <div
                    {...attributes}
                    {...listeners}
                    className="drag-handle"
                    style={{ marginRight: '4px', cursor: 'grab', color: '#ccc', display: 'flex', alignItems: 'center', outline: 'none' }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <GripVertical size={12} />
                </div>

                <BoardIcon size={16} className="item-icon" />
                {
                    editingBoardId === board.id ? (
                        <input
                            autoFocus
                            type="text"
                            className="sidebar-item-input"
                            style={{ margin: 0, padding: '2px 4px' }}
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            onBlur={() => handleRename(board.id)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleRename(board.id);
                                if (e.key === 'Escape') setEditingBoardId(null);
                            }}
                            onClick={(e) => e.stopPropagation()}
                        />
                    ) : (
                        <span className="item-label">{board.title}</span>
                    )
                }
                {board.is_private && <Lock size={11} style={{ flexShrink: 0, color: '#999', marginLeft: '2px' }} />}

                <div className="sidebar-item-action" onClick={(e) => e.stopPropagation()}>
                    <MoreHorizontal
                        size={14}
                        onClick={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            handleContextMenu(e, board.id, rect);
                        }}
                    />
                </div>
            </div >
        </div >
    );
};
