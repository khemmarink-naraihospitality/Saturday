import { memo } from 'react';
import type { Item, Column } from '../../types';
import { StatusCell } from './cells/StatusCell';
import { TextCell } from './cells/TextCell';
import { DateCell } from './cells/DateCell';
import { PeopleCell } from './cells/PeopleCell';
import { TimelineCell } from './cells/TimelineCell';
import { FilesCell } from './cells/FilesCell';
import { CheckboxCell } from './cells/CheckboxCell';
import { DropdownCell } from './cells/DropdownCell';

export const Cell = memo(({ item, column, groupColor }: { item: Item, column: Column, groupColor?: string }) => {
    // Dispatch to specific cell type components
    switch (column.type) {
        case 'status':
            return <StatusCell item={item} column={column} />;
        case 'people':
            return <PeopleCell item={item} column={column} />;
        case 'date':
            return <DateCell item={item} column={column} />;
        case 'timeline':
            return <TimelineCell item={item} column={column} groupColor={groupColor} />;
        case 'files':
            return <FilesCell item={item} column={column} />;
        case 'checkbox':
            return <CheckboxCell item={item} column={column} />;
        case 'dropdown':
            return <DropdownCell item={item} column={column} />;
        case 'text':
        case 'long_text':
        case 'number':
        case 'link':
        default:
            return <TextCell item={item} column={column} />;
    }
});
