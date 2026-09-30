/**
 * Layout for the dashboard's Cat Farm: one cushion per status, as wide as its
 * share of the tasks, with that status's cats piled on top.
 *
 * Kept free of React so the allocation and pile maths can be checked from node,
 * the same arrangement as dependencyUtils and activityStats.
 */

export interface CatFarmItem {
    id: string;
    taskName: string;
}

export interface CatFarmGroup {
    key: string;
    label: string;
    color: string;
    // Order matters: the first N become cats. Callers shuffle once and cache, so
    // the same tasks keep showing across re-renders and resizes.
    items: CatFarmItem[];
}

export type CatPose = 'sleep' | 'sit';

export interface CatSlot {
    id: string;
    taskName: string;
    // A cat keeps its own status colour even on the grey "+N more" cushion, so
    // that cushion still shows which statuses it is standing in for.
    color: string;
    pose: CatPose;
    size: number;
    // Horizontal centre, as a percentage of the cushion's width.
    leftPct: number;
    // Height above the cushion's top edge.
    bottomPx: number;
    zIndex: number;
    // Negative, so the pile doesn't breathe and bob in unison.
    delay: number;
    // The cat art only faces one way; mirroring about half of them keeps a
    // pile from looking like a row of copies.
    flip: boolean;
}

export interface CatCushion {
    key: string;
    label: string;
    color: string;
    count: number;
    percent: number;
    width: number;
    // Set only on the "+N more" cushion: what it is standing in for.
    members?: { label: string; count: number }[];
    cats: CatSlot[];
}

export const NO_STATUS_KEY = '__none__';
export const MORE_CUSHION_KEY = '__more__';
export const NEUTRAL_CUSHION_COLOR = '#cbd5e1';

interface BuildOptions {
    // Pixel width available to the whole cushion row.
    width: number;
    gap?: number;
    minCushionWidth?: number;
    maxShown?: number;
    maxCats?: number;
    maxPerCushion?: number;
}

interface Entry extends CatFarmItem {
    color: string;
}

// A pile, bottom row first. Sleepers lie along the cushion; sitters stack behind
// and above them, slightly smaller each row, so it reads as a heap rather than a
// grid of cats.
const PILE_ROWS: { pose: CatPose; size: number; bottomPx: number }[] = [
    { pose: 'sleep', size: 26, bottomPx: 0 },
    { pose: 'sit', size: 24, bottomPx: 14 },
    { pose: 'sit', size: 22, bottomPx: 27 }
];

// Cats overlap a little in a pile, so each needs ~15px of cushion, not its full
// width. Measured against the inset 80% of the cushion the pile spreads over.
const CAT_PITCH = 15;
const catsPerRow = (width: number) => Math.max(1, Math.floor((width * 0.8) / CAT_PITCH));

// Stable per task and per purpose, so a pile re-flowing on resize doesn't also
// re-scatter itself.
const hash01 = (text: string, salt: number) => {
    let h = 2166136261 ^ salt;
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return ((h >>> 0) % 10000) / 10000;
};

/**
 * Widths proportional to count, but never below `min`. Works like CSS flex-grow
 * with a min-width: anything that would come out too narrow is pinned at the
 * minimum and the rest is re-shared among the others.
 */
const proportionalWidths = (counts: number[], available: number, min: number): number[] => {
    const widths = counts.map(() => 0);
    let open = counts.map((_, i) => i);
    let space = available;

    while (open.length > 0) {
        const openTotal = open.reduce((sum, i) => sum + counts[i], 0);
        const tooNarrow = open.filter(i => (space * counts[i]) / openTotal < min);
        if (tooNarrow.length === 0) {
            open.forEach(i => { widths[i] = (space * counts[i]) / openTotal; });
            break;
        }
        tooNarrow.forEach(i => { widths[i] = min; space -= min; });
        open = open.filter(i => !tooNarrow.includes(i));
    }
    return widths;
};

const layoutPile = (entries: Entry[], perRowCap: number): CatSlot[] => {
    const rows = Math.min(PILE_ROWS.length, Math.max(1, Math.ceil(entries.length / perRowCap)));

    // Bottom row takes the most, so the heap tapers as it goes up.
    const perRow: number[] = [];
    let left = entries.length;
    for (let r = 0; r < rows; r++) {
        const take = Math.min(perRowCap, Math.ceil(left / (rows - r)));
        perRow.push(take);
        left -= take;
    }

    const slots: CatSlot[] = [];
    let next = 0;
    perRow.forEach((count, r) => {
        const row = PILE_ROWS[r];
        // Spread along the cushion but inset from its rounded ends. Rows with
        // different counts centre differently, which staggers them naturally.
        const step = 80 / count;
        for (let c = 0; c < count; c++) {
            const entry = entries[next++];
            slots.push({
                id: entry.id,
                taskName: entry.taskName,
                color: entry.color,
                pose: row.pose,
                size: row.size,
                leftPct: 10 + step * (c + 0.5) + (hash01(entry.id, 1) - 0.5) * Math.min(step * 0.4, 6),
                bottomPx: row.bottomPx + (hash01(entry.id, 2) - 0.5) * 3,
                // Front row in front. Kept under 100 so the hover rule, which
                // lifts a cat to z-index 100, still brings it above the pile.
                zIndex: (rows - r) * 10 + c,
                delay: -hash01(entry.id, 3) * 5,
                flip: hash01(entry.id, 4) > 0.5
            });
        }
    });
    return slots;
};

