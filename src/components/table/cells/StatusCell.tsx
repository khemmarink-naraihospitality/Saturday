
import React, { useRef, useState } from 'react';
import type { Item, Column } from '../../../types';
import { useBoardStore } from '../../../store/useBoardStore';
import { usePermission } from '../../../hooks/usePermission';
import { StatusPicker } from '../StatusPicker';

interface StatusCellProps {
    item: Item;
    column: Column;
}

export const StatusCell: React.FC<StatusCellProps> = ({ item, column }) => {
    const value = item.values[column.id];
    const updateItemValue = useBoardStore(state => state.updateItemValue);
    const { can } = usePermission();

    const [isEditing, setIsEditing] = useState(false);
    const [pickerPos, setPickerPos] = useState<{ top: number, bottom: number, left: number, width: number } | null>(null);
    const cellRef = useRef<HTMLDivElement>(null);

    const startEditing = () => {
        if (!can('edit_items')) return;

        setIsEditing(true);
        if (cellRef.current) {
            const rect = cellRef.current.getBoundingClientRect();
            setPickerPos({
                top: rect.top,
                bottom: rect.bottom,
                left: rect.left,
                width: rect.width
            });
        }
    };

    const options = Array.isArray(column.options) ? column.options : [];
    const statusOption = options.find(opt => opt.id === value || opt.label === value);
    const color = statusOption?.color || (value ? '#c4c4c4' : '#c4c4c4');
    const content = statusOption ? statusOption.label : (value || '');
    const backgroundColor = color;
    const textColor = '#fff';

    return (
        <>
            <div
                ref={cellRef}
                className="table-cell status-cell-full"
                onClick={() => !isEditing && startEditing()}
                style={{
                    width: '100%',
                    height: '100%',
                    borderRight: '1px solid hsl(var(--color-cell-border))',
                    padding: 0,
                    backgroundColor: backgroundColor,
                    color: textColor,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textAlign: 'center',
                    fontWeight: 500,
                    fontSize: '13px',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    userSelect: 'none'
                }}
            >
                {content}
            </div>

            {isEditing && pickerPos && (
                <StatusPicker
                    columnId={column.id}
                    options={column.options || []}
                    currentValue={value}
                    position={pickerPos}
                    onSelect={(label) => {
                        updateItemValue(item.id, column.id, label);
                        setIsEditing(false);
                        setPickerPos(null);
                    }}
                    onClose={() => {
                        setIsEditing(false);
                        setPickerPos(null);
                    }}
                />
            )}
        </>
    );
};
