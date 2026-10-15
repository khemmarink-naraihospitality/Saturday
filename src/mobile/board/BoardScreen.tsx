import { useBoardStore } from '../../store/useBoardStore';
import { ScreenHeader } from '../ui';
import { backFromBoard } from '../nav/navigation';

/** A board — reference: screenshots 18, 20, 25. Placeholder — the "board" agent. */
export const BoardScreen = ({ boardId }: { boardId: string }) => {
    const title = useBoardStore(state => state.boards.find(b => b.id === boardId)?.title || '');
    return (
        <div className="m-screen" data-testid="m-board">
            <ScreenHeader title={title} onBack={backFromBoard} />
        </div>
    );
};
