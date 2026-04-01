import { memo } from 'react';
import type { Column } from '../../types';
import { StatusCell } from './cells/StatusCell';
import { TextCell } from './cells/TextCell';
import { DateCell } from './cells/DateCell';
import { PeopleCell } from './cells/PeopleCell';
import { TimelineCell } from './cells/TimelineCell';
import { FilesCell } from './cells/FilesCell';
import { CheckboxCell } from './cells/CheckboxCell';
import { DropdownCell } from './cells/DropdownCell';

export const Cell = memo(({ 
    itemId, 
    boardId,
    column, 
    value, 
    groupColor 
}: { 
    itemId: string, 
    boardId: string,
    column: Column, 
    value: any,
    groupColor?: string 
}) => {
    // Dispatch to specific cell type components
    switch (column.type) {
        case 'status':
            return <StatusCell itemId={itemId} value={value} column={column} />;
        case 'people':
            return <PeopleCell itemId={itemId} boardId={boardId} value={value} column={column} />;
        case 'date':
            return <DateCell itemId={itemId} value={value} column={column} />;
        case 'timeline':
            return <TimelineCell itemId={itemId} value={value} column={column} groupColor={groupColor} />;
        case 'files':
            return <FilesCell itemId={itemId} files={value} column={column} />;
        case 'checkbox':
            return <CheckboxCell itemId={itemId} value={value} column={column} />;
        case 'dropdown':
            return <DropdownCell itemId={itemId} value={value} column={column} />;
        case 'text':
        case 'long_text':
        case 'number':
        case 'link':
        default:
            return <TextCell itemId={itemId} value={value} column={column} />;
    }
});
