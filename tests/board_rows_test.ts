/**
 * Manual verification that filterAndSortItems (src/lib/boardRows.ts) is exactly
 * the pipeline the desktop Table ran inline before it was extracted for the
 * mobile board to share. `reference` below is that inline code, verbatim.
 * Run with:  npx tsx tests/board_rows_test.ts
 */
import { filterAndSortItems } from '../src/lib/boardRows';
import { linkDisplayText } from '../src/lib/utils';
import type { Board, Column, Item } from '../src/types';

let passed = 0;
let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) passed++;
    else {
        failed++;
        console.log(`FAIL ${name}${detail ? ` — ${detail}` : ''}`);
    }
};

// ---- the original, verbatim -------------------------------------------------
const reference = (board: Board, searchQuery: string, showHiddenItems: boolean): Item[] => {
    let items = [...board.items]; // Clone to sort

    // 1. Search
    if (searchQuery) {
        items = items.filter(item => item.title.toLowerCase().includes(searchQuery.toLowerCase()));
    }

    // Filter Hidden Items
    if (!showHiddenItems) {
        items = items.filter(item => !item.isHidden);
    }

    // 2. Column Filter and Group Filter
    if (board.filters && board.filters.length > 0) {
        board.filters.forEach(filter => {
            if (filter.values && filter.values.length > 0) {
                items = items.filter(item => {
                    if (filter.columnId === '__group__') {
                        return filter.values.includes(item.groupId);
                    }

                    const val = item.values[filter.columnId];

                    // Handle Array values (Dropdown) -> Intersection Check
                    if (Array.isArray(val)) {
                        // If ANY of the item's labels match ANY of the filter values, keep it.
                        return val.some(v => filter.values.includes(v));
                    }

                    // Handle Boolean values (Checkbox) -> String Conversion Check
                    if (typeof val === 'boolean') {
                        return filter.values.includes(String(val));
                    }

                    // Default: Single Value Check
                    return filter.values.includes(val);
                });
            }
        });
    }

    // 3. Sort
    if (board.sort) {
        const { columnId, direction } = board.sort;
        const col = board.columns.find(c => c.id === columnId);
        if (col && direction) {
            items.sort((a, b) => {
                let valA = a.values[columnId];
                let valB = b.values[columnId];

                // Handle different types
                // Priority sorts with the numbers: it is a 1-5 rating, and
                // sorting it as text would order 10 before 2 if the scale
                // ever grows.
                if (col.type === 'number' || col.type === 'priority') {
                    valA = parseFloat(valA) || 0;
                    valB = parseFloat(valB) || 0;
                } else if (col.type === 'date' || col.type === 'due_date') {
                    // Date strings usually sortable if ISO, otherwise parse
                    valA = valA || '';
                    valB = valB || '';
                } else if (col.type === 'link') {
                    // A labelled link is an object; sort it the way it reads.
                    valA = linkDisplayText(valA).toLowerCase();
                    valB = linkDisplayText(valB).toLowerCase();
                } else if (col.type === 'status' || col.type === 'dropdown') {
                    // Try to find option label if val maps to an option ID
                    const options = Array.isArray(col.options) ? col.options : [];
                    const optA = options.find(o => o.id === valA || o.label === valA);
                    const optB = options.find(o => o.id === valB || o.label === valB);
                    valA = (optA ? optA.label : (valA || '')).toString().toLowerCase();
                    valB = (optB ? optB.label : (valB || '')).toString().toLowerCase();
                } else {
                    // String (Text, etc)
                    valA = (valA || '').toString().toLowerCase();
                    valB = (valB || '').toString().toLowerCase();
                }

                if (valA < valB) return direction === 'asc' ? -1 : 1;
                if (valA > valB) return direction === 'asc' ? 1 : -1;
                return 0;
            });
        }
    }
    return items;
};

// ---- deterministic pseudo-random boards --------------------------------------
let seed = 20261015;
const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
};
const pick = <T,>(xs: T[]): T => xs[Math.floor(rand() * xs.length)];

