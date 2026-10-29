import { useState } from 'react';
import { useBoardStore } from '../store/useBoardStore';
import { Star } from 'lucide-react';
import { BoardCard, ShowMoreButton } from '../components/home/HomeCards';
import { useTerms } from '../lib/terms';


export const FavoritesPage = () => {
    const { boards, workspaces, setActiveBoard, toggleFavorite } = useBoardStore();
    const [showAll, setShowAll] = useState(false);
    const t = useTerms();

    // Filter boards that are favorited. Deleting a board archives the row
    // rather than removing it (so Trash can restore it) — an archived board
    // can still carry isFavorite from before it was deleted, so that has to be
    // excluded explicitly here too.
    const favoritedBoards = boards.filter(b => b.isFavorite && !b.is_archived);
    const displayedBoards = showAll ? favoritedBoards : favoritedBoards.slice(0, 3);



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
                    <Star size={20} color="#ffcb00" fill="#ffcb00" />
                    <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'hsl(var(--color-text-primary))', margin: 0 }}>{`Favorited ${t.Boards}`}</h2>
                </div>

                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                    gap: '24px',
                    marginBottom: '20px'
                }}>
                    {displayedBoards.length > 0 ? (
                        displayedBoards.map(board => (
                            <BoardCard
                                key={board.id}
                                board={board}
                                workspace={workspaces.find(w => w.id === board.workspaceId)}
                                onOpen={() => setActiveBoard(board.id)}
                                onToggleFavorite={toggleFavorite}
                            />
                        ))
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
                                    <p style={{ color: 'hsl(var(--color-text-secondary))', margin: 0 }}>{`Start starring ${t.boards} to see them here!`}</p>
                                </div>
                            </div>
                        )}
                </div>
                {favoritedBoards.length > 3 && (
                    <div className="home-more-row">
                        <ShowMoreButton expanded={showAll} onToggle={() => setShowAll(!showAll)} />
                    </div>
                )}

            </section>
        </div>
    );
};
