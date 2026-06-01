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
    groupColor,
    isSubItem
}: { 
    itemId: string, 
    boardId: string,
    column: Column, 
    value: any,
    groupColor?: string,
    isSubItem?: boolean
}) => {
    // Hybrid Rendering Logic: Switch types for Sub-items in certain columns
    if (isSubItem) {
        if (column.title === 'SOR Complete') {
            return <DateCell itemId={itemId} value={value} column={column} />;
        }
        if (column.title === 'RFI Sent' || column.title === 'Numbers') {
            // RFI Sent (Item ID) and Numbers (Dropdown) in subitems are treated as Text
            return <TextCell itemId={itemId} value={value} column={column} />;
        }
    }

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
