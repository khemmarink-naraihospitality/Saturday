import { lazy, Suspense, useMemo } from 'react';
import {
    AlignLeft, Calendar, CalendarClock, CheckSquare, ChevronDownSquare, CircleDot, GanttChart, Hash, Link2, Paperclip, Star, Type, Users,
    type LucideIcon,
} from 'lucide-react';
import type { Board, Column, ColumnType, Item } from '../../types';
import { itemColumns, subitemColumns } from '../../lib/columnScope';
import { CellView, activateCell } from '../cells';
import type { PersonInfo } from '../ui';

// The desktop dependency chips work as they are; fetched with this tab only.
const DependenciesSection = lazy(() => import('../../components/task/DependenciesSection').then(m => ({ default: m.DependenciesSection })));

const TYPE_ICON: Partial<Record<ColumnType, LucideIcon>> = {
    text: Type,
    long_text: AlignLeft,
    status: CircleDot,
    dropdown: ChevronDownSquare,
    date: Calendar,
    due_date: CalendarClock,
    timeline: GanttChart,
    number: Hash,
    people: Users,
    checkbox: CheckSquare,
    link: Link2,
    files: Paperclip,
    priority: Star,
};

/**
 * Every column of the item with its value — the item's own columns, or for a
 * sub-item its parent group's sub-item columns. A tap edits the value through
 * the same editor sheet as a table cell.
 */
export const ColumnsTab = ({ board, item, canEdit, people, groupColor }: {
    board: Board;
    item: Item;
    canEdit: boolean;
    people: Map<string, PersonInfo>;
    groupColor?: string;
}) => {
    const columns: Column[] = useMemo(() => {
        if (!item.parentId) return itemColumns(board.columns);
        // A sub-item shows the sub-item columns of the group its parent is in.
        const parent = board.items.find(i => i.id === item.parentId);
        return subitemColumns(board.columns, parent?.groupId || item.groupId);
    }, [board.columns, board.items, item.parentId, item.groupId]);

    return (
        <div className="m-props">
            {columns.length === 0 && <div className="m-empty">This board has no columns yet.</div>}
            {columns.length > 0 && (
                <div className="m-props__card">
                    {columns.map(column => {
                        const Icon = TYPE_ICON[column.type] || Type;
                        const value = item.values[column.id];
                        const content = (
                            <>
                                <span className="m-prop__label">
                                    <Icon size={17} strokeWidth={1.8} />
                                    <span className="m-truncate">{column.title}</span>
                                </span>
                                <span className="m-prop__value">
                                    <CellView column={column} value={value} item={item} people={people} variant="detail" groupColor={groupColor} />
                                </span>
                            </>
                        );
                        return canEdit ? (
                            <button
                                key={column.id}
                                type="button"
                                className="m-prop"
                                onClick={() => activateCell({ boardId: board.id, itemId: item.id, column, value })}
                                aria-label={`${column.title}: edit`}
                            >
                                {content}
                            </button>
                        ) : (
                            <div key={column.id} className="m-prop">{content}</div>
                        );
                    })}
                </div>
            )}

            {/* Dependencies are between top-level items (sub-items never reach the Timeline). */}
            {!item.parentId && (
                <div className="m-props__deps">
                    <div className="m-props__title">Dependencies</div>
                    <div className="m-props__card m-props__card--deps">
                        <Suspense fallback={null}>
                            <DependenciesSection itemId={item.id} boardId={board.id} compact />
                        </Suspense>
                    </div>
                </div>
            )}
        </div>
    );
};