/**
 * Turns status groups into cushions sized for the space available.
 *
 * As many cushions are shown as fit at `minCushionWidth`; past that the smaller
 * statuses fold into one grey "+N more" cushion. Each cushion is as wide as its
 * share of the tasks and holds only as many cats as that width can seat, so a
 * narrow card doesn't bury a thin cushion under a pile meant for a wide one.
 * Within that, cats are shared out in proportion to count, at least one per
 * cushion and never more than `maxCats` in total.
 */
export const buildCatCushions = (
    groups: CatFarmGroup[],
    {
        width,
        gap = 6,
        minCushionWidth = 56,
        maxShown = 6,
        maxCats = 30,
        maxPerCushion = 10
    }: BuildOptions
): { cushions: CatCushion[]; total: number } => {
    const ranked = groups
        .map((group, order) => ({ ...group, order }))
        .filter(group => group.items.length > 0)
        .sort((a, b) => b.items.length - a.items.length || a.order - b.order);

    const total = ranked.reduce((sum, group) => sum + group.items.length, 0);
    if (total === 0 || width <= 0) return { cushions: [], total };

    // How many cushions fit side by side. At least two, so there is always room
    // for the top status plus a "+N more" beside it.
    const fit = Math.floor((width + gap) / (minCushionWidth + gap));
    const slots = Math.max(2, Math.min(maxShown, fit));

    type Shown = { key: string; label: string; color: string; entries: Entry[]; members?: CatCushion['members'] };
    const asShown = (group: CatFarmGroup): Shown => ({
        key: group.key,
        label: group.label,
        color: group.color,
        entries: group.items.map(item => ({ ...item, color: group.color }))
    });

    // Past the slots, fold the tail into "+N more". Taking one slot for it means
    // the tail always holds at least two statuses, so it is never "+1 more",
    // which would cost the same room as just showing that status.
    let shown: Shown[];
    if (ranked.length > slots) {
        const tail = ranked.slice(slots - 1);
        shown = [
            ...ranked.slice(0, slots - 1).map(asShown),
            {
                key: MORE_CUSHION_KEY,
                label: `+${tail.length} more`,
                color: NEUTRAL_CUSHION_COLOR,
                entries: tail.flatMap(group => group.items.map(item => ({ ...item, color: group.color }))),
                members: tail.map(group => ({ label: group.label, count: group.items.length }))
            }
        ];
    } else {
        shown = ranked.map(asShown);
    }

    const counts = shown.map(cushion => cushion.entries.length);
    const widths = proportionalWidths(counts, width - gap * (shown.length - 1), minCushionWidth);
    const perRowCaps = widths.map(catsPerRow);
    const caps = counts.map((count, i) =>
        Math.min(count, maxPerCushion, perRowCaps[i] * PILE_ROWS.length)
    );

    // Seed every cushion with one cat, then hand the rest out one at a time to
    // whichever cushion is furthest below its fair share and still has room —
    // largest-remainder done greedily, so it sums exactly and never overshoots a
    // cap.
    const budget = Math.min(maxCats, caps.reduce((sum, cap) => sum + cap, 0));
    const ideal = counts.map(count => (budget * count) / total);
    const alloc = shown.map((_, i) => (i < budget ? 1 : 0));
    let remaining = budget - Math.min(budget, shown.length);
    while (remaining > 0) {
        let best = -1;
        for (let i = 0; i < shown.length; i++) {
            if (alloc[i] >= caps[i]) continue;
            if (best === -1 || ideal[i] - alloc[i] > ideal[best] - alloc[best]) best = i;
        }
        if (best === -1) break;
        alloc[best]++;
        remaining--;
    }

    const cushions: CatCushion[] = shown.map((cushion, i) => ({
        key: cushion.key,
        label: cushion.label,
        color: cushion.color,
        count: counts[i],
        percent: Math.round((counts[i] / total) * 1000) / 10,
        width: widths[i],
        members: cushion.members,
        cats: layoutPile(cushion.entries.slice(0, alloc[i]), perRowCaps[i])
    }));

    return { cushions, total };
};
