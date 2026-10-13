/**
 * The rows of the dashboard's Timeline widget: every dated top-level item in
 * the workspace, put in order and sectioned the way the toolbar asks.
 *
 * Pure, so it can be checked from node (tests/workspace_timeline_test.ts). The
 * widget itself (components/dashboard/WorkspaceTimeline.tsx) only draws these.
 */

// What the dashboard has fetched for each item and column: the raw rows.
export interface TimelineSourceItem {
    id: string;
    title?: string | null;
    board_id: string;
    group_id?: string | null;
    values?: Record<string, any> | null;
    is_hidden?: boolean | null;
    parent_id?: string | null;
    order?: number | null;
}

export interface TimelineSourceColumn {
    id: string;
    board_id: string;
    type: string;
    options?: any;
    order?: number | null;
}

export interface TimelineBoardInfo {
    id: string;
    title: string;
}

export interface TimelineGroupInfo {
    id: string;
    title: string;
    color?: string | null;
}

export interface TimelineRow {
    id: string;
    title: string;
    boardId: string;
    boardTitle: string;
    boardOrder: number;
    groupId: string | null;
    groupTitle: string;
    groupColor: string | null;
    groupOrder: number;
    itemOrder: number;
    start: Date;
    end: Date;
    statusLabel: string | null;
    statusColor: string | null;
}

const DATE_COLUMN_TYPES = ['timeline', 'date', 'due_date'];

const validDate = (d: Date | null): d is Date => !!d && !Number.isNaN(d.getTime());

/**
 * When an item starts and ends: the first date/timeline/due-date column (in
 * column order) it has a value in — the rule the board's Timeline view uses,
 * so a bar here sits where it does there. Null when it has no usable dates
 * (a timeline with no end draws no bar on the board either).
 */
export const resolveItemDates = (dateColumns: TimelineSourceColumn[], values: Record<string, any> | null | undefined): { start: Date; end: Date } | null => {
    if (!values) return null;

    let start: Date | null = null;
    let end: Date | null = null;
    for (const col of dateColumns) {
        const val = values[col.id];
        if (!val) continue;
        if (col.type === 'timeline') {
            if (val.from) start = new Date(val.from);
            if (val.to) end = new Date(val.to);
        } else {
            start = new Date(val);
            end = new Date(val);
        }
        if (start) break;
    }

    if (!validDate(start) || !validDate(end)) return null;
    return { start, end };
};

// Status values are stored as the option's id; the option holds label and colour.
const statusOf = (statusColumns: TimelineSourceColumn[], values: Record<string, any> | null | undefined): { label: string; color: string | null } | null => {
    if (!values) return null;
    for (const col of statusColumns) {
        const val = values[col.id];
        if (!val) continue;
        const options: any[] = Array.isArray(col.options) ? col.options : [];
        const id = typeof val === 'string' ? val : val?.id;
        const option = options.find(o => o && o.id === id);
        if (option?.label) return { label: String(option.label), color: option.color || null };
    }
    return null;
};

export interface BuildRowsInput {
    items: TimelineSourceItem[];
    columns: TimelineSourceColumn[];
    boards: TimelineBoardInfo[];
    groupsByBoard: Map<string, TimelineGroupInfo[]>;
    showHidden: boolean;
}

export const buildTimelineRows = ({ items, columns, boards, groupsByBoard, showHidden }: BuildRowsInput): TimelineRow[] => {
    const boardIndex = new Map(boards.map((b, i) => [b.id, i]));
    const boardTitle = new Map(boards.map(b => [b.id, b.title]));

    const groupInfo = new Map<string, { title: string; color: string | null; order: number }>();
    groupsByBoard.forEach(list => list.forEach((g, i) => groupInfo.set(g.id, { title: g.title, color: g.color ?? null, order: i })));

    const dateCols = new Map<string, TimelineSourceColumn[]>();
    const statusCols = new Map<string, TimelineSourceColumn[]>();
    [...columns].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).forEach(col => {
        const target = DATE_COLUMN_TYPES.includes(col.type) ? dateCols : col.type === 'status' ? statusCols : null;
        if (!target) return;
        const list = target.get(col.board_id) || [];
        list.push(col);
        target.set(col.board_id, list);
    });

    const rows: TimelineRow[] = [];
    for (const item of items) {
        if (item.parent_id) continue; // sub-items hang off their parent; the dashboard counts top-level rows
        if (item.is_hidden && !showHidden) continue;

        const dates = resolveItemDates(dateCols.get(item.board_id) || [], item.values);
        if (!dates) continue;

        const status = statusOf(statusCols.get(item.board_id) || [], item.values);
        const group = item.group_id ? groupInfo.get(item.group_id) : undefined;
        rows.push({
            id: item.id,
            title: item.title || 'Untitled',
            boardId: item.board_id,
            boardTitle: boardTitle.get(item.board_id) ?? '',
            boardOrder: boardIndex.get(item.board_id) ?? Number.MAX_SAFE_INTEGER,
            groupId: item.group_id ?? null,
            groupTitle: group?.title ?? '',
            groupColor: group?.color ?? null,
            groupOrder: group?.order ?? Number.MAX_SAFE_INTEGER,
            itemOrder: item.order ?? 0,
            start: dates.start,
            end: dates.end,
            statusLabel: status?.label ?? null,
            statusColor: status?.color ?? null
        });
    }

    return rows;
};

