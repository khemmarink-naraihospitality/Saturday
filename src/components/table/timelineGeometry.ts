/**
 * Geometry shared by the Timeline's bars and its dependency arrows.
 *
 * Lives in its own module so the two components can both read it without
 * importing each other.
 */

export const NAME_COL_WIDTH = 200;
export const ROW_INNER_HEIGHT = 36;
export const ROW_HEIGHT = 37; // 36px of row + the 1px bottom border
export const BAR_V_INSET = 6;

export interface BarGeometry {
    rowIndex: number;
    left: number;
    width: number;
    colId: string;
}
