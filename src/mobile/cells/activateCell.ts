import type { Column } from '../../types';
import { useMobileUI } from '../state/mobileStore';

/** Column types that change on a tap with no sheet (a checkbox ticks). */
export const isDirectToggle = (column: Column) => column.type === 'checkbox';

/**
 * A tap on a cell: toggles it in place or opens its editor sheet. Callers check
 * permission first and don't call this for people who can't edit.
 * Placeholder — the "cells" agent fills in the direct toggles.
 */
export const activateCell = ({ boardId, itemId, column }: { boardId: string; itemId: string; column: Column; value: unknown }) => {
    useMobileUI.getState().openCellEditor({ boardId, itemId, columnId: column.id });
};
