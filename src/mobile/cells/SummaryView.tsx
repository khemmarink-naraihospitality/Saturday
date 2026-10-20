import { memo, useMemo } from 'react';
import { Star } from 'lucide-react';
import type { Column, FileLink, Item } from '../../types';
import { computeAggregates } from '../../utils/grouping';
import { formatNumberValue } from '../../utils/format';
import { AvatarStack, type PersonInfo } from '../ui';
import { parseDay } from './format';
import { tintLabel } from '../../lib/labelTint';

const shortDay = (value: string) => {
    const date = parseDay(value) || new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

/**
 * A column's roll-up over a group's rows, shown in that group's "+ Add" row
 * (reference screenshot 25: "2 files", a timeline pill). The same roll-ups as
 * the desktop SummaryCell, from the same computeAggregates; read-only here.
 */
export const SummaryView = memo(({ column, items, people, color }: {
    column: Column;
    items: Item[];
    people?: Map<string, PersonInfo>;
    /** The group's colour, for date and timeline ranges. */
    color?: string;
}) => {
    const agg = useMemo(() => (column.type === 'files' ? null : computeAggregates([column], items)[column.id]), [column, items]);

    switch (column.type) {
        case 'status': {
            if (items.length === 0) return null;
            const counts = new Map<string, number>();
            items.forEach(item => {
                const v = item.values[column.id] || 'default';
                counts.set(v, (counts.get(v) || 0) + 1);
            });
            const options = Array.isArray(column.options) ? column.options : [];
            const segments = options
                .map(o => ({ key: o.id, color: o.color, count: (counts.get(o.id) || 0) + (o.label !== o.id ? counts.get(o.label) || 0 : 0) }))
                .filter(s => s.count > 0);
            const empty = counts.get('default') || 0;
            if (empty) segments.push({ key: 'default', color: '#c4c4c4', count: empty });
            return (
                <span className="m-summary-bar" role="img" aria-label="Status breakdown">
                    {segments.map(s => (
                        <span key={s.key} style={{ width: `${(s.count / items.length) * 100}%`, backgroundColor: tintLabel(s.color) }} />
                    ))}
                </span>
            );
        }

        case 'number': {
            const aggregation = column.aggregation || 'sum';
            if (aggregation === 'none' || !agg || !agg.count) return null;
            let result: number = 0;
            switch (aggregation) {
                case 'sum': result = agg.sum || 0; break;
                case 'avg': result = parseFloat(((agg.sum || 0) / agg.count).toFixed(2)); break;
                case 'min': result = Math.min(...agg.values); break;
                case 'max': result = Math.max(...agg.values); break;
                case 'count': result = agg.count; break;
            }
            return (
                <span className="m-summary-number">
                    <span className="m-truncate">{aggregation === 'count' ? result : formatNumberValue(result, column)}</span>
                    <span className="m-summary-number__label">{aggregation}</span>
                </span>
            );
        }

        case 'date':
        case 'due_date':
        case 'timeline': {
            if (!agg?.min) return null;
            const from = shortDay(agg.min);
            const to = shortDay(agg.max || agg.min);
            return (
                <span className="m-cell-center">
                    <span className="m-timeline-pill" style={{ backgroundColor: color || 'hsl(var(--m-accent))' }}>
                        {from === to ? from : `${from} - ${to}`}
                    </span>
                </span>
            );
        }

        case 'people': {
            const ids: string[] = agg?.uniqueIds || [];
            const shown = ids.map(id => people?.get(id)).filter((p): p is PersonInfo => !!p);
            if (shown.length === 0) return null;
            return <span className="m-cell-center"><AvatarStack people={shown} max={3} size={24} /></span>;
        }

        case 'files': {
            const count = items.reduce((n, item) => n + (Array.isArray(item.values[column.id]) ? (item.values[column.id] as FileLink[]).length : 0), 0);
            if (!count) return null;
            return (
                <span className="m-summary-files">
                    <strong>{count}</strong>
                    <span>{count === 1 ? 'file' : 'files'}</span>
                </span>
            );
        }

        case 'priority': {
            if (!agg?.count) return null;
            return (
                <span className="m-cell-center" style={{ gap: 4, fontSize: 14, fontWeight: 600 }}>
                    <Star size={14} color="#fdab3d" fill="#fdab3d" />
                    {agg.avg.toFixed(1)}
                </span>
            );
        }

        case 'checkbox': {
            if (items.length === 0) return null;
            const done = items.filter(item => item.values[column.id] === true).length;
            return <span className="m-cell-center" style={{ fontSize: 14, color: 'hsl(var(--m-text-2))' }}>{done}/{items.length}</span>;
        }

        default:
            return null;
    }
});
SummaryView.displayName = 'SummaryView';
