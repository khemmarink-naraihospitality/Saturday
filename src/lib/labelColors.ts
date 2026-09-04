/**
 * The one palette every labelled column picks from — Status and Dropdown alike.
 *
 * Both used to choose colours their own way: Status offered this curated grid,
 * Dropdown handed the user a raw <input type="color">, i.e. all 16 million of
 * them. That made two boards built by two people look nothing alike and gave
 * the Dashboard's status charts an unbounded set of colours to render. Sharing
 * one list keeps the vocabulary finite and the two column types consistent.
 *
 * Ordered by hue family (10 steps each) so the grid reads as a spectrum.
 */
export const LABEL_COLORS = [
    // Reds
    '#FF1744', '#E53935', '#C62828', '#B71C1C', '#FF5252',
    '#FF6B6B', '#FF8A80', '#FFCDD2', '#D32F2F', '#FC3F82',
    // Pinks / Magentas
    '#E91E63', '#C2185B', '#AD1457', '#880E4F', '#F06292',
    '#FF4081', '#FF80AB', '#F48FB1', '#F8BBD9', '#FF6CE8',
    // Oranges
    '#FF5722', '#F4511E', '#BF360C', '#E64A19', '#FF7043',
    '#FF6D00', '#FF9800', '#F57C00', '#FFAB40', '#FFCCBC',
    // Yellows / Ambers
    '#FFC107', '#FFB300', '#FF8F00', '#FF6F00', '#FFCA28',
    '#FFD740', '#F9A825', '#F57F17', '#FFF176', '#FFF9C4',
    // Lime / Yellow-Greens
    '#CDDC39', '#C0CA33', '#AFB42B', '#9E9D24', '#D4E157',
    '#92BF0A', '#8BC34A', '#7CB342', '#689F38', '#C5E1A5',
    // Greens
    '#4CAF50', '#43A047', '#388E3C', '#2E7D32', '#1B5E20',
    '#00C853', '#69F0AE', '#00E676', '#A5D6A7', '#C8E6C9',
    // Teals / Cyans
    '#009688', '#00897B', '#00796B', '#00695C', '#006064',
    '#00BCD4', '#00ACC1', '#0097A7', '#26C6DA', '#B2EBF2',
    // Blues
    '#2196F3', '#1E88E5', '#1976D2', '#1565C0', '#0D47A1',
    '#448AFF', '#82B1FF', '#0288D1', '#0277BD', '#BBDEFB',
    // Purples / Violets
    '#9C27B0', '#8E24AA', '#7B1FA2', '#6A1B9A', '#4A148C',
    '#7C3FE4', '#673AB7', '#7E57C2', '#B39DDB', '#EDE7F6',
    // Neutrals / Grays
    '#607D8B', '#546E7A', '#455A64', '#37474F', '#263238',
    '#9E9E9E', '#757575', '#616161', '#424242', '#1A1728',
];

/**
 * Colour to hand a newly created option. Walks one colour per hue family so
 * the first several options in a column are told apart at a glance instead of
 * arriving as neighbouring shades of the same red.
 */
const NEW_LABEL_CYCLE = [
    '#00C875', // green
    '#FDB122', // amber
    '#E2445C', // red
    '#579BFC', // blue
    '#A25DDC', // purple
    '#FF5AC4', // pink
    '#00BCD4', // cyan
    '#7CB342', // olive
    '#FF7043', // orange
    '#607D8B', // slate
];

export const nextLabelColor = (existingCount: number): string =>
    NEW_LABEL_CYCLE[existingCount % NEW_LABEL_CYCLE.length];

/**
 * Both Status and Dropdown pickers offer a one-click "+ New label" button
 * that used to always name the result "New Label" verbatim. Clicked twice
 * without renaming in between, that created two options sharing one label —
 * harmless for Status (selection is by option id), but for Dropdown the
 * selection state itself is a set of label strings, so two same-named
 * options become indistinguishable: picking either one lit up both rows'
 * checkmarks and there was no way to select just one of them. Suffixing a
 * counter keeps every option's label unique from the moment it's created.
 */
export const nextUniqueLabel = (existingLabels: string[], base = 'New Label'): string => {
    const taken = new Set(existingLabels);
    if (!taken.has(base)) return base;
    let n = 2;
    while (taken.has(`${base} ${n}`)) n++;
    return `${base} ${n}`;
};

export const PALETTE_WIDTH = 252;
export const PALETTE_HEIGHT = 220;

/**
 * Places the palette popover next to the swatch that opened it, flipping above
 * when there's no room below and pulling left of the viewport edge.
 */
export const palettePosition = (swatch: HTMLElement) => {
    const rect = swatch.getBoundingClientRect();
    const top = rect.bottom + PALETTE_HEIGHT > window.innerHeight
        ? Math.max(8, rect.top - PALETTE_HEIGHT - 4)
        : rect.bottom + 4;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - PALETTE_WIDTH - 8));
    return { top, left };
};
