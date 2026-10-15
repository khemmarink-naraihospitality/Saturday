/**
 * Date text for cells, the same rules as the desktop DateCell / TimelineCell,
 * plus the reverse: a calendar day back to the 'YYYY-MM-DD' every reader of a
 * date value expects. Pure — tests/mobile_cells_test.ts.
 */

/** 'YYYY-MM-DD' (or an ISO timestamp, from old data) → a local calendar date. */
export const parseDay = (value: string | null | undefined): Date | null => {
    if (!value || typeof value !== 'string') return null;
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return null;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return Number.isNaN(date.getTime()) ? null : date;
};

/** A local calendar date → 'YYYY-MM-DD', never shifted by the time zone (no toISOString). */
export const toDayString = (date: Date): string =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const formatDay = (date: Date, now: Date) =>
    date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric'
    });

/** "Feb 9" this year, "Feb 9, 2025" any other year; '' for no / bad dates. */
export const formatDateCell = (value: string | null | undefined, now: Date = new Date()): string => {
    const date = parseDay(value);
    return date ? formatDay(date, now) : '';
};

/** A due date is overdue once it is strictly before today; today itself is not. */
export const isOverdue = (value: string | null | undefined, now: Date = new Date()): boolean => {
    const date = parseDay(value);
    if (!date) return false;
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return date.getTime() < today.getTime();
};

/** "Nov 1 - Jan 31, 2027" — a timeline value, or '' when it has no start or end. */
export const formatTimelineRange = (value: unknown, now: Date = new Date()): string => {
    const range = value as { from?: string; to?: string } | null;
    const from = parseDay(range?.from);
    const to = parseDay(range?.to);
    if (!from || !to) return '';
    return `${formatDay(from, now)} - ${formatDay(to, now)}`;
};

/** Days a timeline covers, both ends included. */
export const timelineDays = (value: unknown): number => {
    const range = value as { from?: string; to?: string } | null;
    const from = parseDay(range?.from);
    const to = parseDay(range?.to);
    if (!from || !to) return 0;
    return Math.round((to.getTime() - from.getTime()) / 86400000) + 1;
};
