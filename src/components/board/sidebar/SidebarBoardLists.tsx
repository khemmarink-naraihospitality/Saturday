import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { clsx } from 'clsx';
import { useBoardStore } from '../../../store/useBoardStore';
import { useTerms } from '../../../lib/terms';
import { BoardIcon } from './SidebarIcons';
import { SECTIONS, SHOWN, useSidebarBoardLists, type SectionId } from './SidebarDashboard';

// Which lists are open, per browser. They start folded, so the sidebar looks
// as it did until someone opens one.
const OPEN_KEY = 'sidebarBoardListsOpen';
const readOpen = (): SectionId[] => {
    try {
        const saved = JSON.parse(localStorage.getItem(OPEN_KEY) || 'null');
        return Array.isArray(saved) ? saved : [];
    } catch {
        return [];
    }
};

const LISTS: SectionId[] = ['recent', 'mine', 'shared'];

/**
 * Saturday's sidebar under Favorites (user request 17-Nov-2026): Recently
 * visited, My boards and Shared with me, each folding open to its boards — the
 * same lists as NHG's Dashboard area (useSidebarBoardLists), in Saturday's
 * nav look. Favorites stays the link to its page above them.
 */
export const SidebarBoardLists = () => {
    const workspaces = useBoardStore(state => state.workspaces);
    const activeBoardId = useBoardStore(state => state.activeBoardId);
    const activePage = useBoardStore(state => state.activePage);
    const setActiveBoard = useBoardStore(state => state.setActiveBoard);
    const t = useTerms();
    const lists = useSidebarBoardLists();

    const [open, setOpen] = useState<SectionId[]>(readOpen);
    const [showAll, setShowAll] = useState<SectionId[]>([]);

    const toggle = (id: SectionId) => setOpen(prev => {
        const next = prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id];
        try { localStorage.setItem(OPEN_KEY, JSON.stringify(next)); } catch { /* private mode */ }
        return next;
    });

    const workspaceTitle = (id?: string) => workspaces.find(w => w.id === id)?.title;

    return (
        <div className="sat-lists">
            {SECTIONS.filter(s => LISTS.includes(s.id)).map(({ id, Icon, label, empty }) => {
                const list = lists[id];
                const isOpen = open.includes(id);
                const shown = showAll.includes(id) ? list : list.slice(0, SHOWN);
                return (
                    <div key={id} className="sat-lists__section">
                        <button
                            type="button"
                            className={clsx('sat-lists__head', { 'is-open': isOpen })}
                            onClick={() => toggle(id)}
                            aria-expanded={isOpen}
                        >
                            <Icon size={18} className="sat-lists__icon" />
                            <span className="sidebar-nav-label sat-lists__title">{label(t)}</span>
                            {list.length > 0 && <span className="sat-lists__count">{list.length}</span>}
                            <ChevronRight size={14} className="sat-lists__chevron" />
                        </button>
                        {isOpen && (
                            <div className="sat-lists__list">
                                {list.length === 0 ? (
                                    <div className="sat-lists__empty">{empty(t)}</div>
                                ) : shown.map(board => (
                                    <button
                                        type="button"
                                        key={board.id}
                                        className={clsx('sat-lists__board', { 'is-active': activePage === 'board' && activeBoardId === board.id })}
                                        onClick={() => setActiveBoard(board.id)}
                                        title={workspaceTitle(board.workspaceId) ? `${board.title} · ${workspaceTitle(board.workspaceId)}` : board.title}
                                    >
                                        <BoardIcon size={14} className="sat-lists__board-icon" />
                                        <span className="sat-lists__board-title">{board.title}</span>
                                    </button>
                                ))}
                                {list.length > SHOWN && (
                                    <button
                                        type="button"
                                        className="sat-lists__more"
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
        </div>
    );
};
