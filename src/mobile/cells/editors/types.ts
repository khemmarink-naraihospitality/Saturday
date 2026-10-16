import type { Board, Column, Item } from '../../../types';

/** What every cell editor sheet gets from CellEditorHost. */
export interface EditorProps {
    open: boolean;
    onClose: () => void;
    board: Board;
    item: Item;
    column: Column;
    value: unknown;
}
