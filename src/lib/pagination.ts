/**
 * Paging a list that is already in memory (the Admin Console's User
 * Management table loads every profile, then filters and sorts them).
 * Tested by tests/pagination_test.ts.
 */

export interface Page<T> {
    rows: T[];
    /** The page shown, 1-based: a page past the end (the list shrank under a filter) shows the last one */
    page: number;
    pageCount: number;
    /** 1-based position of the first and last row shown; 0 and 0 for an empty list */
    first: number;
    last: number;
}

export function pageOf<T>(rows: T[], page: number, pageSize: number): Page<T> {
    const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
    const current = Math.min(Math.max(1, Math.floor(page) || 1), pageCount);
    const start = (current - 1) * pageSize;
    const shown = rows.slice(start, start + pageSize);
    return {
        rows: shown,
        page: current,
        pageCount,
        first: shown.length ? start + 1 : 0,
        last: start + shown.length,
    };
}

/**
 * The page buttons to draw: the first and the last page, the current one and
 * its neighbours, and a gap where pages are skipped. Seven pages or fewer are
 * all shown, and a gap never stands for a single page (that page is drawn).
 */
export function pageButtons(page: number, pageCount: number): (number | 'gap')[] {
    if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);
    const shown = new Set([1, pageCount, page - 1, page, page + 1]);
    // Near either end, keep the run there long enough to read as a run
    if (page <= 3) [2, 3, 4].forEach(p => shown.add(p));
    if (page >= pageCount - 2) [pageCount - 3, pageCount - 2, pageCount - 1].forEach(p => shown.add(p));
    const pages = [...shown].filter(p => p >= 1 && p <= pageCount).sort((a, b) => a - b);
    const out: (number | 'gap')[] = [];
    pages.forEach((p, i) => {
        const prev = pages[i - 1];
        if (i > 0 && p - prev === 2) out.push(p - 1);
        else if (i > 0 && p - prev > 2) out.push('gap');
        out.push(p);
    });
    return out;
}
