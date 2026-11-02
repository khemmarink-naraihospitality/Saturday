import { memo } from 'react';
import type { Column, Item } from '../../types';
import { StatusCell } from './cells/StatusCell';
import { TextCell } from './cells/TextCell';
import { DateCell } from './cells/DateCell';
import { PeopleCell } from './cells/PeopleCell';
import { TimelineCell } from './cells/TimelineCell';
import { FilesCell } from './cells/FilesCell';
import { CheckboxCell } from './cells/CheckboxCell';
import { DropdownCell } from './cells/DropdownCell';
import { LinkCell } from './cells/LinkCell';
import { PriorityCell } from './cells/PriorityCell';
import { FormulaCell } from './cells/FormulaCell';

export const Cell = memo(({ 
    itemId, 
    boardId,
    column, 
    value, 
    groupColor,
    isSubItem,
    item
}: { 
    itemId: string, 
    boardId: string,
    column: Column, 
    value: any,
    groupColor?: string,
    isSubItem?: boolean,
    // The whole row, passed for Formula columns only (they read the row's
    // other values); other cells stay memoised on their own value.
    item?: Item
}) => {
    if (column.type === 'formula') {
        return item ? <FormulaCell item={item} column={column} /> : <div className="table-cell" />;
    }

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
        case 'due_date':
            return <DateCell itemId={itemId} value={value} column={column} isDueDate />;
        case 'timeline':
            return <TimelineCell itemId={itemId} value={value} column={column} groupColor={groupColor} />;
        case 'files':
            return <FilesCell itemId={itemId} files={value} column={column} />;
        case 'checkbox':
            return <CheckboxCell itemId={itemId} value={value} column={column} />;
        case 'dropdown':
            return <DropdownCell itemId={itemId} value={value} column={column} />;
        case 'link':
            return <LinkCell itemId={itemId} value={value} column={column} />;
        case 'priority':
            return <PriorityCell itemId={itemId} value={value} column={column} />;
        case 'text':
        case 'long_text':
        case 'number':
        default:
            return <TextCell itemId={itemId} value={value} column={column} />;
    }
});
