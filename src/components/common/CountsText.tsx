import type { Column } from '../../types';
import { PRIORITY_LEVELS, priorityLevel } from '../../lib/priority';

export interface CountPart {
    key: string;
    label: string;
    color: string;
    count: number;
}

/**
 * How many rows hold each status label, in the column's label order. The blank
 * "Default" label and an empty value both count as "not set", as their cells
 * read; a value no label matches is left out, as the status bar leaves it out.
 */
export const statusCounts = (column: Column, values: unknown[]): CountPart[] => {
    const counts = new Map<string, number>();
    values.forEach(v => {
        const key = v ? String(v) : 'default';
        counts.set(key, (counts.get(key) || 0) + 1);
    });
    const options = Array.isArray(column.options) ? column.options : [];
    let notSet = counts.get('default') || 0;
    const parts = options.flatMap(opt => {
        const count = (counts.get(opt.id) || 0) + (opt.label !== opt.id ? counts.get(opt.label) || 0 : 0);
        if (!count) return [];
        if (opt.label === 'Default') { notSet += count; return []; }
        return [{ key: opt.id, label: opt.label, color: opt.color, count }];
    });
    if (notSet) parts.push({ key: 'not-set', label: 'not set', color: '#c4c4c4', count: notSet });
    return parts;
};

/** How many rated rows are High, Medium and Low (src/lib/priority.ts). */
export const priorityCounts = (values: unknown[]): CountPart[] =>
    PRIORITY_LEVELS.map(level => ({
        key: level.id,
        label: level.label,
        color: level.color,
        count: values.filter(v => priorityLevel(v)?.id === level.id).length,
    })).filter(p => p.count > 0);

/**
 * "● 3 In Progress, ● 6 Done": NHG's summary under a group, in words where
 * Saturday draws a bar (desktop SummaryCell, phone SummaryView). The full text
 * is the tooltip when the column is too narrow for it.
 */
export const CountsText = ({ parts }: { parts: CountPart[] }) => {
    if (parts.length === 0) return null;
    return (
        <span className="nhg-summary-text" title={parts.map(p => `${p.count} ${p.label}`).join(', ')}>
            {parts.map((p, i) => (
                <span key={p.key} className="nhg-summary-part">
                    <span className="nhg-summary-dot" style={{ background: p.color }} />
                    {p.count} {p.label}{i < parts.length - 1 ? ',' : ''}
                </span>
            ))}
        </span>
    );
};
