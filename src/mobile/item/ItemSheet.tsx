import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, Link2, MoreHorizontal, Plus, Share, Trash2, X } from 'lucide-react';
import './item.css';
import { useBoardStore } from '../../store/useBoardStore';
import { usePermission } from '../../hooks/usePermission';
import { getDedupedUpdates, hasHtmlContent, previewText } from '../../lib/updates';
import type { Board, Item } from '../../types';
import { BottomSheet, CenteredSpinner, EmptyState, IconButton, PrimaryButton, SegmentedTabs, mobileToast, useBoardPeople } from '../ui';
import { useMobileUI, type ItemTab } from '../state/mobileStore';
import { closeItem, openBoard } from '../nav/navigation';
import { afterSheetClose } from '../nav/history';
import { UpdatesTab } from './UpdatesTab';
import { ColumnsTab } from './ColumnsTab';
import { FilesTab } from './FilesTab';
import { Composer, type ComposerMode } from './Composer';

/** The link every notification uses for an item (itemSlice.addUpdate): the board with the item open. */
const itemLink = (boardId: string, itemId: string) => `${window.location.origin}/?boardId=${boardId}&itemId=${itemId}`;

const shareItem = async (title: string, url: string) => {
    if (navigator.share) {
        try {
            await navigator.share({ title, url });
            return;
        } catch (err) {
            // Dismissing the share sheet isn't a failure.
            if ((err as Error)?.name === 'AbortError') return;
        }
    }
    try {
        await navigator.clipboard.writeText(url);
        mobileToast('Link copied');
    } catch {
        mobileToast(url);
    }
};

