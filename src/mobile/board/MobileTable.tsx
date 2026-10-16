import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import './table/table.css';
import { useBoardStore } from '../../store/useBoardStore';
import { filterAndSortItems } from '../../lib/boardRows';
import { groupItems } from '../../utils/grouping';
import { itemColumns, subitemColumns } from '../../lib/columnScope';
import { itemUpdateSummary } from '../../lib/utils';
import type { Column, Item } from '../../types';
import { columnWidthFor, NAME_COLUMN_MIN_WIDTH, NAME_COLUMN_WIDTH, UPDATES_COLUMN_WIDTH } from '../cells';
import { useBoardPeople } from '../ui';
import { mediumSheetHeightPx } from '../ui/BottomSheet';
import { useMobileUI } from '../state/mobileStore';
import { openItem } from '../nav/navigation';
import { GUTTER, ROW_HEIGHT, nameColumnWidth, rowOffsets, stickyGroupIndex, toTableRows, type TableRow } from './table/layout';
import { FooterRow, GroupHeaderRow, ItemRow, SubFooterRow, SubHeaderRow, type RowContext } from './table/rows';

/** Room under the last row for the floating toolbar (BoardScreen sets the variable). */
const BOTTOM_SPACE = 'var(--m-board-toolbar-space, 104px)';
const RIGHT_PAD = 16;

const widthOf = (columns: Column[]) => columns.reduce((sum, col) => sum + columnWidthFor(col), 0);

/**
 * The board's main table on a phone — reference screenshots 18, 20 and 25.
 *
 * One scroller in both directions. Rows come from exactly the desktop pipeline
 * (filterAndSortItems → groupItems), so search, filters, sort, group-by,
 * collapsed groups and expanded sub-items behave as they do on desktop; they
 * are virtualised vertically (fixed heights per row type), since a board can
 * hold thousands of rows. Sideways, the name column stays frozen and narrows as
 * the columns slide in (ref 18 → 20), driven by a CSS variable written on
 * scroll — no React render per frame. The header of the group being scrolled
 * through stays pinned to the top.
 */
