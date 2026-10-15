import { memo } from 'react';
import type { Column, Item } from '../../types';
import type { PersonInfo } from '../ui';

export interface CellViewProps {
    column: Column;
    value: unknown;
    item: Item;
    /** The open board's members by user id (useBoardPeople). */
    people: Map<string, PersonInfo>;
    /** 'table': fills a fixed-height table cell. 'detail': a row value in the item's Columns tab. */
    variant: 'table' | 'detail';
}

/** Placeholder — the "cells" agent replaces this with a renderer per column type. */
export const CellView = memo(({ value }: CellViewProps) => (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 }} className="m-truncate">
        {value === null || value === undefined ? '' : typeof value === 'object' ? '…' : String(value)}
    </div>
));