/** The title, renamed in place: tap, type, Enter or tap away to keep it. */
const ItemTitle = ({ item, canEdit }: { item: Item; canEdit: boolean }) => {
    const updateItemTitle = useBoardStore(state => state.updateItemTitle);
    const [editing, setEditing] = useState(false);
    const [text, setText] = useState(item.title);
    const ref = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        if (!editing) setText(item.title);
    }, [item.title, editing]);

    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${el.scrollHeight}px`;
    }, [text, editing]);

    const commit = () => {
        const next = text.replace(/\s+/g, ' ').trim();
        setEditing(false);
        if (next && next !== item.title) void updateItemTitle(item.id, next, true);
        else setText(item.title);
    };

    if (editing) {
        return (
            <textarea
                ref={ref}
                className="m-item__title m-item__title-input"
                value={text}
                rows={1}
                autoFocus
                enterKeyHint="done"
                maxLength={500}
                onChange={(e) => setText(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); commit(); }
                    if (e.key === 'Escape') { setText(item.title); setEditing(false); }
                }}
                aria-label="Item name"
            />
        );
    }
    return canEdit ? (
        <button type="button" className="m-item__title" onClick={() => setEditing(true)} aria-label={`${item.title}. Rename`}>
            {item.title}
        </button>
    ) : (
        <h1 className="m-item__title">{item.title}</h1>
    );
};

/** "+ Write an update", floating over the bottom of the Updates tab (reference 19). */
const ComposerPill = ({ itemId, onOpen }: { itemId: string; onOpen: () => void }) => {
    const draft = useBoardStore(state => state.drafts[itemId] || '');
    const preview = hasHtmlContent(draft) ? previewText(draft) : '';
    return (
        <div className="m-composer-pill-wrap">
            <button type="button" className="m-composer-pill" onClick={onOpen} data-testid="m-composer-pill">
                <span className="m-composer-pill__plus" aria-hidden="true"><Plus size={22} strokeWidth={1.8} /></span>
                <span className={`m-truncate${preview ? ' m-composer-pill__draft' : ''}`}>{preview ? `Draft: ${preview}` : 'Write an update'}</span>
            </button>
        </div>
    );
};

const ItemContent = ({ board, item }: { board: Board; item: Item }) => {
    const tab = useMobileUI(state => state.itemTab);
    const setTab = useMobileUI(state => state.setItemTab);
    const activeBoardId = useBoardStore(state => state.activeBoardId);
    const people = useBoardPeople();
    const { can } = usePermission();
    const canEdit = can('edit_items');

    const [composer, setComposer] = useState<ComposerMode | null>(null);
    const [expandedThreads, setExpandedThreads] = useState<Set<string>>(() => new Set());

    const group = board.groups.find(g => g.id === item.groupId);
    const parent = item.parentId ? board.items.find(i => i.id === item.parentId) : undefined;
    const groupColor = group?.color || (parent ? board.groups.find(g => g.id === parent.groupId)?.color : undefined);

    const updatesCount = item.updatesLoaded === false
        ? (item.updatesCount ?? 0)
        : getDedupedUpdates(item.updates).length;
    const filesCount = item.files?.length || 0;

    const toggleThread = useCallback((id: string) => setExpandedThreads(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
    }), []);

    const onPosted = useCallback((mode: ComposerMode) => {
        // A new reply should be in sight.
        if (mode.kind === 'reply') setExpandedThreads(prev => new Set(prev).add(mode.parent.id));
    }, []);

    const crumbs = [board.title, parent ? parent.title : group?.title].filter(Boolean) as string[];
    const toBoard = () => {
        closeItem();
        if (activeBoardId !== board.id) afterSheetClose(() => openBoard(board.id));
    };

    return (
        <>
            <div className="m-item__head">
                <ItemTitle item={item} canEdit={canEdit} />
                <button type="button" className="m-item__crumbs" onClick={toBoard} aria-label={`Open ${crumbs.join(', ')}`}>
                    {crumbs.map((crumb, i) => (
                        <span key={i} className="m-item__crumb">
                            {i > 0 && <ChevronRight size={15} className="m-item__crumb-sep" aria-hidden="true" />}
                            <span className="m-truncate">{crumb}</span>
                        </span>
                    ))}
                </button>
            </div>

            <div className="m-item__tabs">
                <SegmentedTabs<ItemTab>
                    value={tab}
                    onChange={setTab}
                    ariaLabel="Item sections"
                    options={[
                        { value: 'columns', label: 'Columns' },
                        { value: 'updates', label: updatesCount > 0 ? `Updates (${updatesCount})` : 'Updates' },
                        { value: 'files', label: filesCount > 0 ? `Files (${filesCount})` : 'Files' },
                    ]}
                />
            </div>

            <div className="m-item__panel" role="tabpanel">
                {tab === 'columns' && <ColumnsTab board={board} item={item} canEdit={canEdit} people={people} groupColor={groupColor} />}
                {tab === 'updates' && (
                    <UpdatesTab item={item} people={people} onCompose={setComposer} expandedThreads={expandedThreads} onToggleThread={toggleThread} onExpandThread={(id) => setExpandedThreads(prev => (prev.has(id) ? prev : new Set(prev).add(id)))} />
                )}
                {tab === 'files' && <FilesTab item={item} canEdit={canEdit} />}
            </div>

            {tab === 'updates' && <ComposerPill itemId={item.id} onOpen={() => setComposer({ kind: 'new' })} />}

            <Composer itemId={item.id} mode={composer} onClose={() => setComposer(null)} onPosted={onPosted} />

        </>
    );
};

/** The item's "…": copy the link, share it, delete the item (with an Undo). */
const ItemActionSheets = ({ board, item, menu, setMenu }: {
    board: Board;
    item: Item;
    menu: 'actions' | 'delete' | null;
    setMenu: (menu: 'actions' | 'delete' | null) => void;
}) => {
    const deleteItem = useBoardStore(state => state.deleteItem);
    const restoreItem = useBoardStore(state => state.restoreItem);
    const activeBoardId = useBoardStore(state => state.activeBoardId);
    const { can } = usePermission();
    // deleteItem works on the open board.
    const canDelete = can('delete_items') && activeBoardId === board.id;
    const link = itemLink(board.id, item.id);

    return (
        <>
            <BottomSheet open={menu === 'actions'} onClose={() => setMenu(null)} title={item.title}>
                <div style={{ padding: '6px 0 16px' }}>
                    <button
                        type="button"
                        className="m-action"
                        onClick={() => {
                            setMenu(null);
                            navigator.clipboard?.writeText(link).then(() => mobileToast('Link copied')).catch(() => mobileToast(link));
                        }}
                    >
                        <span className="m-action__icon"><Link2 size={20} /></span>
                        <span style={{ flex: 1 }}>Copy link</span>
                    </button>
                    <button type="button" className="m-action" onClick={() => { setMenu(null); void shareItem(item.title, link); }}>
                        <span className="m-action__icon"><Share size={20} /></span>
                        <span style={{ flex: 1 }}>Share</span>
                    </button>
                    {canDelete && (
                        <button type="button" className="m-action m-action--danger" onClick={() => setMenu('delete')}>
                            <span className="m-action__icon"><Trash2 size={20} /></span>
                            <span style={{ flex: 1 }}>Delete {item.parentId ? 'subitem' : 'item'}</span>
                        </button>
                    )}
                </div>
            </BottomSheet>

            <BottomSheet open={menu === 'delete'} onClose={() => setMenu(null)} title={`Delete “${item.title}”?`}>
                <div style={{ padding: '16px 20px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ fontSize: 15, color: 'hsl(var(--m-text-2))' }}>
                        {item.parentId ? 'The subitem goes' : 'The item and its subitems go'} to the board's trash, where they can be restored.
                    </div>
                    <PrimaryButton
                        style={{ background: 'hsl(var(--color-danger))' }}
                        onClick={() => {
                            const { id, boardId, title } = item;
                            setMenu(null);
                            closeItem();
                            void deleteItem(id);
                            mobileToast(`“${title}” deleted`, 'info', { label: 'Undo', onClick: () => void restoreItem(id, boardId, title) });
                        }}
                    >
                        Delete
                    </PrimaryButton>
                </div>
            </BottomSheet>
        </>
    );
};

/**
 * An item's own screen — reference screenshot 19: close, share and "…" on top;
 * the name (tap to rename) and where it lives; Columns, Updates and Files.
 * Opens over whatever screen opened it (useBoardStore.activeItemId) and owns a
 * history entry, so the back gesture closes it.
 */
export const ItemSheet = () => {
    const itemId = useBoardStore(state => state.activeItemId);
    // The item lives on the open board — or, while a link is still loading, on
    // whichever loaded board has it.
    const board = useBoardStore(state => {
        if (!state.activeItemId) return undefined;
        const active = state.boards.find(b => b.id === state.activeBoardId);
        if (active?.items.some(i => i.id === state.activeItemId)) return active;
        return state.boards.find(b => b.isDataLoaded && b.items.some(i => i.id === state.activeItemId)) || active;
    });
    const item = useMemo(() => board?.items.find(i => i.id === itemId), [board, itemId]);
    const [menu, setMenu] = useState<'actions' | 'delete' | null>(null);

    useEffect(() => {
        if (!itemId) setMenu(null);
    }, [itemId]);

    let body;
    if (!itemId) body = null;
    else if (item && board) body = <ItemContent key={item.id} board={board} item={item} />;
    else if (!board || !board.isDataLoaded) body = <CenteredSpinner message="Loading item…" />;
    else body = <EmptyState title="This item isn't here any more">It may have been deleted or moved to another board.</EmptyState>;

    return (
        <>
            <BottomSheet
                open={!!itemId}
                onClose={closeItem}
                size="full"
                className="m-item-sheet"
                testId="m-item"
                ariaLabel={item?.title || 'Item'}
                headerLeft={(
                    <button type="button" className="m-item__close" onClick={closeItem} aria-label="Close">
                        <X size={26} strokeWidth={1.8} />
                    </button>
                )}
                headerRight={item && board ? (
                    <div className="m-item__actions">
                        <IconButton label="Share" size={36} onClick={() => void shareItem(item.title, itemLink(board.id, item.id))}>
                            <Share size={19} strokeWidth={1.8} />
                        </IconButton>
                        <IconButton label="More actions" size={36} onClick={() => setMenu('actions')}>
                            <MoreHorizontal size={21} strokeWidth={1.9} />
                        </IconButton>
                    </div>
                ) : undefined}
                bodyStyle={{ background: 'hsl(var(--m-bg))', display: 'flex', flexDirection: 'column' }}
            >
                {body}
            </BottomSheet>
            {item && board && <ItemActionSheets board={board} item={item} menu={menu} setMenu={setMenu} />}
        </>
    );
};
