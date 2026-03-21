import { useState, useEffect } from 'react';
import { useBoardStore } from '../store/useBoardStore';
import { useAuth } from '../contexts/AuthContext';
import { Clock, Layout, Star, Bell, X, Check, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '../lib/supabase';

const BoardCard = ({ board, workspace, onClick, onToggleFavorite }: any) => {
    const ownerName = workspace?.ownerName || 'Unknown Owner';
    return (
        <div
            onClick={onClick}
            style={{
                backgroundColor: 'hsl(var(--color-bg-surface))',
                borderRadius: '8px',
                padding: '24px',
                boxShadow: 'var(--shadow-sm)',
                border: '1px solid hsl(var(--color-border))',
                cursor: 'pointer',
                transition: 'transform 0.2s, box-shadow 0.2s',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                minHeight: '140px'
            }}
            onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = 'var(--shadow-md)';
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
            }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '6px',
                    backgroundColor: 'hsl(var(--color-brand-light))',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'hsl(var(--color-brand-primary))'
                }}>
                    <Layout size={22} />
                </div>
                <Star 
                    size={18} 
                    color={board.isFavorite ? "#ffcb00" : "hsl(var(--color-text-tertiary))"} 
                    fill={board.isFavorite ? "#ffcb00" : "none"}
                    style={{ cursor: 'pointer', transition: 'all 0.2s' }} 
                    onClick={(e) => {
                        e.stopPropagation();
                        onToggleFavorite(board.id);
                    }}
                />
            </div>

            <div>
                <h3 style={{ fontSize: '16px', fontWeight: 600, margin: '0 0 6px 0', color: 'hsl(var(--color-text-primary))' }}>
                    {board.title}
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px', color: 'hsl(var(--color-text-secondary))' }}>
                    <span>Work Management</span>
                    <span>Workspace: {workspace?.title || 'Unknown Workspace'}</span>
                    <span>Owner: {ownerName}</span>
                </div>
            </div>
        </div>
    );
};

