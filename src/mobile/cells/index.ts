/**
 * Cells in the phone layout: how a value looks (CellView), how it is edited
 * (activateCell → a bottom sheet in CellEditorHost), and how wide its column is.
 * Owned by the "cells" agent; the board table and the item screen only use
 * what is exported here.
 */
export { CellView, type CellViewProps } from './CellView';
export { activateCell, isDirectToggle } from './activateCell';
export { columnWidthFor, NAME_COLUMN_WIDTH, NAME_COLUMN_MIN_WIDTH, UPDATES_COLUMN_WIDTH } from './columnWidths';
export { SummaryView } from './SummaryView';
