/**
 * The app's colour palettes. Each person picks one (Profile Settings › Theme,
 * or More › Theme on the phone); light/dark is a separate switch on top.
 *
 * The colours themselves are CSS variables: Saturday is :root in
 * src/styles/variables.css (and the .m-app block in src/mobile/mobile.css),
 * every other palette overrides the same variables under
 * html[data-palette='<id>'], set by useThemeStore.setPalette. `swatch` is only
 * for drawing the little preview in the picker, in that palette's own colours
 * whatever palette is active.
 */
export type PaletteId = 'saturday' | 'narai';

export interface Palette {
    id: PaletteId;
    name: string;
    blurb: string;
    swatch: { canvas: string; sidebar: string; line: string; brand: string; brandSoft: string; accent: string; text: string };
}

export const PALETTES: Palette[] = [
    {
        id: 'saturday',
        name: 'Saturday',
        blurb: 'Violet on white — the original look',
        swatch: { canvas: '#ffffff', sidebar: '#f0eef8', line: '#e4e1f0', brand: '#7c3fe4', brandSoft: '#f0eeff', accent: '#c03fe4', text: '#1a1728' },
    },
    {
        id: 'narai',
        name: 'Narai',
        blurb: 'Crystal glass in pale sage green',
        swatch: { canvas: '#ffffff', sidebar: '#dfeecd', line: '#e9f0de', brand: '#4f7f43', brandSoft: '#eaf5d9', accent: '#9cc472', text: '#222b1b' },
    },
];

export const isPaletteId = (value: unknown): value is PaletteId =>
    PALETTES.some(p => p.id === value);
