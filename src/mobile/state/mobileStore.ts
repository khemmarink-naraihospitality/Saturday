import { create } from 'zustand';

/**
 * UI state that exists only in the phone layout. Everything about the data —
 * which board is open, which item, which workspace — stays in useBoardStore,
 * shared with the desktop layout; this holds the phone's own overlays.
 *
 * Pages the desktop doesn't have (a workspace's own screen, the workspace list,
 * More) are activePage values in useBoardStore instead ('workspace',
 * 'workspaces', 'more'), so the browser history and the URL treat them like any
 * other page — see nav/useMobileRouting.ts.
 */

/** A cell being edited in its bottom sheet. */
export interface CellEditorTarget {
    boardId: string;
    itemId: string;
    columnId: string;
}

/** The tab the item screen opens on. */
export type ItemTab = 'columns' | 'updates' | 'files';

interface MobileUIState {
    cellEditor: CellEditorTarget | null;
    openCellEditor: (target: CellEditorTarget) => void;
    closeCellEditor: () => void;

    /** The board whose Views sheet is open. */
    viewsSheetBoardId: string | null;
    openViewsSheet: (boardId: string) => void;
    closeViewsSheet: () => void;

    /** Tab the item screen shows next time it opens (reset to 'updates' on close). */
    itemTab: ItemTab;
    setItemTab: (tab: ItemTab) => void;
}

export const useMobileUI = create<MobileUIState>()(set => ({
    cellEditor: null,
    openCellEditor: (target) => set({ cellEditor: target }),
    closeCellEditor: () => set({ cellEditor: null }),

    viewsSheetBoardId: null,
    openViewsSheet: (boardId) => set({ viewsSheetBoardId: boardId }),
    closeViewsSheet: () => set({ viewsSheetBoardId: null }),

    itemTab: 'updates',
    setItemTab: (tab) => set({ itemTab: tab }),
}));