const columns: Column[] = [
    { id: 'st', title: 'Status', type: 'status', order: 0, options: [{ id: 'o1', label: 'Done', color: '#0f0' }, { id: 'o2', label: 'Working', color: '#fa0' }, { id: 'o3', label: 'Stuck', color: '#f00' }] },
    { id: 'dd', title: 'Tags', type: 'dropdown', order: 1, options: [{ id: 'd1', label: 'A', color: '#111' }, { id: 'd2', label: 'B', color: '#222' }] },
    { id: 'nu', title: 'Cost', type: 'number', order: 2 },
    { id: 'pr', title: 'Priority', type: 'priority', order: 3 },
    { id: 'da', title: 'Date', type: 'date', order: 4 },
    { id: 'ln', title: 'Link', type: 'link', order: 5 },
    { id: 'cb', title: 'Done?', type: 'checkbox', order: 6 },
    { id: 'tx', title: 'Text', type: 'text', order: 7 },
];
const titles = ['Alpha', 'beta', 'Gamma ray', 'delta', 'alpha two', 'Zeta', 'eta', 'Theta', ''];
const makeItem = (i: number): Item => ({
    id: `i${i}`,
    title: pick(titles) + (rand() < 0.3 ? ` ${i}` : ''),
    groupId: pick(['g1', 'g2', 'g3']),
    boardId: 'b',
    isHidden: rand() < 0.2,
    parentId: rand() < 0.25 ? `i${Math.floor(rand() * i)}` : undefined,
    values: {
        st: pick(['o1', 'o2', 'o3', 'Done', undefined, '']),
        dd: pick([['A'], ['B'], ['A', 'B'], [], undefined, 'A']),
        nu: pick([1, 2, '3', '10', 'x', undefined, 0, -4.5]),
        pr: pick([1, 5, '3', undefined, 0]),
        da: pick(['2026-01-05', '2025-12-31', '', undefined, '2026-10-15']),
        ln: pick(['https://a.com', { url: 'https://b.com', label: 'Bee' }, undefined, '']),
        cb: pick([true, false, undefined]),
        tx: pick(['x', 'Y', 'z', undefined, '10', '2'])
    }
});

let cases = 0;
for (let n = 0; n < 400; n++) {
    const items = Array.from({ length: 1 + Math.floor(rand() * 30) }, (_, i) => makeItem(i));
    const sortCol = pick([...columns.map(c => c.id), 'missing']);
    const board: Board = {
        id: 'b', title: 'B', columns, groups: [], items,
        sort: rand() < 0.8 ? { columnId: sortCol, direction: pick(['asc', 'desc'] as const) } : null,
        filters: rand() < 0.6 ? [
            { columnId: pick(['st', 'dd', 'cb', '__group__', 'tx']), values: pick([['o1'], ['A'], ['true'], ['g1', 'g3'], ['x'], []]) },
            ...(rand() < 0.3 ? [{ columnId: 'st', values: ['o2', 'Done'] }] : [])
        ] : undefined
    };
    const search = pick(['', 'a', 'ALPHA', 'eta', 'zz', ' ']);
    const showHidden = rand() < 0.5;
    const got = filterAndSortItems(board, { searchQuery: search, showHiddenItems: showHidden }).map(i => i.id);
    const want = reference(board, search, showHidden).map(i => i.id);
    cases++;
    check(`case ${n}`, JSON.stringify(got) === JSON.stringify(want), `${got.join(',')} vs ${want.join(',')}`);
}
check('does not mutate board.items', (() => {
    const items = Array.from({ length: 10 }, (_, i) => makeItem(i));
    const before = items.map(i => i.id).join(',');
    filterAndSortItems({ id: 'b', title: 'B', columns, groups: [], items, sort: { columnId: 'tx', direction: 'desc' } }, { searchQuery: '', showHiddenItems: true });
    return items.map(i => i.id).join(',') === before;
})());

console.log(`${cases} random boards compared\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
