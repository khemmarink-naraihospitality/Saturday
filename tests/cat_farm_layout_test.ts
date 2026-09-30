/**
 * Manual verification for the dashboard Cat Farm's cushion layout.
 * Run with:  npx tsx tests/cat_farm_layout_test.ts
 */
import { buildCatCushions, MORE_CUSHION_KEY, type CatFarmGroup } from '../src/lib/catFarmLayout';

let passed = 0;
let failed = 0;

const check = (label: string, ok: boolean, detail = '') => {
    if (ok) {
        passed++;
        console.log(`  PASS  ${label}`);
    } else {
        failed++;
        console.log(`  FAIL  ${label}${detail ? `\n        ${detail}` : ''}`);
    }
};

const group = (key: string, label: string, n: number): CatFarmGroup => ({
    key,
    label,
    color: '#888888',
    items: Array.from({ length: n }, (_, i) => ({ id: `${key}-${i}`, taskName: `${label} ${i}` }))
});

const catCount = (cushions: { cats: unknown[] }[]) => cushions.reduce((n, c) => n + c.cats.length, 0);

// Shaped like a real 229-task workspace with eight statuses.
const board = [
    group('done', 'Done', 112), group('work', 'Working on it', 40), group('queue', 'In Queue', 21),
    group('review', 'Review', 14), group('none', 'No status', 14), group('hold', 'On Hold', 11),
    group('stuck', 'Stuck', 9), group('cancel', 'Canceled', 8)
];

for (const width of [268, 420, 838]) {
    console.log(`\ncard row ${width}px`);
    const { cushions, total } = buildCatCushions(board, { width });
    const used = cushions.reduce((n, c) => n + c.width, 0) + 6 * (cushions.length - 1);

    check('counts every task', total === 229, `total ${total}`);
    check('cushions fill the row exactly', Math.abs(used - width) < 0.5, `${used.toFixed(1)}px`);
    check('no cushion narrower than 56px', cushions.every(c => c.width >= 55.99));
    check('at most 30 cats', catCount(cushions) <= 30, `${catCount(cushions)} cats`);
    check('every cushion has a cat', cushions.every(c => c.cats.length >= 1));
    check('biggest status is widest', cushions[0].width === Math.max(...cushions.map(c => c.width)));

    const more = cushions.find(c => c.key === MORE_CUSHION_KEY);
    if (more) {
        const folded = more.members?.reduce((n, m) => n + m.count, 0);
        check('"+N more" folds at least two statuses', (more.members?.length ?? 0) >= 2);
        check('"+N more" count is the sum of what it folded', more.count === folded, `${more.count} vs ${folded}`);
    }
}

console.log('\nstability and edge cases');
check(
    'same input and width lay out identically (no re-scatter on resize)',
    JSON.stringify(buildCatCushions(board, { width: 420 })) === JSON.stringify(buildCatCushions(board, { width: 420 }))
);
check('no tasks gives no cushions', buildCatCushions([], { width: 400 }).cushions.length === 0);
check('unmeasured width draws nothing yet', buildCatCushions(board, { width: 0 }).cushions.length === 0);

const single = buildCatCushions([group('d', 'Done', 3)], { width: 300 }).cushions;
check('one status is one full-width cushion', single.length === 1 && Math.round(single[0].width) === 300 && single[0].cats.length === 3);

const narrow = buildCatCushions(board, { width: 120 }).cushions;
check('very narrow keeps the top status plus "+N more"', narrow.length === 2 && narrow[1].key === MORE_CUSHION_KEY);

const five = [group('a', 'A', 5), group('b', 'B', 4), group('c', 'C', 3), group('d', 'D', 2), group('e', 'E', 1)];
check('never folds a lone status into "+1 more"', !buildCatCushions(five, { width: 420 }).cushions.some(c => c.label === '+1 more'));

const dominant = buildCatCushions([group('d', 'Done', 200), group('s', 'Stuck', 3), group('w', 'Working', 2)], { width: 420 }).cushions;
check(
    'one big status is capped and the small ones keep all their cats',
    dominant[0].cats.length === 10 && dominant[1].cats.length === 3 && dominant[2].cats.length === 2,
    dominant.map(c => `${c.label}:${c.cats.length}`).join(' ')
);
check('z-index stays under the hover lift (100)', dominant.every(c => c.cats.every(k => k.zIndex < 100)));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
