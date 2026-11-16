import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    CheckCircle2, ChevronRight, Columns3, CornerDownRight, Folder, LayoutGrid, ListChecks,
    Loader2, MessageSquare, RotateCcw, Rows3, Search, SquareCheck, Trash2,
} from 'lucide-react';
import { PopupPanel } from '../ui/PopupPanel';
import { useTerms, countOf, type Terms } from '../../lib/terms';
import { useUserStore } from '../../store/useUserStore';
import {
    TRASH_PAGE, afterRestore, fetchTrash, fetchTrashCounts, isRestoreError, locationParts, openRestored, restoreTrashEntry,
    type Restored, type TrashEntry, type TrashKind,
} from '../../lib/trash';
import '../../styles/trash.css';

/*
 * Profile menu › Trash: everything deleted that this person can open — folders,
 * boards, groups, items and sub-items, columns and updates — newest first, each
 * with where it was (folder › board › group…), who deleted it and when, and a
 * Restore that puts it back in that same place. After a restore the row says
 * where it now is and offers to open it. src/lib/trash.ts does the work.
 */

type Filter = Exclude<TrashKind, 'subitem'> | 'all';

const KIND_ICON: Record<TrashKind, typeof Folder> = {
    workspace: Folder,
    board: LayoutGrid,
    group: Rows3,
    item: SquareCheck,
    subitem: CornerDownRight,
    column: Columns3,
    update: MessageSquare,
};

const kindName = (kind: TrashKind, t: Terms) => ({
    workspace: t.Workspace, board: t.Board, group: t.Group, item: t.Item,
    subitem: t.Subitem, column: 'Column', update: t.Update,
}[kind]);

const filterName = (f: Filter, t: Terms) => ({
    all: 'All', workspace: t.Workspaces, board: t.Boards, group: t.Groups, item: t.Items, column: 'Columns', update: t.Updates,
}[f]);

const FILTERS: Filter[] = ['all', 'workspace', 'board', 'group', 'item', 'column', 'update'];