export type TimelineSortKey = 'name' | 'start' | 'end' | 'board';
export type TimelineSort = { key: TimelineSortKey; direction: 'asc' | 'desc' } | null;
export type TimelineGroupBy = 'none' | 'board' | 'group' | 'status';

const byBoardOrder = (a: TimelineRow, b: TimelineRow) =>
    a.boardOrder - b.boardOrder || a.groupOrder - b.groupOrder || a.itemOrder - b.itemOrder;

/** With no sort chosen, the order the boards themselves put things in. */
export const sortRows = (rows: TimelineRow[], sort: TimelineSort): TimelineRow[] => {
    const out = [...rows].sort(byBoardOrder);
    if (!sort) return out;

    const sign = sort.direction === 'asc' ? 1 : -1;
    const compare = (a: TimelineRow, b: TimelineRow): number => {
        switch (sort.key) {
            case 'name': return a.title.localeCompare(b.title, undefined, { sensitivity: 'base', numeric: true });
            case 'start': return a.start.getTime() - b.start.getTime();
            case 'end': return a.end.getTime() - b.end.getTime();
            case 'board': return a.boardOrder - b.boardOrder;
        }
    };
    // Array.prototype.sort is stable, so ties keep the board order from above.
    return out.sort((a, b) => sign * compare(a, b));
};

export interface TimelineSection {
    key: string;
    label: string;
    // Smaller second line: the board a group belongs to.
    sublabel?: string;
    color: string | null;
    rows: TimelineRow[];
}

export const NO_STATUS_SECTION = '__no_status__';

/** Splits already-sorted rows into sections; `none` is one section with no header. */
export const sectionRows = (rows: TimelineRow[], groupBy: TimelineGroupBy): TimelineSection[] => {
    if (groupBy === 'none') {
        return rows.length > 0 ? [{ key: '__all__', label: '', color: null, rows }] : [];
    }

    const sections = new Map<string, TimelineSection>();
    for (const row of rows) {
        let key: string;
        let make: () => Omit<TimelineSection, 'rows'>;
        if (groupBy === 'board') {
            key = row.boardId;
            make = () => ({ key, label: row.boardTitle, color: null });
        } else if (groupBy === 'group') {
            key = row.groupId ?? `${row.boardId}:none`;
            make = () => ({ key, label: row.groupTitle || 'No group', sublabel: row.boardTitle, color: row.groupColor });
        } else {
            // Merged by label: every board has its own copy of a column's options,
            // so "Done" on three boards is three option ids but one section.
            key = row.statusLabel ? row.statusLabel.trim().toLowerCase() : NO_STATUS_SECTION;
            make = () => ({ key, label: row.statusLabel ?? 'No status', color: row.statusColor });
        }
        let section = sections.get(key);
        if (!section) {
            section = { ...make(), rows: [] };
            sections.set(key, section);
        }
        section.rows.push(row);
    }

    const list = Array.from(sections.values());
    if (groupBy === 'status') {
        // Alphabetical, with the unstatused rows last.
        list.sort((a, b) => (a.key === NO_STATUS_SECTION ? 1 : 0) - (b.key === NO_STATUS_SECTION ? 1 : 0)
            || a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
    }
    // Board and group sections keep the boards' own order whatever the rows
    // inside are sorted by — an explicit sort reorders items, not sections.
    if (groupBy === 'board' || groupBy === 'group') {
        list.sort((a, b) => a.rows[0].boardOrder - b.rows[0].boardOrder || a.rows[0].groupOrder - b.rows[0].groupOrder);
    }
    return list;
};

/** Case-insensitive match on the item's name, same as the board's search box. */
export const matchesSearch = (row: TimelineRow, query: string): boolean => {
    const q = query.trim().toLowerCase();
    return q === '' || row.title.toLowerCase().includes(q);
};
