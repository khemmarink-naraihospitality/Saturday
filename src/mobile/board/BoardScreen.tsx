import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { ChevronDown, MoreHorizontal, Plus, Star } from 'lucide-react';
import './board.css';
import { useBoardStore } from '../../store/useBoardStore';
import { usePermission } from '../../hooks/usePermission';
import { isBoardUnlocked } from '../../lib/boardPinUnlock';
import { PinLockScreen } from '../../components/board/PinLockScreen';
import { CenteredSpinner, EmptyState, IconButton, PrimaryButton, ScreenHeader } from '../ui';
import { backFromBoard, openHome } from '../nav/navigation';
import { useMobileUI } from '../state/mobileStore';
import { MobileTable } from './MobileTable';
import { BoardToolbar } from './BoardToolbar';
import { BoardActionsSheet, NewItemSheet } from './boardSheets';
import { VIEW_OPTIONS } from './views';
import { shownViewId, useAiSummaryEnabled } from '../../hooks/useAiSummaryEnabled';
import { StackedRowsIcon } from './icons';

import { useTerms } from '../../lib/terms';
import { useNewUi } from '../../lib/brand';
// The other views are the desktop components, fetched only when picked.
const TimelineView = lazy(() => import('../../components/table/TimelineView').then(m => ({ default: m.TimelineView })));
const KanbanView = lazy(() => import('../../components/kanban/KanbanView').then(m => ({ default: m.KanbanView })));
const CalendarView = lazy(() => import('../../components/calendar/CalendarView').then(m => ({ default: m.CalendarView })));
const AISummaryView = lazy(() => import('../../components/board/AISummaryView').then(m => ({ default: m.AISummaryView })));

/**
 * A board on a phone — reference screenshots 18, 20, 25: header, the view
 * picker row, the view itself (the main table by default) and the floating
 * Quick find toolbar. Loading follows the desktop BoardPage exactly, PIN gate
 * included: a private board's content is never fetched before its PIN.
 */
