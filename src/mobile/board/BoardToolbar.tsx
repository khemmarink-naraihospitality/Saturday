import { useEffect, useMemo, useRef, useState } from 'react';
import { ListFilter, Search, UserRound, X } from 'lucide-react';
import { useBoardStore } from '../../store/useBoardStore';
import { itemColumns } from '../../lib/columnScope';
import { Avatar, useBoardPeople } from '../ui';
import { FilterSheet, PersonFilterSheet } from './boardSheets';
import { AiSparkleIcon } from './icons';
import { useAiSummaryEnabled } from '../../hooks/useAiSummaryEnabled';

/**
 * The floating pill at the bottom of a board (reference 18): Quick find, a
 * person filter, the filter sheet and the AI summary view.
 */
export const BoardToolbar = ({ boardId }: { boardId: string }) => {
    const searchQuery = useBoardStore(state => state.searchQuery);
    const setSearchQuery = useBoardStore(state => state.setSearchQuery);
    const setActiveView = useBoardStore(state => state.setActiveView);
    const columns = useBoardStore(state => state.boards.find(b => b.id === boardId)?.columns);
    const filters = useBoardStore(state => state.boards.find(b => b.id === boardId)?.filters);
    const people = useBoardPeople();
    const aiEnabled = useAiSummaryEnabled();

    const [searching, setSearching] = useState(!!searchQuery);
    const [text, setText] = useState(searchQuery);
    const [sheet, setSheet] = useState<'person' | 'filter' | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Typing filters as you go, a beat behind the keyboard so a long board
    // doesn't regroup on every keystroke.
    useEffect(() => {
        const timer = window.setTimeout(() => setSearchQuery(text.trim()), 150);
        return () => window.clearTimeout(timer);
    }, [text, setSearchQuery]);

    // Cleared from elsewhere (the table's "Clear search" button): follow suit.
    useEffect(() => {
        if (searchQuery) return;
        setText(prev => (prev.trim() ? '' : prev));
    }, [searchQuery]);

    const personColumn = useMemo(() => itemColumns(columns || []).find(c => c.type === 'people'), [columns]);
    const personFilter = personColumn ? filters?.find(f => f.columnId === personColumn.id && f.values.length > 0) : undefined;
    const filteredPerson = personFilter ? people.get(personFilter.values[0]) : undefined;
    const otherFilters = (filters || []).filter(f => f !== personFilter && f.values.length > 0).length;

    const closeSearch = () => {
        setText('');
        setSearchQuery('');
        setSearching(false);
    };

    return (
        <>
            <div className="m-board-toolbar" role="toolbar" aria-label="Board tools">
                {searching ? (
                    <label className="m-board-toolbar__search">
                        <span className="m-board-toolbar__search-icon"><Search size={17} strokeWidth={2.3} /></span>
                        <input
                            ref={inputRef}
                            autoFocus
                            type="search"
                            enterKeyHint="search"
                            placeholder="Quick find"
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Escape') closeSearch(); }}
                            aria-label="Quick find"
                        />
                        <button type="button" className="m-board-toolbar__clear" onClick={closeSearch} aria-label="Close quick find">
                            <X size={17} />
                        </button>
                    </label>
                ) : (
                    <>
                        <button type="button" className="m-board-toolbar__find" onClick={() => setSearching(true)}>
                            <span className="m-board-toolbar__search-icon"><Search size={17} strokeWidth={2.3} /></span>
                            <span className="m-truncate">Quick find</span>
                        </button>
                        {personColumn && (
                            <button
                                type="button"
                                className={`m-board-toolbar__people${filteredPerson ? ' m-board-toolbar__people--on' : ''}`}
                                onClick={() => setSheet('person')}
                                aria-label={filteredPerson ? `Filtered by ${filteredPerson.name}` : 'Filter by person'}
                            >
                                {filteredPerson ? (
                                    <Avatar name={filteredPerson.name} src={filteredPerson.avatarUrl} size={30} />
                                ) : (
                                    <span className="m-board-toolbar__ghosts" aria-hidden="true">
                                        <span /><span><UserRound size={15} strokeWidth={1.8} /></span>
                                    </span>
                                )}
                            </button>
                        )}
                        <button
                            type="button"
                            className={`m-board-toolbar__btn${otherFilters ? ' m-board-toolbar__btn--on' : ''}`}
                            onClick={() => setSheet('filter')}
                            aria-label={otherFilters ? `Filters (${otherFilters} on)` : 'Filter'}
                        >
                            <ListFilter size={20} strokeWidth={1.9} />
                            {otherFilters > 0 && <span className="m-board-toolbar__dot" />}
                        </button>
                        {/* Only when AI Summary is switched on in Admin › AI Settings. */}
                        {aiEnabled === true && (
                            <button type="button" className="m-board-toolbar__btn" onClick={() => setActiveView(boardId, 'ai_summary')} aria-label="AI summary">
                                <AiSparkleIcon size={21} />
                            </button>
                        )}
                    </>
                )}
            </div>

            <PersonFilterSheet open={sheet === 'person'} onClose={() => setSheet(null)} boardId={boardId} />
            <FilterSheet open={sheet === 'filter'} onClose={() => setSheet(null)} boardId={boardId} />
        </>
    );
};
