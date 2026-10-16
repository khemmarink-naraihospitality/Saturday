import type { Column } from '../../types';
import { useBoardStore } from '../../store/useBoardStore';
import { useMobileUI } from '../state/mobileStore';

/** Column types that change on a tap with no sheet (a checkbox ticks). */
export const isDirectToggle = (column: Column) => column.type === 'checkbox';

/**
 * A tap on a cell: toggles it in place or opens its editor sheet
 * (CellEditorHost). Callers check permission first and don't call this for
 * people who can't edit.
 */
export const activateCell = ({ boardId, itemId, column, value }: { boardId: string; itemId: string; column: Column; value: unknown }) => {
    if (isDirectToggle(column)) {
        // The desktop CheckboxCell's rule: only `true` is ticked.
        void useBoardStore.getState().updateItemValue(itemId, column.id, value !== true);
        return;
    }
    useMobileUI.getState().openCellEditor({ boardId, itemId, columnId: column.id });
};
