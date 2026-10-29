import { useMemo, useState } from 'react';
import { Star, Clock3, UserRound, Users, ChevronRight, type LucideIcon } from 'lucide-react';
import { clsx } from 'clsx';
import { useBoardStore } from '../../../store/useBoardStore';
import { useUserStore } from '../../../store/useUserStore';
import { useTerms, type Terms } from '../../../lib/terms';
import type { Board } from '../../../types';
import { BoardIcon } from './SidebarIcons';

type SectionId = 'favorites' | 'recent' | 'mine' | 'shared';

const SECTIONS: { id: SectionId; Icon: LucideIcon; label: (t: Terms) => string; empty: (t: Terms) => string }[] = [
    { id: 'favorites', Icon: Star, label: () => 'Favorites', empty: t => `Star a ${t.board} to keep it here.` },
    { id: 'recent', Icon: Clock3, label: () => 'Recently visited', empty: t => `${t.Boards} you open show up here.` },
    { id: 'mine', Icon: UserRound, label: t => `My ${t.boards}`, empty: t => `${t.Boards} you own show up here.` },
    { id: 'shared', Icon: Users, label: () => 'Shared with me', empty: t => `${t.Boards} others share with you show up here.` },
];

// Which sections are open is remembered per browser; Favorites starts open.
const OPEN_KEY = 'sidebarDashboardOpen';
const readOpen = (): SectionId[] => {
    try {
        const saved = JSON.parse(localStorage.getItem(OPEN_KEY) || 'null');
        return Array.isArray(saved) ? saved : ['favorites'];
    } catch {
        return ['favorites'];
    }
};

// Longer lists show this many until "Show all".
const SHOWN = 5;
const RECENT_MAX = 10;

/**
 * NHG's Dashboard area at the top of the sidebar: the boards someone starred,
 * opened lately, owns, and has been given by others — each a list that folds
 * away. Mine and shared split every board they can reach: theirs when they
 * own it or the workspace it is in, shared otherwise.
 */
export const SidebarDashboard = () => {
    const boards = useBoardStore(state => state.boards);
    const workspaces = useBoardStore(state => state.workspaces);
    const userBoardRoles = useBoardStore(state => state.userBoardRoles);
    const userWorkspaceRoles = useBoardStore(state => state.userWorkspaceRoles);
    const sharedBoardIds = useBoardStore(state => state.sharedBoardIds);
    const activeBoardId = useBoardStore(state => state.activeBoardId);
    const activePage = useBoardStore(state => state.activePage);
    const setActiveBoard = useBoardStore(state => state.setActiveBoard);
    const userId = useUserStore(state => state.currentUser?.id);
    const t = useTerms();

    const [open, setOpen] = useState<SectionId[]>(readOpen);
    const [showAll, setShowAll] = useState<SectionId[]>([]);

    const toggle = (id: SectionId) => {
        const next = open.includes(id) ? open.filter(s => s !== id) : [...open, id];
        setOpen(next);
        try { localStorage.setItem(OPEN_KEY, JSON.stringify(next)); } catch { /* private mode */ }
    };

    const lists = useMemo(() => {
        const live = boards.filter(b => !b.is_archived);
        const workspaceOwner = new Map(workspaces.map(w => [w.id, w.owner_id]));
        const isMine = (b: Board) =>
            userBoardRoles[b.id] === 'owner' || (!!b.workspaceId && workspaceOwner.get(b.workspaceId) === userId);
        const reachable = (b: Board) =>
            sharedBoardIds.includes(b.id) || (!!b.workspaceId && userWorkspaceRoles[b.workspaceId] !== undefined);
        const viewedAt = (b: Board) => new Date(b.lastViewedAt!).getTime();
        return {
            favorites: live.filter(b => b.isFavorite),
            recent: live.filter(b => b.lastViewedAt).sort((a, b) => viewedAt(b) - viewedAt(a)).slice(0, RECENT_MAX),
            mine: live.filter(isMine),
            shared: live.filter(b => !isMine(b) && reachable(b)),
        } satisfies Record<SectionId, Board[]>;
    }, [boards, workspaces, userBoardRoles, userWorkspaceRoles, sharedBoardIds, userId]);

    const workspaceTitle = (b: Board) => workspaces.find(w => w.id === b.workspaceId)?.title;

    return (
        <nav className="nhg-dash" aria-label="Dashboard">
            <div className="nhg-dash__label sidebar-section-label">Dashboard</div>
            {SECTIONS.map(({ id, Icon, label, empty }) => {
                const list = lists[id];
                const isOpen = open.includes(id);
                const shown = showAll.includes(id) ? list : list.slice(0, SHOWN);
                return (
                    <div key={id} className="nhg-dash__section">
                        <button
                            type="button"
                            className={clsx('nhg-dash__head', { 'is-open': isOpen })}
                            onClick={() => toggle(id)}
                            aria-expanded={isOpen}
                        >
                            <Icon size={16} className="nhg-dash__icon" />
                            <span className="nhg-dash__title">{label(t)}</span>
                            {list.length > 0 && <span className="nhg-dash__count">{list.length}</span>}
                            <ChevronRight size={14} className="nhg-dash__chevron" />
                        </button>
                        {isOpen && (
                            <div className="nhg-dash__list">
                                {list.length === 0 ? (
                                    <div className="nhg-dash__empty">{empty(t)}</div>
                                ) : shown.map(board => (
                                    <button
                                        type="button"
                                        key={board.id}
                                        className={clsx('nhg-dash__board', { 'is-active': activePage === 'board' && activeBoardId === board.id })}
                                        onClick={() => setActiveBoard(board.id)}
                                        title={workspaceTitle(board) ? `${board.title} · ${workspaceTitle(board)}` : board.title}
                                    >
                                        <BoardIcon size={14} className="nhg-dash__board-icon" />
                                        <span className="nhg-dash__board-title">{board.title}</span>
                                    </button>
                                ))}
                                {list.length > SHOWN && (
                                    <button
                                        type="button"
                                        className="nhg-dash__more"
                                        onClick={() => setShowAll(showAll.includes(id) ? showAll.filter(s => s !== id) : [...showAll, id])}
                                    >
                                        {showAll.includes(id) ? 'Show less' : `Show all ${list.length}`}
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                );
            })}
        </nav>
    );
};
