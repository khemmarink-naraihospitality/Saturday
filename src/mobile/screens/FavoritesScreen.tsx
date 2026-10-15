import { useMemo } from 'react';
import { Star } from 'lucide-react';
import './screens.css';
import { useBoardStore } from '../../store/useBoardStore';
import { Card, EmptyState } from '../ui';
import { openBoard } from '../nav/navigation';
import { BoardRow } from './parts';
import { liveBoards } from './data';

/** The Favorites tab: every starred board, most recently visited first. */
export const FavoritesScreen = () => {
    const boards = useBoardStore(state => state.boards);
    const workspaces = useBoardStore(state => state.workspaces);
    const sharedBoardIds = useBoardStore(state => state.sharedBoardIds);

    const favourites = useMemo(
        () => liveBoards(boards)
            .filter(b => b.isFavorite)
            .sort((a, b) => (b.lastViewedAt || '').localeCompare(a.lastViewedAt || '') || a.title.localeCompare(b.title)),
        [boards]
    );

    return (
        <div className="m-screen" data-testid="m-favorites">
            <div className="m-scroll m-scroll--tabbar">
                <h1 className="m-tab-title">Favorites</h1>
                <div style={{ padding: '4px 16px 0' }}>
                    <Card style={{ padding: '4px 16px' }}>
                        {favourites.map(board => (
                            <BoardRow
                                key={board.id}
                                board={board}
                                workspaces={workspaces}
                                shared={sharedBoardIds.includes(board.id)}
                                onOpen={() => openBoard(board.id)}
                            />
                        ))}
                        {favourites.length === 0 && (
                            <EmptyState icon={<Star size={36} color="#ffcb00" />} title="No favorites yet">
                                Tap the star on a board to keep it here.
                            </EmptyState>
                        )}
                    </Card>
                </div>
            </div>
        </div>
    );
};
