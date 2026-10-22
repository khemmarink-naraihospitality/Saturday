import type { Column } from '../types';

/**
 * One line saying what changed in an item's field, for the notification and
 * email sent to the people on it ("Due Date: Oct 30, 2026 → Nov 5, 2026").
 * Returns null for the fields that never notify through this path: People
 * (assigning someone has its own message) and Files (a file add has its own
 * activity entry).
 */
const clip = (text: string, n = 80) => (text.length > n ? text.slice(0, n - 1) + '…' : text);

const day = (value: unknown): string => {
    if (!value) return 'empty';
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
    if (!m) return String(value);
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const show = (column: Pick<Column, 'type' | 'options'>, value: unknown): string => {
    if (value === null || value === undefined || value === '') return 'empty';
    switch (column.type) {
        case 'date':
        case 'due_date':
            return day(value);
        case 'timeline': {
            const t = value as { from?: string; to?: string };
            return t?.from || t?.to ? `${day(t.from)} – ${day(t.to)}` : 'empty';
        }
        case 'status':
            return column.options?.find(o => o.id === value)?.label || String(value);
        case 'dropdown':
            return Array.isArray(value) ? (value.length ? value.join(', ') : 'empty') : String(value);
        case 'checkbox':
            return value ? 'checked' : 'unchecked';
        case 'priority':
            return `${value} of 5`;
        default:
            return typeof value === 'object' ? 'updated' : clip(String(value));
    }
};

export const describeChange = (
    column: Pick<Column, 'title' | 'type' | 'options'>,
    oldValue: unknown,
    newValue: unknown
): string | null => {
    if (column.type === 'people' || column.type === 'files') return null;
    return `${column.title}: ${show(column, oldValue)} → ${show(column, newValue)}`;
};
