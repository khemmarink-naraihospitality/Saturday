import { useEffect, useState } from 'react';
import { Check, Search } from 'lucide-react';
import './board.css';
import { useBoardStore } from '../../store/useBoardStore';
import { useMobileUI } from '../state/mobileStore';
import { BottomSheet } from '../ui';
import { VIEW_OPTIONS } from './views';

/**
 * The board's Views sheet — reference screenshot 26: a search field and the
 * board views, the current one outlined. (monday's "Build an app with vibe",
 * per-view "…" menus and "Add View" have no counterpart here: our boards have
 * a fixed set of views.)
 */
export const ViewsSheetHost = () => {
    const boardId = useMobileUI(state => state.viewsSheetBoardId);
    const close = useMobileUI(state => state.closeViewsSheet);
    const activeViewId = useBoardStore(state => state.boards.find(b => b.id === boardId)?.activeViewId || 'main_table');
    const setActiveView = useBoardStore(state => state.setActiveView);
    const [query, setQuery] = useState('');

    useEffect(() => {
        if (!boardId) setQuery('');
    }, [boardId]);

    const q = query.trim().toLowerCase();
    const views = VIEW_OPTIONS.filter(v => !q || v.label.toLowerCase().includes(q));

    return (
        <BottomSheet open={!!boardId} onClose={close} title="Views" size="tall" testId="m-views-sheet">
            <div style={{ padding: '14px 20px 28px' }}>
                <label className="m-board-field m-board-field--search">
                    <Search size={19} />
                    <input
                        type="search"
                        placeholder="Search views"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        aria-label="Search views"
                    />
                </label>
                <div className="m-views__label">Board views</div>
                <div className="m-views__list" role="listbox" aria-label="Board views">
                    {views.map(view => {
                        const Icon = view.icon;
                        const selected = view.id === activeViewId;
                        return (
                            <button
                                key={view.id}
                                type="button"
                                role="option"
                                aria-selected={selected}
                                className={`m-views__row${selected ? ' m-views__row--on' : ''}`}
                                onClick={() => {
                                    if (boardId) setActiveView(boardId, view.id);
                                    close();
                                }}
                            >
                                <Icon size={21} strokeWidth={1.7} />
                                <span className="m-views__name">{view.label}</span>
                                {selected && <Check size={20} strokeWidth={2.2} className="m-views__check" aria-hidden="true" />}
                            </button>
                        );
                    })}
                    {views.length === 0 && <div className="m-empty">No view matches “{query.trim()}”.</div>}
                </div>
            </div>
        </BottomSheet>
    );
};
