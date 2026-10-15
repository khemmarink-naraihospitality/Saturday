import type { Column } from '../../types';

/** The sticky first column ("item name") before the table is scrolled sideways. */
export const NAME_COLUMN_WIDTH = 318;
/** …and how narrow it gets once the table is scrolled sideways. */
export const NAME_COLUMN_MIN_WIDTH = 158;
/** The speech-bubble column that opens an item's updates. */
export const UPDATES_COLUMN_WIDTH = 82;

/** Width of a column in the phone table, by type. */
export const columnWidthFor = (column: Column): number => {
    switch (column.type) {
        case 'status':
        case 'dropdown':
            return 156;
        case 'people':
            return 92;
        case 'date':
        case 'due_date':
            return 150;
        case 'timeline':
            return 176;
        case 'number':
            return 132;
        case 'checkbox':
            return 84;
        case 'priority':
            return 128;
        case 'files':
            return 112;
        default:
            return 168;
    }
};