export const BoardScreen = ({ boardId }: { boardId: string }) => {
    const t = useTerms();
    const newUi = useNewUi();
    const board = useBoardStore(state => state.boards.find(b => b.id === boardId));
    const loadBoardData = useBoardStore(state => state.loadBoardData);
    const toggleFavorite = useBoardStore(state => state.toggleFavorite);
    const toggleGroup = useBoardStore(state => state.toggleGroup);
    const setSearchQuery = useBoardStore(state => state.setSearchQuery);
    const openViewsSheet = useMobileUI(state => state.openViewsSheet);
    const aiEnabled = useAiSummaryEnabled();
    const { can } = usePermission();
    const canEdit = can('edit_items');

    const [isUnlocked, setIsUnlocked] = useState(() => isBoardUnlocked(boardId));
    const [sheet, setSheet] = useState<'actions' | 'new' | null>(null);

    useEffect(() => {
        setIsUnlocked(isBoardUnlocked(boardId));
    }, [boardId, board?.is_private]);

    useEffect(() => {
        if (!board || board.isDataLoaded) return;
        if (board.is_private && !isUnlocked) return;
        void loadBoardData(boardId);
    }, [boardId, board?.isDataLoaded, board?.is_private, isUnlocked, loadBoardData]); // eslint-disable-line react-hooks/exhaustive-deps

    // Quick find writes the store's search, which every board shares: leaving
    // this board must not carry the query to the next one.
    useEffect(() => () => setSearchQuery(''), [boardId, setSearchQuery]);

    const groups = board?.groups;
    const collapsed = board?.collapsedGroups;
    const allCollapsed = useMemo(
        () => !!groups?.length && groups.every(g => (collapsed || []).includes(g.id)),
        [groups, collapsed]
    );
    const toggleAllGroups = () => {
        (groups || []).forEach(g => {
            const isCollapsed = (collapsed || []).includes(g.id);
            if (allCollapsed ? isCollapsed : !isCollapsed) toggleGroup(boardId, g.id);
        });
    };

    if (!board) {
        return (
            <div className="m-screen m-board" data-testid="m-board">
                <ScreenHeader title={t.Board} onBack={backFromBoard} />
                <EmptyState title={`${t.Board} not found`}>It may have been deleted, or you might not have access to it.</EmptyState>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <PrimaryButton onClick={openHome}>Back to Home</PrimaryButton>
                </div>
            </div>
        );
    }

    if (board.is_private && !isUnlocked) {
        return (
            <div className="m-screen m-board" data-testid="m-board">
                <ScreenHeader title={board.title} onBack={backFromBoard} />
                <div className="m-board-pin">
                    <PinLockScreen boardId={board.id} boardTitle={board.title} onUnlocked={() => setIsUnlocked(true)} />
                </div>
            </div>
        );
    }

    const viewId = shownViewId(board.activeViewId, aiEnabled);
    const viewLabel = viewId === 'main_table' && newUi ? t.mainTable : VIEW_OPTIONS.find(v => v.id === viewId)?.label || 'Main Table';

    let body;
    if (!board.isDataLoaded) {
        body = <CenteredSpinner message={`Loading ${t.board}…`} />;
    } else if (!board.groups || !board.columns) {
        body = <EmptyState title={`This ${t.board} could not be read`}>Try again later, or open it on a computer.</EmptyState>;
    } else if (viewId === 'main_table') {
        body = <MobileTable boardId={boardId} canEdit={canEdit} />;
    } else {
        body = (
            <div className="m-board-view">
                <Suspense fallback={<CenteredSpinner />}>
                    {viewId === 'timeline' ? <TimelineView />
                        : viewId === 'kanban' ? <KanbanView />
                            : viewId === 'calendar' ? <CalendarView />
                                : viewId === 'ai_summary' ? <AISummaryView />
                                    : <EmptyState title={viewLabel}>This view isn't available on a phone yet.</EmptyState>}
                </Suspense>
            </div>
        );
    }

    return (
        <div className="m-screen m-board" data-testid="m-board">
            <ScreenHeader
                title={board.title}
                onBack={backFromBoard}
                actions={(
                    <IconButton label={`${t.Board} actions`} size={36} onClick={() => setSheet('actions')}>
                        <MoreHorizontal size={21} strokeWidth={1.9} />
                    </IconButton>
                )}
            />

            <div className="m-board-controls">
                <button type="button" className="m-board-view-picker" onClick={() => openViewsSheet(boardId)} aria-label={`View: ${viewLabel}. Change view`}>
                    <span className="m-truncate">{viewLabel}</span>
                    <ChevronDown size={20} strokeWidth={1.7} />
                </button>
                <IconButton label={allCollapsed ? `Expand all ${t.groups}` : `Collapse all ${t.groups}`} size={36} onClick={toggleAllGroups} aria-pressed={allCollapsed}>
                    <StackedRowsIcon size={21} />
                </IconButton>
                <IconButton label={board.isFavorite ? 'Remove from favorites' : 'Add to favorites'} size={36} onClick={() => void toggleFavorite(boardId)} aria-pressed={!!board.isFavorite}>
                    <Star size={20} strokeWidth={1.8} color={board.isFavorite ? '#ffcb00' : undefined} fill={board.isFavorite ? '#ffcb00' : 'none'} />
                </IconButton>
                {canEdit && (
                    <IconButton label={`New ${newUi && (!board.itemColumnTitle || board.itemColumnTitle === 'Item') ? t.item : board.itemColumnTitle || 'item'}`} variant="accent" size={36} onClick={() => setSheet('new')}>
                        <Plus size={21} strokeWidth={2} />
                    </IconButton>
                )}
            </div>

            <div className="m-board-body">{body}</div>

            {board.isDataLoaded && viewId === 'main_table' && <BoardToolbar boardId={boardId} />}

            <BoardActionsSheet open={sheet === 'actions'} onClose={() => setSheet(null)} boardId={boardId} allCollapsed={allCollapsed} onToggleAllGroups={toggleAllGroups} />
            <NewItemSheet open={sheet === 'new'} onClose={() => setSheet(null)} boardId={boardId} />
        </div>
    );
};