export const MobileTable = ({ boardId, canEdit }: { boardId: string; canEdit: boolean }) => {
    const board = useBoardStore(state => state.boards.find(b => b.id === boardId));
    const searchQuery = useBoardStore(state => state.searchQuery);
    const showHiddenItems = useBoardStore(state => state.showHiddenItems);
    const toggleGroup = useBoardStore(state => state.toggleGroup);
    const toggleItemExpansion = useBoardStore(state => state.toggleItemExpansion);
    const addItem = useBoardStore(state => state.addItem);
    const setBoardFilters = useBoardStore(state => state.setBoardFilters);
    const setSearchQuery = useBoardStore(state => state.setSearchQuery);
    const people = useBoardPeople();
    const editing = useMobileUI(state => state.cellEditor);

    const scrollRef = useRef<HTMLDivElement>(null);
    const [stickyIndex, setStickyIndex] = useState<number | null>(null);
    const [adding, setAdding] = useState<{ groupId: string; parentId?: string } | null>(null);
    const [draft, setDraft] = useState('');

    const columns = board?.columns;
    const itemCols = useMemo(() => itemColumns(columns || []), [columns]);
    const subColsByGroup = useMemo(() => {
        const map = new Map<string, Column[]>();
        (board?.groups || []).forEach(g => map.set(g.id, subitemColumns(columns || [], g.id)));
        return map;
    }, [board?.groups, columns]);

    const rows: TableRow[] = useMemo(() => {
        if (!board) return [];
        const items = filterAndSortItems(board, { searchQuery, showHiddenItems });
        return toTableRows(groupItems(
            items,
            board.groups || [],
            board.groupByColumnId || null,
            board.collapsedGroups || [],
            board.expandedItemIds || [],
            itemColumns(board.columns),
            groupId => subitemColumns(board.columns, groupId)
        ));
    }, [board, searchQuery, showHiddenItems]);

    const { offsets } = useMemo(() => rowOffsets(rows), [rows]);

    // Children per parent (for the count badge) and each group's own rows (for
    // the "+ Add" row's roll-ups), over every item, not just the filtered ones —
    // the same numbers the desktop shows.
    const { subCounts, groupRows } = useMemo(() => {
        const counts = new Map<string, number>();
        const byGroup = new Map<string, Item[]>();
        (board?.items || []).forEach(item => {
            if (item.parentId) counts.set(item.parentId, (counts.get(item.parentId) || 0) + 1);
        });
        rows.forEach(row => {
            if (row.type !== 'item') return;
            const groupId = (row.data as Item).groupId;
            const list = byGroup.get(groupId) || [];
            list.push(row.data as Item);
            byGroup.set(groupId, list);
        });
        return { subCounts: counts, groupRows: byGroup };
    }, [board?.items, rows]);

    const contentWidth = useMemo(() => {
        let widest = widthOf(itemCols);
        subColsByGroup.forEach(cols => { widest = Math.max(widest, widthOf(cols)); });
        return GUTTER + NAME_COLUMN_WIDTH + UPDATES_COLUMN_WIDTH + widest + RIGHT_PAD;
    }, [itemCols, subColsByGroup]);

    const virtualizer = useVirtualizer({
        count: rows.length,
        getScrollElement: () => scrollRef.current,
        estimateSize: index => ROW_HEIGHT[rows[index].type],
        overscan: 12,
    });

    // Row heights are fixed per type; when the row list changes shape, the
    // virtualiser's cached sizes must follow.
    useEffect(() => {
        virtualizer.measure();
    }, [rows, virtualizer]);

    // Sideways: narrow the frozen column (CSS variable, once per frame).
    // Downwards: which group's header to pin (React state, only when it changes).
    const frame = useRef(0);
    const onScroll = useCallback(() => {
        if (frame.current) return;
        frame.current = requestAnimationFrame(() => {
            frame.current = 0;
            const el = scrollRef.current;
            if (!el) return;
            el.style.setProperty('--m-name-w', `${nameColumnWidth(el.scrollLeft, NAME_COLUMN_WIDTH, NAME_COLUMN_MIN_WIDTH)}px`);
            const next = stickyGroupIndex(rows, offsets, el.scrollTop);
            setStickyIndex(prev => (prev === next ? prev : next));
        });
    }, [rows, offsets]);
    useEffect(() => () => {
        cancelAnimationFrame(frame.current);
        // Or the next mount (StrictMode re-runs effects) would wait forever on
        // a frame that was cancelled.
        frame.current = 0;
    }, []);
    useEffect(() => { onScroll(); }, [onScroll]);

    // A cell's editor sheet covers the lower half of the screen: bring the row
    // being edited up above it (references 21 and 25 show the row in sight).
    const coveredByItem = useBoardStore(state => !!state.activeItemId);
    useEffect(() => {
        const el = scrollRef.current;
        if (!editing || editing.boardId !== boardId || coveredByItem || !el) return;
        const index = rows.findIndex(r => (r.type === 'item' || r.type === 'subitem') && r.id === editing.itemId);
        if (index < 0) return;
        const pinnedHeader = ROW_HEIGHT.group;
        const top = offsets[index];
        const bottom = top + ROW_HEIGHT[rows[index].type];
        const sheetTop = window.innerHeight - mediumSheetHeightPx(window.innerHeight);
        const visibleBottom = sheetTop - el.getBoundingClientRect().top - 12;
        if (bottom - el.scrollTop > visibleBottom || top - el.scrollTop < pinnedHeader) {
            el.scrollTo({ top: Math.max(0, top - pinnedHeader - 8), behavior: 'smooth' });
        }
        // Only when a sheet opens, not on every change to the rows behind it.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editing?.itemId, editing?.columnId]);

    const ctx: RowContext = useMemo(() => ({
        boardId,
        canEdit,
        people,
        itemTitle: board?.itemColumnTitle || 'Item',
    }), [boardId, canEdit, people, board?.itemColumnTitle]);

    const onToggleExpand = useCallback((itemId: string) => toggleItemExpansion(boardId, itemId), [boardId, toggleItemExpansion]);
    const onOpen = useCallback((itemId: string) => openItem(itemId), []);
    const onOpenUpdates = useCallback((itemId: string) => {
        useMobileUI.getState().setItemTab('updates');
        openItem(itemId);
    }, []);

    // A real group to add to: a "group by" bucket isn't one, so its "+ Add"
    // puts the item in the board's first group, as the desktop does.
    const realGroupId = useCallback((groupId: string) =>
        (board?.groups || []).some(g => g.id === groupId) ? groupId : board?.groups?.[0]?.id || groupId,
    [board?.groups]);

    const submitAdd = useCallback(() => {
        const title = draft.trim();
        if (!title || !adding) return;
        void addItem(title, adding.groupId, adding.parentId);
        // Stay open for the next one, like typing a list.
        setDraft('');
    }, [draft, adding, addItem]);
    const cancelAdd = useCallback(() => {
        setAdding(null);
        setDraft('');
    }, []);

    if (!board) return null;

    const renderRow = (row: TableRow, index: number) => {
        switch (row.type) {
            case 'gap':
                return <div className="m-tr m-tr--gap" />;
            case 'group': {
                const group = row.data as { title: string; color?: string };
                const color = group.color || row.groupColor || '#579bfc';
                return (
                    <GroupHeaderRow
                        title={group.title}
                        color={color}
                        collapsed={(board.collapsedGroups || []).includes(row.id)}
                        columns={itemCols}
                        onToggle={() => toggleGroup(boardId, row.id)}
                    />
                );
            }
            case 'item':
            case 'subitem': {
                const item = row.data as Item;
                const isSub = row.type === 'subitem';
                const cols = isSub ? subColsByGroup.get(row.columnGroupId || item.groupId) || [] : itemCols;
                return (
                    <ItemRow
                        item={item}
                        columns={cols}
                        ctx={ctx}
                        groupColor={row.groupColor || '#579bfc'}
                        isSub={isSub}
                        subCount={subCounts.get(item.id) || 0}
                        expanded={(board.expandedItemIds || []).includes(item.id)}
                        updatesCount={itemUpdateSummary(item).count}
                        roundTop={index > 0 && rows[index - 1].type === 'group'}
                        editingColumnId={editing && editing.itemId === item.id ? editing.columnId : undefined}
                        onToggleExpand={onToggleExpand}
                        onOpen={onOpen}
                        onOpenUpdates={onOpenUpdates}
                    />
                );
            }
            case 'footer': {
                const data = row.data as { groupId: string };
                const groupId = realGroupId(data.groupId);
                const isAdding = !!adding && !adding.parentId && adding.groupId === groupId;
                return (
                    <FooterRow
                        label={ctx.itemTitle}
                        columns={itemCols}
                        items={groupRows.get(data.groupId) || []}
                        ctx={ctx}
                        groupColor={row.groupColor || '#579bfc'}
                        adding={isAdding}
                        draft={isAdding ? draft : ''}
                        onStartAdd={() => { setAdding({ groupId }); setDraft(''); }}
                        onDraft={setDraft}
                        onSubmit={submitAdd}
                        onCancel={cancelAdd}
                    />
                );
            }
            case 'subitem-header':
                return <SubHeaderRow columns={subColsByGroup.get(row.columnGroupId || '') || []} groupColor={row.groupColor || '#579bfc'} />;
            case 'subitem-footer': {
                const data = row.data as { parentId: string; groupId: string };
                const isAdding = !!adding && adding.parentId === data.parentId;
                return (
                    <SubFooterRow
                        groupColor={row.groupColor || '#579bfc'}
                        ctx={ctx}
                        adding={isAdding}
                        draft={isAdding ? draft : ''}
                        onStartAdd={() => { setAdding({ groupId: realGroupId(data.groupId), parentId: data.parentId }); setDraft(''); }}
                        onDraft={setDraft}
                        onSubmit={submitAdd}
                        onCancel={cancelAdd}
                    />
                );
            }
            default:
                return null;
        }
    };

    // Searching or filtering down to nothing: say so, with a way out.
    const filtering = !!searchQuery || (board.filters || []).some(f => f.values.length > 0);
    const noMatches = filtering && !rows.some(row => row.type === 'item');

    const stickyRow = stickyIndex !== null ? rows[stickyIndex] : null;
    const sticky = stickyRow && stickyRow.type === 'group' ? stickyRow : null;
    const stickyGroup = sticky ? sticky.data as { title: string; color?: string } : null;

    return (
        <div
            ref={scrollRef}
            className="m-table"
            data-testid="m-table-scroll"
            onScroll={onScroll}
            style={{ ['--m-name-w' as string]: `${NAME_COLUMN_WIDTH}px`, ['--m-name-base' as string]: `${NAME_COLUMN_WIDTH}px` }}
        >
            <div className="m-table__content" style={{ width: contentWidth, height: virtualizer.getTotalSize() }}>
                {/* The header of the group being scrolled through, pinned over the rows. */}
                <div className="m-table__sticky" style={{ width: contentWidth }}>
                    {sticky && stickyGroup && (
                        <GroupHeaderRow
                            title={stickyGroup.title}
                            color={stickyGroup.color || sticky.groupColor || '#579bfc'}
                            collapsed={(board.collapsedGroups || []).includes(sticky.id)}
                            columns={itemCols}
                            onToggle={() => toggleGroup(boardId, sticky.id)}
                            sticky
                        />
                    )}
                </div>
                {virtualizer.getVirtualItems().map(v => (
                    <div
                        key={rows[v.index].id + rows[v.index].type}
                        className="m-table__row"
                        style={{ height: v.size, transform: `translateY(${v.start}px)` }}
                    >
                        {renderRow(rows[v.index], v.index)}
                    </div>
                ))}
            </div>
            {noMatches && (
                <div className="m-table__empty" role="status">
                    <div>{searchQuery ? `No items match “${searchQuery}”` : 'No items match these filters'}</div>
                    <button
                        type="button"
                        className="m-text-btn"
                        onClick={() => {
                            setSearchQuery('');
                            setBoardFilters(boardId, []);
                        }}
                    >
                        Clear {searchQuery ? 'search and filters' : 'filters'}
                    </button>
                </div>
            )}
            <div style={{ height: BOTTOM_SPACE, width: contentWidth }} aria-hidden="true" />
        </div>
    );
};