const when = (iso: string | null) => {
    if (!iso) return null;
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    return `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}, ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
};

/** "with 12 tasks", "with 3 replies"… what went to the Trash inside it, or still sits in it. */
const innerText = (e: TrashEntry, t: Terms): string | null => {
    const n = e.innerCount;
    if (!n) return null;
    switch (e.kind) {
        case 'workspace': return `with ${countOf(n, t.board, t.boards)}`;
        case 'board':
        case 'group': return `with ${countOf(n, t.item, t.items)}`;
        case 'item':
        case 'subitem': return `with ${countOf(n, t.subitem, t.subitems)}`;
        case 'update': return `with ${countOf(n, 'reply', 'replies')}`;
        default: return null;
    }
};

const Where = ({ entry, t }: { entry: TrashEntry; t: Terms }) => {
    const parts = locationParts(entry);
    if (entry.kind === 'column' && entry.columnScope === 'subitem' && entry.groupTitle) {
        // A sub-item column belongs to one group's sub-items
        const last = parts[parts.length - 1];
        if (last) last.label = `${last.label} (${t.subitems})`;
    }
    if (parts.length === 0) {
        return <span className="trash-where__part">{entry.kind === 'workspace' ? 'Top level' : 'Unknown place'}</span>;
    }
    return (
        <>
            {parts.map((p, i) => (
                <span key={i} className="trash-where__step">
                    {i > 0 && <ChevronRight size={12} className="trash-where__sep" aria-hidden="true" />}
                    <span className="trash-where__part">
                        {p.folder ? <Folder size={12} aria-hidden="true" /> : null}
                        {p.color ? <i className="trash-where__dot" style={{ background: p.color }} aria-hidden="true" /> : null}
                        {p.label}
                    </span>
                    {p.trashed && <span className="trash-where__tag">in Trash</span>}
                </span>
            ))}
        </>
    );
};

type RowState = { status: 'idle' | 'busy' | 'done' | 'error'; message?: string; restored?: Restored };

const TrashRow = ({ entry, state, canRestore, t, onRestore, onOpen }: {
    entry: TrashEntry;
    state: RowState;
    canRestore: boolean;
    t: Terms;
    onRestore: () => void;
    onOpen: () => void;
}) => {
    const Icon = KIND_ICON[entry.kind];
    const inner = innerText(entry, t);
    const deleted = when(entry.deletedAt);
    const done = state.status === 'done';
    return (
        <li className={`trash-row${done ? ' is-restored' : ''}`} data-kind={entry.kind}>
            <span className="trash-row__icon" aria-hidden="true"><Icon size={16} /></span>
            <div className="trash-row__main">
                <div className="trash-row__head">
                    <span className="trash-row__kind">{kindName(entry.kind, t)}</span>
                    <span className="trash-row__title" title={entry.title}>{entry.title || 'Untitled'}</span>
                    {inner && <span className="trash-row__inner">{inner}</span>}
                </div>
                <div className="trash-where">
                    <span className="trash-where__label">{done ? 'Restored to' : 'From'}</span>
                    <Where entry={entry} t={t} />
                </div>
                {done ? (
                    state.restored?.alsoRestored.length ? (
                        <div className="trash-row__done" role="status">
                            <CheckCircle2 size={14} aria-hidden="true" />
                            <span>
                                {'Also brought back, since it sat inside: '}
                                {state.restored.alsoRestored.map((a, i) => (
                                    <span key={i}>{i > 0 ? ', ' : ''}{kindName(a.kind, t)} <strong>{a.title}</strong></span>
                                ))}
                            </span>
                        </div>
                    ) : null
                ) : (
                    <div className="trash-row__meta">
                        {`Deleted by ${entry.deletedByName || 'someone'}`}
                        <span aria-hidden="true"> · </span>
                        {deleted || 'date not recorded'}
                    </div>
                )}
                {state.status === 'error' && <div className="trash-row__error" role="alert">{state.message}</div>}
                {!canRestore && !done && (
                    <div className="trash-row__note">{`Only ${entry.deletedByName || 'the person who deleted it'} or an admin can restore this ${t.update}.`}</div>
                )}
            </div>
            <div className="trash-row__actions">
                {done ? (
                    <button type="button" className="trash-btn trash-btn--open" onClick={onOpen}>Open</button>
                ) : canRestore ? (
                    <button type="button" className="trash-btn" onClick={onRestore} disabled={state.status === 'busy'}>
                        {state.status === 'busy' ? <Loader2 size={14} className="trash-spin" aria-hidden="true" /> : <RotateCcw size={14} aria-hidden="true" />}
                        {state.status === 'busy' ? 'Restoring…' : 'Restore'}
                    </button>
                ) : null}
            </div>
        </li>
    );
};

export const TrashPanel = ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => {
    const t = useTerms();
    const me = useUserStore(s => s.currentUser);
    const isAdmin = me.system_role === 'super_admin' || me.system_role === 'it_admin';

    const [filter, setFilter] = useState<Filter>('all');
    const [search, setSearch] = useState('');
    const [query, setQuery] = useState('');
    const [mine, setMine] = useState(false);
    const [rows, setRows] = useState<TrashEntry[]>([]);
    const [total, setTotal] = useState(0);
    const [counts, setCounts] = useState<Record<string, number>>({});
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [rowState, setRowState] = useState<Record<string, RowState>>({});
    const request = useRef(0);

    // Typing settles before it is searched
    useEffect(() => {
        const timer = window.setTimeout(() => setQuery(search), 250);
        return () => window.clearTimeout(timer);
    }, [search]);

    const load = useCallback(async (offset: number) => {
        const ticket = ++request.current;
        setLoading(true);
        setLoadError(null);
        try {
            const kind = filter === 'all' ? null : filter;
            const [page, kinds] = await Promise.all([
                fetchTrash({ kind, search: query, mine, offset, limit: TRASH_PAGE }),
                offset === 0 ? fetchTrashCounts({ search: query, mine }) : Promise.resolve(null),
            ]);
            if (ticket !== request.current) return;
            setRows(prev => (offset === 0 ? page.rows : [...prev, ...page.rows]));
            setTotal(page.total || (offset === 0 ? 0 : total));
            if (kinds) setCounts(kinds);
        } catch (err) {
            if (ticket !== request.current) return;
            setLoadError((err as Error).message || 'The Trash could not be read.');
        } finally {
            if (ticket === request.current) setLoading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filter, query, mine]);

    useEffect(() => {
        if (!isOpen) return;
        load(0);
    }, [isOpen, load]);

    // A fresh look each time it opens
    useEffect(() => {
        if (isOpen) return;
        setRowState({});
    }, [isOpen]);

    const allCount = useMemo(() => Object.values(counts).reduce((a, b) => a + b, 0), [counts]);

    const restore = async (e: TrashEntry) => {
        const key = `${e.kind}:${e.id}`;
        setRowState(s => ({ ...s, [key]: { status: 'busy' } }));
        try {
            const restored = await restoreTrashEntry(e);
            const next = afterRestore(rows, e, restored);
            setRows(next.rows);
            setRowState(s => {
                const out = { ...s, [key]: { status: 'done' as const, restored } };
                for (const k of next.alsoDone) out[k] = { status: 'done', restored: { alsoRestored: [] } };
                return out;
            });
            fetchTrashCounts({ search: query, mine }).then(setCounts).catch(() => undefined);
        } catch (err) {
            const message = isRestoreError(err) ? err.message : `Could not restore it: ${(err as Error)?.message || 'unknown error'}`;
            setRowState(s => ({ ...s, [key]: { status: 'error', message } }));
        }
    };

    const open = (e: TrashEntry) => {
        const restored = rowState[`${e.kind}:${e.id}`]?.restored;
        onClose();
        openRestored(e, restored);
    };

    const shown = rows.length;
    const left = Math.max(0, total - shown);

    return (
        <PopupPanel isOpen={isOpen} onClose={onClose} eyebrow="Recently deleted" title="Trash" width={880}>
            <div className="trash">
                <p className="trash__intro">
                    {`Everything deleted in the ${t.workspaces} and ${t.boards} you can open waits here. Restore puts it back exactly where it was.`}
                </p>

                <div className="trash__bar">
                    <label className="trash__search">
                        <Search size={15} aria-hidden="true" />
                        <input
                            type="search"
                            value={search}
                            onChange={ev => setSearch(ev.target.value)}
                            placeholder="Search the Trash by name"
                            aria-label="Search the Trash"
                        />
                    </label>
                    <label className="trash__mine">
                        <input type="checkbox" checked={mine} onChange={ev => setMine(ev.target.checked)} />
                        Deleted by me
                    </label>
                </div>

                <div className="trash__filters" role="group" aria-label="Show">
                    {FILTERS.map(f => {
                        const n = f === 'all' ? allCount : counts[f] || 0;
                        return (
                            <button
                                key={f}
                                type="button"
                                className="trash-chip"
                                aria-pressed={filter === f}
                                onClick={() => setFilter(f)}
                                disabled={f !== 'all' && n === 0 && filter !== f}
                            >
                                {filterName(f, t)}
                                <span className="trash-chip__n">{n}</span>
                            </button>
                        );
                    })}
                </div>

                {loadError ? (
                    <div className="trash__empty trash__empty--error" role="alert">
                        <p>{loadError}</p>
                        <button type="button" className="trash-btn" onClick={() => load(0)}>Try again</button>
                    </div>
                ) : rows.length === 0 && !loading ? (
                    <div className="trash__empty">
                        <span className="trash__empty-icon" aria-hidden="true"><Trash2 size={22} /></span>
                        <p className="trash__empty-title">{query || mine || filter !== 'all' ? 'Nothing here matches' : 'The Trash is empty'}</p>
                        <p>{query || mine || filter !== 'all'
                            ? 'Try another name, or show everything.'
                            : `What you delete — a ${t.workspace}, ${t.board}, ${t.group}, ${t.item}, column or ${t.update} — comes here first.`}</p>
                    </div>
                ) : (
                    <ul className="trash__list" aria-busy={loading}>
                        {rows.map(e => {
                            const key = `${e.kind}:${e.id}`;
                            return (
                                <TrashRow
                                    key={key}
                                    entry={e}
                                    t={t}
                                    state={rowState[key] || { status: 'idle' }}
                                    canRestore={e.kind !== 'update' || e.deletedBy === me.id || isAdmin}
                                    onRestore={() => restore(e)}
                                    onOpen={() => open(e)}
                                />
                            );
                        })}
                    </ul>
                )}

                <div className="trash__foot">
                    {loading ? (
                        <span className="trash__loading"><Loader2 size={14} className="trash-spin" aria-hidden="true" /> Loading…</span>
                    ) : left > 0 ? (
                        <button type="button" className="trash-btn trash-btn--quiet" onClick={() => load(shown)}>
                            <ListChecks size={14} aria-hidden="true" />{`Show ${Math.min(left, TRASH_PAGE)} more (${left} not shown)`}
                        </button>
                    ) : rows.length > 0 ? (
                        <span className="trash__count">{filter !== 'all' || query || mine ? `${total} match` : `${countOf(total, 'thing', 'things')} in the Trash`}</span>
                    ) : null}
                </div>
            </div>
        </PopupPanel>
    );
};
