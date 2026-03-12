import { useBoardStore } from '../store/useBoardStore';
import { Star, Layout } from 'lucide-react';

export const FavoritesPage = () => {
    const { boards, workspaces, setActiveBoard } = useBoardStore();

    // Filter boards that are favorited
    const favoritedBoards = boards.filter(b => b.isFavorite);

    return (
        <div style={{ padding: '40px', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
            <header style={{ marginBottom: '40px' }}>
                <h1 style={{
                    fontSize: '32px',
                    fontWeight: 600,
                    color: 'hsl(var(--color-text-primary))',
                    marginBottom: '8px'
                }}>
                    Favorites
                </h1>
                <p style={{ color: 'hsl(var(--color-text-secondary))', fontSize: '16px' }}>
                    Access your most important boards quickly.
                </p>
            </header>

            <section style={{ marginBottom: '40px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
                    <Star size={20} color="hsl(var(--color-brand-primary))" fill="hsl(var(--color-brand-primary))" />
                    <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'hsl(var(--color-text-primary))', margin: 0 }}>Favorited Boards</h2>
                </div>

                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                    gap: '24px'
                }}>
                    {favoritedBoards.length > 0 ? (
                        favoritedBoards.map(board => {
                            const workspace = workspaces.find(w => w.id === board.workspaceId);
                            const ownerName = workspace?.ownerName || 'Unknown Owner';

                            return (
                                <div
                                    key={board.id}
                                    onClick={() => setActiveBoard(board.id)}
                                    style={{
                                        backgroundColor: 'hsl(var(--color-bg-surface))',
                                        borderRadius: '12px',
                                        padding: '24px',
                                        boxShadow: 'var(--shadow-sm)',
                                        border: '1px solid hsl(var(--color-border))',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s ease',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '12px',
                                        minHeight: '140px'
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.transform = 'translateY(-2px)';
                                        e.currentTarget.style.boxShadow = 'var(--shadow-md)';
                                        e.currentTarget.style.borderColor = 'hsl(var(--color-brand-primary), 0.3)';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.transform = 'translateY(0)';
                                        e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
                                        e.currentTarget.style.borderColor = 'hsl(var(--color-border))';
                                    }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <div style={{
                                            width: '40px',
                                            height: '40px',
                                            borderRadius: '8px',
                                            backgroundColor: 'hsl(var(--color-brand-light))',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            color: 'hsl(var(--color-brand-primary))'
                                        }}>
                                            <Layout size={22} />
                                        </div>
                                        <Star size={18} color="hsl(var(--color-brand-primary))" fill="hsl(var(--color-brand-primary))" />
                                    </div>

                                    <div>
                                        <h3 style={{ fontSize: '16px', fontWeight: 600, margin: '0 0 6px 0', color: 'hsl(var(--color-text-primary))' }}>
                                            {board.title}
                                        </h3>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px', color: 'hsl(var(--color-text-secondary))' }}>
                                            <span>Workspace: {workspace?.title || 'Unknown Workspace'}</span>
                                            <span>Owner: {ownerName}</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )
                        : (
                            <div style={{ 
                                gridColumn: '1 / -1', 
                                padding: '60px 40px', 
                                textAlign: 'center', 
                                backgroundColor: 'hsl(var(--color-bg-surface))', 
                                borderRadius: '12px', 
                                border: '1px dashed hsl(var(--color-border))',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                gap: '16px'
                            }}>
                                <Star size={48} color="hsl(var(--color-text-tertiary))" style={{ opacity: 0.5 }} />
                                <div>
                                    <h3 style={{ fontSize: '18px', fontWeight: 600, color: 'hsl(var(--color-text-primary))', marginBottom: '8px' }}>No favorites yet</h3>
                                    <p style={{ color: 'hsl(var(--color-text-secondary))', margin: 0 }}>Start starring boards to see them here!</p>
                                </div>
                            </div>
                        )}
                </div>
            </section>
        </div>
    );
};
