import { useState, useEffect, useRef } from 'react';
import { Share2, Activity, X, MoreHorizontal, Star, Trash2, Edit2, Plus, Download } from 'lucide-react';
import { motion } from 'framer-motion';
import { useBoardStore } from '../../store/useBoardStore';
import { usePermission } from '../../hooks/usePermission';
import { ActivityLogList } from '../common/ActivityLogList';
import { ShareBoardModal } from '../workspace/ShareBoardModal';
import { SidePanel } from '../ui/SidePanel';
import { ExportBoardModal } from './ExportBoardModal';

interface BoardHeaderProps {
    boardId: string;
}

export const BoardHeader = ({ boardId }: BoardHeaderProps) => {
    const { boards, updateBoard, deleteBoard, activeBoardMembers } = useBoardStore();
    const board = boards.find(b => b.id === boardId);

    // Permission Hook
    const { can } = usePermission();

    const [showShareModal, setShowShareModal] = useState(false);
    const [showActivityLog, setShowActivityLog] = useState(false);
    const [showMenu, setShowMenu] = useState(false);
    const [showExportModal, setShowExportModal] = useState(false);

    // Rename Logic
    const [isEditing, setIsEditing] = useState(false);
    const [title, setTitle] = useState(board?.title || '');

    const menuRef = useRef<HTMLDivElement>(null);

    // Sync title when board changes (e.g. from sidebar rename)
    useEffect(() => {
        if (board) setTitle(board.title);
    }, [board?.title]);

    // Close menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setShowMenu(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleRename = () => {
        if (!board) return;
        if (title.trim() !== board.title) {
            updateBoard(board.id, { title: title.trim() });
        }
        setIsEditing(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') handleRename();
        if (e.key === 'Escape') {
            setTitle(board?.title || '');
            setIsEditing(false);
        }
    };

    const handleDeleteBoard = async () => {
        if (!board) return;
        if (confirm('Are you sure you want to delete this board? This action cannot be undone.')) {
            await deleteBoard(board.id);
            // Navigation should be handled by the store or parent, but strictly we are checking logic here
        }
    };

    if (!board) return null;

    // Filter members to show (unique users)
    const uniqueMembers = Array.from(new Map(activeBoardMembers.map(m => [m.user_id, m])).values());
    const displayMembers = uniqueMembers.slice(0, 4);
    const remainingMembers = uniqueMembers.length - 4;

    return (
        <header style={{
            minHeight: '54px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 32px',
            backgroundColor: 'hsl(var(--color-bg-subtle))', // Darkened from surface
            borderBottom: '1px solid hsl(var(--color-border))',
            position: 'relative'
        }}>
            {/* Left Side: Title & Description */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div>
                    {isEditing ? (
                        <input
                            autoFocus
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            onBlur={handleRename}
                            onKeyDown={handleKeyDown}
                            style={{
                                fontSize: '24px',
                                fontWeight: 600,
                                letterSpacing: '-0.02em',
                                border: '1px solid hsl(var(--color-brand-primary))',
                                borderRadius: '4px',
                                padding: '0 4px',
                                outline: 'none',
                                background: 'white',
                                color: 'hsl(var(--color-text-primary))',
                                minWidth: '200px'
                            }}
                        />
                    ) : (
                        <h1
                            onClick={() => can('create_board') && setIsEditing(true)}
                            style={{
                                fontSize: '24px',
                                fontWeight: 600,
                                margin: 0,
                                color: 'hsl(var(--color-text-primary))',
                                cursor: can('create_board') ? 'pointer' : 'default',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px'
                            }}
                        >
                            {board.title}
                            <Star size={16} color="hsl(var(--color-text-tertiary))" style={{ cursor: 'pointer' }} />
                        </h1>
                    )}
                </div>
            </div>

            {/* Right Side: Actions */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>

                {/* Search / Filter */}
                <div style={{ position: 'relative' }}>
                    {/* Search removed per user request */}
                </div>

                <div style={{ height: '24px', width: '1px', background: 'hsl(var(--color-border))', margin: '0 8px' }} />

                {/* Members Display */}
                <div style={{ display: 'flex', marginRight: '8px', alignItems: 'center' }}>
                    {uniqueMembers.length > 0 ? (
                        <>
                            {displayMembers.map((member, index) => {
                                const isOwner = member.role === 'owner';
                                const profile = member.profiles || {};
                                const name = profile.full_name || member.full_name || profile.email || member.email || '?';
                                const avatar = profile.avatar_url || member.avatar_url;
                                const initials = name.substring(0, 2).toUpperCase();

                                return (
                                    <div
                                        key={member.user_id || index}
                                        title={`${name} (${member.role})`}
                                        style={{
                                            width: '32px', height: '32px', borderRadius: '50%',
                                            background: isOwner ? 'hsl(var(--color-brand-primary))' : '#9ca3af',
                                            color: 'white',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: '12px', border: '2px solid white', marginLeft: index === 0 ? 0 : '-8px',
                                            cursor: 'pointer',
                                            position: 'relative',
                                            overflow: 'hidden'
                                        }}
                                    >
                                        {avatar ? (
                                            <img
                                                src={avatar}
                                                alt={initials}
                                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                            />
                                        ) : (
                                            initials
                                        )}
                                    </div>
                                );
                            })}
                            {remainingMembers > 0 && (
                                <div style={{
                                    width: '32px', height: '32px', borderRadius: '50%',
                                    background: '#e5e7eb', color: '#6b7280',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: '11px', border: '2px solid white', marginLeft: '-8px',
                                    fontWeight: 600
                                }}>
                                    +{remainingMembers}
                                </div>
                            )}

                            {/* Invitation Button (+) */}
                            <button
                                onClick={() => can('invite_members') && setShowShareModal(true)}
                                style={{
                                    width: '32px', height: '32px', borderRadius: '50%',
                                    background: 'hsl(var(--color-bg-subtle))',
                                    color: 'hsl(var(--color-text-secondary))',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: '16px', border: '2px solid white', marginLeft: '-8px',
                                    cursor: can('invite_members') ? 'pointer' : 'not-allowed',
                                    zIndex: 0
                                }}
                                title="Invite to board"
                            >
                                <Plus size={16} />
                            </button>
                        </>
                    ) : (
                        <div style={{ fontSize: '12px', color: 'hsl(var(--color-text-tertiary))', fontStyle: 'italic' }}>
                            No members
                        </div>
                    )}
                </div>

                {/* Activity Log */}
                <div style={{ position: 'relative' }}>
                    <motion.button
                        className="btn-ghost"
                        onClick={() => setShowActivityLog(!showActivityLog)}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '8px 12px',
                            borderRadius: '6px',
                            background: showActivityLog ? 'hsl(var(--color-bg-subtle))' : 'transparent',
                            color: showActivityLog ? 'hsl(var(--color-brand-primary))' : 'hsl(var(--color-text-secondary))'
                        }}
                    >
                        <Activity size={16} />
                    </motion.button>

                    <SidePanel isOpen={showActivityLog} onClose={() => setShowActivityLog(false)} width="600px">
                        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                            {/* Header matching TaskDetail styles */}
                            <div style={{
                                padding: '24px 32px',
                                borderBottom: '1px solid hsl(var(--color-border))',
                                display: 'flex',
                                alignItems: 'flex-start',
                                justifyContent: 'space-between',
                                backgroundColor: 'hsl(var(--color-bg-surface))',
                                flexShrink: 0
                            }}>
                                <div>
                                    <h2 style={{
                                        margin: 0,
                                        fontSize: '24px',
                                        fontWeight: 600,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        color: 'hsl(var(--color-text-primary))'
                                    }}>
                                        <Activity size={24} className="text-brand-primary" />
                                        Board Activity
                                    </h2>
                                    <div style={{ display: 'flex', gap: '16px', fontSize: '14px', color: 'hsl(var(--color-text-secondary))', marginTop: '8px' }}>
                                        <span>Board: {board.title}</span>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setShowActivityLog(false)}
                                    style={{
                                        background: 'transparent',
                                        border: 'none',
                                        cursor: 'pointer',
                                        padding: '8px',
                                        borderRadius: '4px',
                                        color: 'hsl(var(--color-text-tertiary))'
                                    }}
                                >
                                    <X size={24} />
                                </button>
                            </div>

                            {/* Content */}
                            <div style={{ flex: 1, overflowY: 'hidden', display: 'flex', flexDirection: 'column', padding: '0 32px' }}>
                                <ActivityLogList
                                    scope="board"
                                    targetId={boardId}
                                    showHeader={false}
                                    onClose={() => setShowActivityLog(false)}
                                />
                            </div>
                        </div>
                    </SidePanel>
                </div>

                <button
                    onClick={() => can('invite_members') && setShowShareModal(true)}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '8px 16px',
                        backgroundColor: 'hsl(var(--color-brand-primary))',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '14px',
                        fontWeight: 500,
                        cursor: can('invite_members') ? 'pointer' : 'not-allowed',
                        opacity: can('invite_members') ? 1 : 0.7,
                        marginLeft: '8px'
                    }}
                >
                    <Share2 size={16} />
                    Invite / Share
                </button>

                {/* More Menu */}
                <div style={{ position: 'relative' }} ref={menuRef}>
                    <button
                        className="btn-ghost"
                        style={{ padding: '8px', background: showMenu ? 'hsl(var(--color-bg-subtle))' : 'transparent' }}
                        onClick={() => setShowMenu(!showMenu)}
                    >
                        <MoreHorizontal size={16} />
                    </button>

                    {showMenu && (
                        <div style={{
                            position: 'absolute',
                            top: '100%',
                            right: 0,
                            marginTop: '8px',
                            backgroundColor: 'hsl(var(--color-bg-surface))',
                            border: '1px solid hsl(var(--color-border))',
                            borderRadius: '8px',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                            zIndex: 100,
                            minWidth: '160px',
                            padding: '4px 0'
                        }}>
                            <button
                                onClick={() => { setIsEditing(true); setShowMenu(false); }}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '8px',
                                    width: '100%', padding: '8px 16px',
                                    textAlign: 'left', background: 'none', border: 'none',
                                    fontSize: '14px', color: 'hsl(var(--color-text-primary))',
                                    cursor: 'pointer'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-hover))'}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                            >
                                <Edit2 size={14} /> Rename
                            </button>

                            <div style={{ height: '1px', background: 'hsl(var(--color-border))', margin: '4px 0' }} />

                            <button
                                onClick={() => { handleDeleteBoard(); setShowMenu(false); }}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '8px',
                                    width: '100%', padding: '8px 16px',
                                    textAlign: 'left', background: 'none', border: 'none',
                                    fontSize: '14px', color: '#ef4444',
                                    cursor: 'pointer'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#fef2f2'}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                            >
                                <Trash2 size={14} /> Delete Board
                            </button>

                            <div style={{ height: '1px', background: 'hsl(var(--color-border))', margin: '4px 0' }} />

                            <button
                                onClick={() => {
                                    setShowExportModal(true);
                                    setShowMenu(false);
                                }}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '8px',
                                    width: '100%', padding: '8px 16px',
                                    textAlign: 'left', background: 'none', border: 'none',
                                    fontSize: '14px', color: 'hsl(var(--color-text-secondary))',
                                    cursor: 'pointer'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-hover))'}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                            >
                                <Download size={14} /> Export Board to Excel/CSV
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {showShareModal && (
                <ShareBoardModal
                    boardId={boardId}
                    onClose={() => setShowShareModal(false)}
                />
            )}

            {showExportModal && (
                <ExportBoardModal
                    isOpen={showExportModal}
                    onClose={() => setShowExportModal(false)}
                    defaultFilename={board.title}
                    onExport={(filename) => {
                        import('../../services/backupService').then(({ backupService }) => {
                            backupService.exportBoardToCSV(boardId, filename);
                        });
                    }}
                />
            )}
        </header>
    );
};
