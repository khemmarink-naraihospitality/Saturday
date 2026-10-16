/**
 * The month grids of the phone's date and timeline sheets (references 22, 24,
 * 25), kept free of React so they can be checked from node
 * (tests/mobile_cells_test.ts). Every date here is a local calendar day at
 * midnight; nothing goes through toISOString, so no time zone can move a day.
 */

/** Midnight of the same calendar day. */
export const startOfDay = (date: Date): Date => new Date(date.getFullYear(), date.getMonth(), date.getDate());

export const sameDay = (a: Date | null | undefined, b: Date | null | undefined): boolean =>
    !!a && !!b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** The first of the month `delta` months away (the day of month never overflows). */
export const addMonths = (date: Date, delta: number): Date => new Date(date.getFullYear(), date.getMonth() + delta, 1);

export const addDays = (date: Date, days: number): Date => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

/**
 * A month as weeks of seven cells, Monday first (the reference's MON … SUN):
 * null before the 1st and after the last day, and only as many weeks as the
 * month needs (4 to 6).
 */
export const monthGrid = (year: number, month: number): (Date | null)[][] => {
    const first = new Date(year, month, 1);
    const days = new Date(year, month + 1, 0).getDate();
    const lead = (first.getDay() + 6) % 7; // Monday = 0
    const cells: (Date | null)[] = [];
    for (let i = 0; i < lead; i++) cells.push(null);
    for (let d = 1; d <= days; d++) cells.push(new Date(year, month, d));
    while (cells.length % 7 !== 0) cells.push(null);
    const weeks: (Date | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    return weeks;
};

export interface DayRange {
    from: Date;
    to: Date | null;
}

/**
 * A tap while picking a range: the first tap starts it, the second ends it
 * (either side of the start — an earlier day becomes the start), and a tap
 * after a finished range starts a new one.
 */
export const tapRange = (range: DayRange | null, day: Date): DayRange => {
    if (!range || range.to) return { from: day, to: null };
    return day.getTime() < range.from.getTime() ? { from: day, to: range.from } : { from: range.from, to: day };
};

/** Where a day sits in a range, for drawing it: an end, inside, or not in it. */
export const rangePart = (range: DayRange | null, day: Date): 'start' | 'end' | 'single' | 'inside' | null => {
    if (!range) return null;
    const to = range.to || range.from;
    const isFrom = sameDay(day, range.from);
    const isTo = sameDay(day, to);
    if (isFrom && isTo) return 'single';
    if (isFrom) return 'start';
    if (isTo) return 'end';
    const t = day.getTime();
    return t > range.from.getTime() && t < to.getTime() ? 'inside' : null;
};
