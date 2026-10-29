import { useThemeStore } from '../store/useThemeStore';
import type { PaletteId } from './palettes';

/**
 * NHG (palette id 'narai') is more than colours: it is also the "New UI". The
 * product is called NHG WorkSpace, things are named Space / Space Folder /
 * Task Group / Task / Comment (src/lib/terms.ts), and a few screens are laid
 * out differently: the sidebar's Dashboard area and profile, status pills,
 * tinted group headers, New Item on the right. Saturday keeps every one of
 * them exactly as it was, so each switch below is false for it.
 */
export const isNewUi = (palette: PaletteId) => palette === 'narai';

/** For components: re-renders when someone switches palette. */
export const useNewUi = () => useThemeStore(s => isNewUi(s.palette));

/** For code outside React (store actions, toasts). */
export const newUiActive = () => isNewUi(useThemeStore.getState().palette);

/** What follows "NHG" in the product's name. */
export const productName = (newUi: boolean) => (newUi ? 'WorkSpace' : 'Saturday');

/** NHG's mark beside the name in the sidebar: Galangal on transparent, for the Narai Green. */
export const NHG_LOGO = 'https://guideline.lubd.com/wp-content/uploads/2026/02/n.png';
