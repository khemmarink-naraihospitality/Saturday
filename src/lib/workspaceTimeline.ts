/**
 * The rows of the dashboard's Timeline widget: every dated top-level item in
 * the workspace, in the order the boards themselves keep them.
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

export interface BuildRowsInput {
    items: TimelineSourceItem[];
    columns: TimelineSourceColumn[];
    boards: TimelineBoardInfo[];
    groupsByBoard: Map<string, TimelineGroupInfo[]>;
}

export const buildTimelineRows = ({ items, columns, boards, groupsByBoard }: BuildRowsInput): TimelineRow[] => {
    const boardIndex = new Map(boards.map((b, i) => [b.id, i]));
    const boardTitle = new Map(boards.map(b => [b.id, b.title]));

    const groupInfo = new Map<string, { title: string; color: string | null; order: number }>();
    groupsByBoard.forEach(list => list.forEach((g, i) => groupInfo.set(g.id, { title: g.title, color: g.color ?? null, order: i })));

    const dateCols = new Map<string, TimelineSourceColumn[]>();
    [...columns].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).forEach(col => {
        if (!DATE_COLUMN_TYPES.includes(col.type)) return;
        const list = dateCols.get(col.board_id) || [];
        list.push(col);
        dateCols.set(col.board_id, list);
    });

    const rows: TimelineRow[] = [];
    for (const item of items) {
        if (item.parent_id) continue; // sub-items hang off their parent; the dashboard counts top-level rows
        if (item.is_hidden) continue; // the board's "Hide" keeps these out of its Timeline too

        const dates = resolveItemDates(dateCols.get(item.board_id) || [], item.values);
        if (!dates) continue;

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
            end: dates.end
        });
    }

    return rows;
};

const byBoardOrder = (a: TimelineRow, b: TimelineRow) =>
    a.boardOrder - b.boardOrder || a.groupOrder - b.groupOrder || a.itemOrder - b.itemOrder;

/** The order the boards put things in: board, then group, then position in the group. */
export const orderRows = (rows: TimelineRow[]): TimelineRow[] => [...rows].sort(byBoardOrder);