export const HomePage = () => {
    const { user } = useAuth();
    const { boards, workspaces, setActiveBoard, toggleFavorite, activeWorkspaceId } = useBoardStore();
    const [showAllRecent, setShowAllRecent] = useState(false);
    const [showAllWorkspace, setShowAllWorkspace] = useState(false);
    const [showAllFavorites, setShowAllFavorites] = useState(false);



    // Sort by lastViewedAt (descending) to show true recently visited
    const recentBoards = [...boards]
        .filter(b => b.lastViewedAt)
        .sort((a, b) => {
            const dateA = new Date(a.lastViewedAt!).getTime();
            const dateB = new Date(b.lastViewedAt!).getTime();
            return dateB - dateA;
        });

    const displayedRecentBoards = showAllRecent ? recentBoards : recentBoards.slice(0, 3);


    // My workspace boards
    const recentWorkspaceId = recentBoards[0]?.workspaceId;
    const defaultWorkspaceId = activeWorkspaceId || recentWorkspaceId || workspaces[0]?.id;
    const myWorkspace = workspaces.find(w => w.id === defaultWorkspaceId) || workspaces[0];
    const myWorkspaceBoards = boards.filter(b => b.workspaceId === myWorkspace?.id);
    const displayedWorkspaceBoards = showAllWorkspace ? myWorkspaceBoards : myWorkspaceBoards.slice(0, 3);


    // Filter boards that are favorited
    const favoritedBoards = boards.filter(b => b.isFavorite);
    const displayedFavoriteBoards = showAllFavorites ? favoritedBoards : favoritedBoards.slice(0, 3);




    // Greeting based on time
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

    return (
        <div style={{ padding: '40px', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
            <header style={{ marginBottom: '40px' }}>
                <h1 style={{
                    fontSize: '32px',
                    fontWeight: 600,
                    color: 'hsl(var(--color-text-primary))',
                    marginBottom: '8px'
                }}>
                    {greeting}, {user?.user_metadata?.full_name || user?.email?.split('@')[0]}!
                </h1>
                <p style={{ color: 'hsl(var(--color-text-secondary))', fontSize: '16px' }}>
                    Quickly access your recent boards and work.
                </p>
            </header>

            {/* 1. Update feed (Inbox) */}
            <div style={{ marginBottom: '40px' }}>
                <InboxFeed />
            </div>

            {/* 2. Recently visited */}
            {recentBoards.length > 0 && (
                <section style={{ marginBottom: '40px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
                        <Clock size={20} color="hsl(var(--color-brand-primary))" />
                        <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'hsl(var(--color-text-primary))', margin: 0 }}>Recently visited</h2>
                    </div>

                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                        gap: '24px',
                        marginBottom: '20px'
                    }}>
                        {displayedRecentBoards.map(board => {
                            const workspace = workspaces.find(w => w.id === board.workspaceId);
                            return (
                                <BoardCard 
                                    key={board.id} 
                                    board={board} 
                                    workspace={workspace} 
                                    onClick={() => setActiveBoard(board.id)} 
                                    onToggleFavorite={toggleFavorite}
                                />
                            );
                        })}
                    </div>
                    {recentBoards.length > 3 && (
                        <div style={{ textAlign: 'center' }}>
                            <button
                                onClick={() => setShowAllRecent(!showAllRecent)}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    color: 'hsl(var(--color-text-secondary))',
                                    cursor: 'pointer',
                                    fontSize: '14px',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '4px',
                                    padding: '8px 16px',
                                    borderRadius: '4px',
                                    transition: 'background-color 0.2s'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-subtle))'}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                            >
                                {showAllRecent ? 'Show less' : 'Show all'}
                                {showAllRecent ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            </button>
                        </div>
                    )}
                </section>
            )}

            {/* 3. My workspace */}
            {myWorkspaceBoards.length > 0 && (
                <section style={{ marginBottom: '40px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
                        <Layout size={20} color="hsl(var(--color-brand-primary))" />
                        <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'hsl(var(--color-text-primary))', margin: 0 }}>My workspace</h2>
                    </div>

                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                        gap: '24px',
                        marginBottom: '20px'
                    }}>
                        {displayedWorkspaceBoards.map(board => {
                            const workspace = workspaces.find(w => w.id === board.workspaceId);
                            return (
                                <BoardCard 
                                    key={board.id} 
                                    board={board} 
                                    workspace={workspace} 
                                    onClick={() => setActiveBoard(board.id)} 
                                    onToggleFavorite={toggleFavorite}
                                />
                            );
                        })}
                    </div>
                    {myWorkspaceBoards.length > 3 && (
                        <div style={{ textAlign: 'center' }}>
                            <button
                                onClick={() => setShowAllWorkspace(!showAllWorkspace)}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    color: 'hsl(var(--color-text-secondary))',
                                    cursor: 'pointer',
                                    fontSize: '14px',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '4px',
                                    padding: '8px 16px',
                                    borderRadius: '4px',
                                    transition: 'background-color 0.2s'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-subtle))'}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                            >
                                {showAllWorkspace ? 'Show less' : 'Show all'}
                                {showAllWorkspace ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            </button>
                        </div>
                    )}
                </section>
            )}
            
            {/* 4. Favorites */}
            {favoritedBoards.length > 0 && (
                <section style={{ marginBottom: '40px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
                        <Star size={20} color="#ffcb00" fill="#ffcb00" />
                        <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'hsl(var(--color-text-primary))', margin: 0 }}>Favorites</h2>
                    </div>

                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                        gap: '24px',
                        marginBottom: '20px'
                    }}>
                        {displayedFavoriteBoards.map(board => {
                            const workspace = workspaces.find(w => w.id === board.workspaceId);
                            return (
                                <BoardCard 
                                    key={board.id} 
                                    board={board} 
                                    workspace={workspace} 
                                    onClick={() => setActiveBoard(board.id)} 
                                    onToggleFavorite={toggleFavorite}
                                />
                            );
                        })}
                    </div>
                    {favoritedBoards.length > 3 && (
                        <div style={{ textAlign: 'center' }}>
                            <button
                                onClick={() => setShowAllFavorites(!showAllFavorites)}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    color: 'hsl(var(--color-text-secondary))',
                                    cursor: 'pointer',
                                    fontSize: '14px',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '4px',
                                    padding: '8px 16px',
                                    borderRadius: '4px',
                                    transition: 'background-color 0.2s'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-subtle))'}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                            >
                                {showAllFavorites ? 'Show less' : 'Show all'}
                                {showAllFavorites ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            </button>
                        </div>
                    )}
                </section>
            )}


            {recentBoards.length === 0 && myWorkspaceBoards.length === 0 && (
                <div style={{ gridColumn: '1 / -1', padding: '40px', textAlign: 'center', backgroundColor: 'hsl(var(--color-bg-surface))', borderRadius: '8px', border: '1px dashed hsl(var(--color-border))' }}>
                    <p style={{ color: 'hsl(var(--color-text-secondary))' }}>No boards found. Create or visit a board to get started!</p>
                </div>
            )}
        </div>
    );
};

