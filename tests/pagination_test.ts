/**
 * Manual verification for src/lib/pagination.ts — the Admin Console's
 * User Management table, 50 users a page.
 * Run with:  npx tsx tests/pagination_test.ts
 */
import { pageButtons, pageOf } from '../src/lib/pagination';

let passed = 0;
let failed = 0;
const eq = (name: string, got: unknown, want: unknown) => {
    if (JSON.stringify(got) === JSON.stringify(want)) passed++;
    else { failed++; console.log(`FAIL ${name} — ${JSON.stringify(got)} vs ${JSON.stringify(want)}`); }
};

const users = Array.from({ length: 120 }, (_, i) => i + 1);

const p1 = pageOf(users, 1, 50);
eq('page 1 holds the first 50', [p1.rows.length, p1.rows[0], p1.rows[49]], [50, 1, 50]);
eq('page 1 says 1–50 of 3 pages', [p1.first, p1.last, p1.page, p1.pageCount], [1, 50, 1, 3]);

const p2 = pageOf(users, 2, 50);
eq('page 2 holds 51–100', [p2.rows[0], p2.rows[49], p2.first, p2.last], [51, 100, 51, 100]);

const p3 = pageOf(users, 3, 50);
eq('the last page holds what is left', [p3.rows.length, p3.first, p3.last], [20, 101, 120]);

eq('a page past the end shows the last page (the list shrank under a filter)', pageOf(users, 9, 50).page, 3);
eq('page 0 or below shows the first page', pageOf(users, 0, 50).page, 1);
eq('exactly 50 is one page', pageOf(users.slice(0, 50), 1, 50).pageCount, 1);
eq('51 is two pages', pageOf(users.slice(0, 51), 2, 50).rows, [51]);

const empty = pageOf([], 1, 50);
eq('no users: one empty page, 0–0', [empty.rows.length, empty.page, empty.pageCount, empty.first, empty.last], [0, 1, 1, 0, 0]);

eq('one page: one button', pageButtons(1, 1), [1]);
eq('seven pages: all of them', pageButtons(4, 7), [1, 2, 3, 4, 5, 6, 7]);
eq('first of ten', pageButtons(1, 10), [1, 2, 3, 4, 'gap', 10]);
eq('middle of ten', pageButtons(5, 10), [1, 'gap', 4, 5, 6, 'gap', 10]);
eq('last of ten', pageButtons(10, 10), [1, 'gap', 7, 8, 9, 10]);
eq('a gap of one page is drawn as that page (start)', pageButtons(4, 10), [1, 2, 3, 4, 5, 'gap', 10]);
eq('a gap of one page is drawn as that page (end)', pageButtons(7, 10), [1, 'gap', 6, 7, 8, 9, 10]);
eq('every page number is in range and in order', pageButtons(2, 30).filter(p => p !== 'gap'), [1, 2, 3, 4, 30]);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
