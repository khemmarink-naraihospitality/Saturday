import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Check, Eye, EyeOff, Link2, Monitor, RefreshCw, Rows3, Star } from 'lucide-react';
import { useBoardStore } from '../../store/useBoardStore';
import { itemColumns } from '../../lib/columnScope';
import { setLayoutOverride } from '../../hooks/useIsMobile';
import type { FilterState } from '../../types';
import { Avatar, BottomSheet, PrimaryButton, TextButton, mobileToast, useBoardPeople } from '../ui';
import { tintLabel } from '../../lib/labelTint';

const SheetAction = ({ icon, label, onClick, right }: { icon: ReactNode; label: ReactNode; onClick: () => void; right?: ReactNode }) => (
    <button type="button" className="m-action" onClick={onClick}>
        <span className="m-action__icon">{icon}</span>
        <span style={{ flex: 1, minWidth: 0 }}>{label}</span>
        {right}
    </button>
);

/** The board's "…" menu. */
export const BoardActionsSheet = ({ open, onClose, boardId, allCollapsed, onToggleAllGroups }: {
    open: boolean;
    onClose: () => void;
    boardId: string;
    allCollapsed: boolean;
    onToggleAllGroups: () => void;
}) => {
    const board = useBoardStore(state => state.boards.find(b => b.id === boardId));
    const showHiddenItems = useBoardStore(state => state.showHiddenItems);
    const toggleShowHiddenItems = useBoardStore(state => state.toggleShowHiddenItems);
    const toggleFavorite = useBoardStore(state => state.toggleFavorite);
    const loadBoardData = useBoardStore(state => state.loadBoardData);

    const run = (fn: () => void) => {
        onClose();
        fn();
    };

    return (
        <BottomSheet open={open} onClose={onClose} title={board?.title || 'Board'}>
            <div style={{ padding: '6px 0 16px' }}>
                <SheetAction
                    icon={<Star size={20} color={board?.isFavorite ? '#ffcb00' : undefined} fill={board?.isFavorite ? '#ffcb00' : 'none'} />}
                    label={board?.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                    onClick={() => run(() => void toggleFavorite(boardId))}
                />
                <SheetAction
                    icon={showHiddenItems ? <EyeOff size={20} /> : <Eye size={20} />}
                    label={showHiddenItems ? 'Hide hidden items' : 'Show hidden items'}
                    onClick={() => run(toggleShowHiddenItems)}
                />
                <SheetAction icon={<Rows3 size={20} />} label={allCollapsed ? 'Expand all groups' : 'Collapse all groups'} onClick={() => run(onToggleAllGroups)} />
                <SheetAction
                    icon={<Link2 size={20} />}
                    label="Copy board link"
                    onClick={() => run(() => {
                        navigator.clipboard?.writeText(window.location.href)
                            .then(() => mobileToast('Link copied'))
                            .catch(() => mobileToast(window.location.href));
                    })}
                />
                <SheetAction
                    icon={<RefreshCw size={20} />}
                    label="Refresh"
                    onClick={() => run(() => {
                        void loadBoardData(boardId, false, true);
                        mobileToast('Board refreshed');
                    })}
                />
                <SheetAction icon={<Monitor size={20} />} label="Desktop site" onClick={() => run(() => setLayoutOverride('desktop'))} />
            </div>
        </BottomSheet>
    );
};

/** "+" in the controls row: a new item in a chosen group. */
export const NewItemSheet = ({ open, onClose, boardId }: { open: boolean; onClose: () => void; boardId: string }) => {
    const board = useBoardStore(state => state.boards.find(b => b.id === boardId));
    const addItem = useBoardStore(state => state.addItem);
    const [title, setTitle] = useState('');
    const [groupId, setGroupId] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        setTitle('');
        setGroupId(board?.groups?.[0]?.id || null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const noun = board?.itemColumnTitle || 'Item';
    const add = () => {
        const text = title.trim();
        if (!text || !groupId) return;
        void addItem(text, groupId);
        mobileToast(`${noun} added`);
        onClose();
    };

    return (
        <BottomSheet
            open={open}
            onClose={onClose}
            title={`New ${noun.toLowerCase()}`}
            headerRight={<PrimaryButton onClick={add} disabled={!title.trim() || !groupId} style={{ minHeight: 38, padding: '0 16px', fontSize: 15 }}>Add</PrimaryButton>}
        >
            <div style={{ padding: '16px 20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                <label className="m-board-field">
                    <input
                        autoFocus
                        type="text"
                        enterKeyHint="done"
                        placeholder={`New ${noun}`}
                        value={title}
                        maxLength={500}
                        onChange={(e) => setTitle(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
                        aria-label={`${noun} name`}
                    />
                </label>
                {(board?.groups?.length || 0) > 1 && (
                    <div role="radiogroup" aria-label="Group" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {board!.groups.map(group => {
                            const selected = group.id === groupId;
                            return (
                                <button
                                    key={group.id}
                                    type="button"
                                    role="radio"
                                    aria-checked={selected}
                                    className={`m-board-choice${selected ? ' m-board-choice--on' : ''}`}
                                    onClick={() => setGroupId(group.id)}
                                >
                                    <span className="m-board-choice__dot" style={{ backgroundColor: group.color }} />
                                    <span className="m-truncate" style={{ flex: 1 }}>{group.title}</span>
                                    {selected && <Check size={20} color="hsl(var(--m-accent))" />}
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
        </BottomSheet>
    );
};

/** Keep every filter but the one for `columnId`, and put `values` there (none = no filter). */
const withFilter = (filters: FilterState[] | undefined, columnId: string, values: string[]): FilterState[] => {
    const rest = (filters || []).filter(f => f.columnId !== columnId);
    return values.length ? [...rest, { columnId, values }] : rest;
};

/** "Filter by person": the board's first person column, one person at a time. */
export const PersonFilterSheet = ({ open, onClose, boardId }: { open: boolean; onClose: () => void; boardId: string }) => {
    const board = useBoardStore(state => state.boards.find(b => b.id === boardId));
    const setBoardFilters = useBoardStore(state => state.setBoardFilters);
    const people = useBoardPeople();
    const column = useMemo(() => itemColumns(board?.columns || []).find(c => c.type === 'people'), [board?.columns]);
    const current = column ? board?.filters?.find(f => f.columnId === column.id)?.values[0] : undefined;
    const list = useMemo(() => [...people.values()].sort((a, b) => a.name.localeCompare(b.name)), [people]);

    if (!column) return null;

    const choose = (userId: string | null) => {
        setBoardFilters(boardId, withFilter(board?.filters, column.id, userId ? [userId] : []));
        onClose();
    };

    return (
        <BottomSheet
            open={open}
            onClose={onClose}
            title="Filter by person"
            size={list.length > 6 ? 'tall' : 'auto'}
            headerRight={current ? <TextButton onClick={() => choose(null)}>Clear</TextButton> : undefined}
        >
            <div style={{ padding: '4px 20px 24px' }}>
                <div style={{ fontSize: 13, color: 'hsl(var(--m-text-3))', padding: '8px 0' }}>Items assigned in “{column.title}”</div>
                {list.map(person => {
                    const selected = person.id === current;
                    return (
                        <button key={person.id} type="button" className="m-board-person" onClick={() => choose(selected ? null : person.id)} aria-pressed={selected}>
                            <Avatar name={person.name} src={person.avatarUrl} size={38} />
                            <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                                <span className="m-truncate" style={{ display: 'block', fontSize: 16.5 }}>{person.name}</span>
                                {person.email && <span className="m-truncate" style={{ display: 'block', fontSize: 13.5, color: 'hsl(var(--m-text-2))' }}>{person.email}</span>}
                            </span>
                            {selected && <Check size={22} color="hsl(var(--m-accent))" />}
                        </button>
                    );
                })}
                {list.length === 0 && <div className="m-empty">No one has been added to this board.</div>}
            </div>
        </BottomSheet>
    );
};

/**
 * Group and label filters, as in the desktop filter menu (BoardViewsToolbar):
 * groups, status labels (stored as option ids) and dropdown labels (stored as
 * the labels themselves). People have their own sheet (the toolbar's avatars).
 */
export const FilterSheet = ({ open, onClose, boardId }: { open: boolean; onClose: () => void; boardId: string }) => {
    const board = useBoardStore(state => state.boards.find(b => b.id === boardId));
    const setBoardFilters = useBoardStore(state => state.setBoardFilters);
    const filters = board?.filters;

    const toggle = (columnId: string, value: string) => {
        const current = filters?.find(f => f.columnId === columnId)?.values || [];
        const next = current.includes(value) ? current.filter(v => v !== value) : [...current, value];
        setBoardFilters(boardId, withFilter(filters, columnId, next));
    };
    const isOn = (columnId: string, value: string) => !!filters?.find(f => f.columnId === columnId)?.values.includes(value);

    const filterable = useMemo(
        () => itemColumns(board?.columns || []).filter(c => c.type === 'status' || c.type === 'dropdown'),
        [board?.columns]
    );
    const active = (filters || []).reduce((n, f) => n + f.values.length, 0);

    const Chip = ({ columnId, value, label, color }: { columnId: string; value: string; label: string; color?: string }) => {
        const on = isOn(columnId, value);
        return (
            <button type="button" className={`m-board-chip${on ? ' m-board-chip--on' : ''}`} onClick={() => toggle(columnId, value)} aria-pressed={on}>
                {color && <span className="m-board-chip__dot" style={{ backgroundColor: tintLabel(color) }} />}
                {label || '(empty)'}
            </button>
        );
    };

    return (
        <BottomSheet
            open={open}
            onClose={onClose}
            title="Filter"
            size="tall"
            headerRight={active ? <TextButton onClick={() => setBoardFilters(boardId, [])}>Clear all</TextButton> : undefined}
        >
            <div style={{ padding: '4px 20px 28px', display: 'flex', flexDirection: 'column', gap: 20 }}>
                {(board?.groups?.length || 0) > 0 && (
                    <section>
                        <div className="m-board-filter-title">Group</div>
                        <div className="m-board-chips">
                            {board!.groups.map(group => (
                                <Chip key={group.id} columnId="__group__" value={group.id} label={group.title} color={group.color} />
                            ))}
                        </div>
                    </section>
                )}
                {filterable.map(column => (
                    <section key={column.id}>
                        <div className="m-board-filter-title">{column.title}</div>
                        <div className="m-board-chips">
                            {(Array.isArray(column.options) ? column.options : []).map(option => (
                                <Chip
                                    key={option.id}
                                    columnId={column.id}
                                    // Status cells hold the option id, dropdown cells the label.
                                    value={column.type === 'status' ? option.id : option.label}
                                    label={option.label}
                                    color={option.color}
                                />
                            ))}
                        </div>
                    </section>
                ))}
                {filterable.length === 0 && (board?.groups?.length || 0) === 0 && (
                    <div className="m-empty">There is nothing on this board to filter by.</div>
                )}
            </div>
        </BottomSheet>
    );
};