// Sub-component for Feed to handle its own logic
const InboxFeed = () => {
    const { user } = useAuth();
    const notifications = useBoardStore(state => state.notifications || []);
    const loadNotifications = useBoardStore(state => state.loadNotifications);
    const handleAcceptInvite = useBoardStore(state => state.handleAcceptInvite);
    const handleDeclineInvite = useBoardStore(state => state.handleDeclineInvite);
    const navigateTo = useBoardStore(state => state.navigateTo);
    const isLoading = useBoardStore(state => state.isLoading);
    const [processingId, setProcessingId] = useState<string | null>(null);

    // Filter to show limited items in feed (top 5)
    // We can assume store has them sorted
    const feedNotifications = notifications.slice(0, 5);

    useEffect(() => {
        if (user?.id) loadNotifications();
    }, [user?.id, loadNotifications]);


    const dismissNotification = async (notificationId: string) => {
        setProcessingId(notificationId);
        try {
            const { error } = await supabase.from('notifications').delete().eq('id', notificationId);
            if (!error) await loadNotifications();
        } catch (err) {
            console.error(err);
        } finally {
            setProcessingId(null);
        }
    };

    const handleMarkAsRead = (n: any) => dismissNotification(n.id);

    const onAccept = async (notification: any) => {
        setProcessingId(notification.id);
        try {
            await handleAcceptInvite(notification);
        } finally {
            setProcessingId(null);
        }
    };

    const onDecline = async (notification: any) => {
        setProcessingId(notification.id);
        try {
            await handleDeclineInvite(notification);
        } finally {
            setProcessingId(null);
        }
    };

    const formatTime = (timestamp: string) => {
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        const minutes = Math.floor(diff / 60000);
        if (minutes < 1) return 'Just now';
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ago`;
        return `${Math.floor(hours / 24)}d ago`;
    };

    return (
        <section>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{
                        width: '24px', height: '24px', borderRadius: '50%', backgroundColor: 'hsl(var(--color-brand-primary))', color: 'white',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 600
                    }}>
                        {feedNotifications.length}
                    </div>
                    <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'hsl(var(--color-text-primary))', margin: 0 }}>Update feed (Inbox)</h2>
                </div>
                {/* See All Button */}
                <button
                    onClick={() => navigateTo('notifications')}
                    style={{
                        background: 'transparent', border: 'none', color: 'hsl(var(--color-brand-primary))', cursor: 'pointer', fontSize: '14px', fontWeight: 500
                    }}
                >
                    See all
                </button>
            </div>

            <div style={{
                backgroundColor: 'hsl(var(--color-bg-surface))',
                borderRadius: '8px',
                border: '1px solid hsl(var(--color-border))',
                padding: '24px',
                minHeight: '100px'
            }}>
                {isLoading && feedNotifications.length === 0 ? (
                    <div style={{ textAlign: 'center', color: 'hsl(var(--color-text-secondary))' }}>Loading updates...</div>
                ) : feedNotifications.length === 0 ? (
                    <div style={{ textAlign: 'center', color: 'hsl(var(--color-text-secondary))', padding: '20px' }}>
                        No feedback coming
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {feedNotifications.map(n => (
                            <div key={n.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', borderBottom: '1px solid hsl(var(--color-border))', paddingBottom: '16px', position: 'relative', paddingRight: '24px' }}>
                                <div style={{
                                    width: '40px', height: '40px', borderRadius: '50%',
                                    backgroundColor: 'hsl(var(--color-bg-subtle))', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    flexShrink: 0
                                }}>
                                    <Bell size={20} color="hsl(var(--color-text-secondary))" />
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', alignItems: 'baseline' }}>
                                        <span style={{ fontWeight: 600, fontSize: '15px', color: 'hsl(var(--color-text-primary))' }}>{n.title || 'Notification'}</span>
                                        <span style={{ fontSize: '12px', color: 'hsl(var(--color-text-tertiary))', marginLeft: '12px', whiteSpace: 'nowrap' }}>
                                            {formatTime(n.created_at)}
                                        </span>
                                    </div>
                                    <p style={{ margin: 0, color: 'hsl(var(--color-text-secondary))', fontSize: '14px', lineHeight: '1.5' }}>
                                        {n.content || n.message}
                                    </p>

                                    {(n.data?.status === 'accepted' || n.data?.status === 'declined' || n.status === 'accepted' || n.status === 'declined') && (
                                        <div style={{
                                            padding: '10px 14px',
                                            borderRadius: '6px',
                                            fontSize: '13px',
                                            fontWeight: 500,
                                            backgroundColor: (n.data?.status || n.status) === 'accepted' ? '#effbf5' : '#fef2f2',
                                            color: (n.data?.status || n.status) === 'accepted' ? '#0d7f52' : '#d92d20',
                                            marginTop: '12px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                            border: `1px solid ${(n.data?.status || n.status) === 'accepted' ? '#bbf7d0' : '#fecaca'}`
                                        }}>
                                            <span style={{ fontSize: '14px' }}>
                                                {(n.data?.status || n.status) === 'accepted' ? <Check size={14} /> : <X size={14} />}
                                            </span>
                                            <span>
                                                {(n.data?.status || n.status) === 'accepted'
                                                    ? `Invitation accepted`
                                                    : `Invitation declined`}
                                            </span>
                                        </div>
                                    )}

                                    {(n.type === 'workspace_invite' || n.type === 'board_invite') &&
                                        ((n.data?.status || 'pending') === 'pending' && (!n.status || n.status === 'pending')) && (
                                            <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                                                <button
                                                    onClick={() => onAccept(n)}
                                                    disabled={processingId === n.id}
                                                    style={{
                                                        backgroundColor: processingId === n.id ? 'hsl(var(--color-brand-primary), 0.7)' : 'hsl(var(--color-brand-primary))',
                                                        color: 'white',
                                                        border: 'none',
                                                        padding: '8px 20px',
                                                        borderRadius: '4px',
                                                        cursor: processingId === n.id ? 'not-allowed' : 'pointer',
                                                        fontWeight: 500,
                                                        fontSize: '13px',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '6px',
                                                        transition: 'all 0.2s'
                                                    }}>
                                                    {processingId === n.id ? 'Accepting...' : 'Accept'}
                                                </button>
                                                <button
                                                    onClick={() => onDecline(n)}
                                                    disabled={processingId === n.id}
                                                    style={{
                                                        backgroundColor: 'hsl(var(--color-bg-surface))',
                                                        color: 'hsl(var(--color-text-primary))',
                                                        border: '1px solid hsl(var(--color-border))',
                                                        padding: '8px 20px',
                                                        borderRadius: '4px',
                                                        cursor: processingId === n.id ? 'not-allowed' : 'pointer',
                                                        fontWeight: 500,
                                                        fontSize: '13px',
                                                        transition: 'all 0.2s'
                                                    }}
                                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-surface-hover))'}
                                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-surface))'}
                                                >
                                                    {processingId === n.id ? 'Declining...' : 'Decline'}
                                                </button>
                                            </div>
                                        )}
                                </div>
                                <button
                                    onClick={() => handleMarkAsRead(n)}
                                    title="Dismiss"
                                    style={{
                                        position: 'absolute',
                                        top: '0px',
                                        right: '0px',
                                        background: 'none',
                                        border: 'none',
                                        cursor: 'pointer',
                                        padding: '4px',
                                        color: 'hsl(var(--color-text-tertiary))',
                                        transition: 'color 0.2s',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.color = 'hsl(var(--color-text-primary))'}
                                    onMouseLeave={(e) => e.currentTarget.style.color = 'hsl(var(--color-text-tertiary))'}
                                >
                                    <X size={16} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </section>
    );
};
