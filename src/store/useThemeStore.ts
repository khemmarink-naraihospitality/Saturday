import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PaletteId } from '../lib/palettes';

type Theme = 'light' | 'dark';

interface ThemeState {
    theme: Theme;
    /** The colour palette (src/lib/palettes.ts), independent of light/dark. */
    palette: PaletteId;
    toggleTheme: () => void;
    setTheme: (theme: Theme) => void;
    setPalette: (palette: PaletteId) => void;
}

const applyTheme = (theme: Theme) => {
    document.documentElement.setAttribute('data-theme', theme);
    if (theme === 'dark') {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }
};

// Saturday is the stylesheet's own :root, so it needs no attribute at all —
// the page looks exactly as it did before palettes existed.
const applyPalette = (palette: PaletteId) => {
    if (palette === 'saturday') document.documentElement.removeAttribute('data-palette');
    else document.documentElement.setAttribute('data-palette', palette);
};

export const useThemeStore = create<ThemeState>()(
    persist(
        (set) => ({
            theme: 'light',
            palette: 'saturday',
            toggleTheme: () => set((state) => {
                const newTheme = state.theme === 'light' ? 'dark' : 'light';
                applyTheme(newTheme);
                return { theme: newTheme };
            }),
            setTheme: (theme) => {
                applyTheme(theme);
                set({ theme });
            },
            setPalette: (palette) => {
                applyPalette(palette);
                set({ palette });
            },
        }),
        {
            name: 'theme-storage',
            onRehydrateStorage: () => (state) => {
                if (state) {
                    applyTheme(state.theme);
                    applyPalette(state.palette || 'saturday');
                }
            }
        }
    )
);
