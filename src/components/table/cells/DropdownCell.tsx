
import React, { useRef, useState, useCallback, memo } from 'react';
import type { Column } from '../../../types';
import { useBoardStore } from '../../../store/useBoardStore';
import { usePermission } from '../../../hooks/usePermission';
import { columnJustify } from '../../../lib/utils';
import { DropdownPicker } from '../DropdownPicker';

interface DropdownCellProps {
    itemId: string;
    column: Column;
    value: any;
}

export const DropdownCell: React.FC<DropdownCellProps> = memo(({ itemId, column, value }) => {
    const updateItemValue = useBoardStore(state => state.updateItemValue);
    const { can } = usePermission();

    const [isEditing, setIsEditing] = useState(false);
    const [pickerPos, setPickerPos] = useState<{ top: number, bottom: number, left: number, width: number } | null>(null);
    const cellRef = useRef<HTMLDivElement>(null);

    const selectedLabels = Array.isArray(value) ? value : (value ? [value] : []);

    const startEditing = useCallback(() => {
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
    }, [can]);

    return (
        <>
            <div
                ref={cellRef}
                className="table-cell"
                onClick={() => !isEditing && startEditing()}
                style={{
                    width: '100%',
                    height: '100%',
                    padding: '4px 8px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    cursor: 'pointer',
                    overflow: 'hidden',
                    flexWrap: 'nowrap',
                    // Unset stays flex-start (left) — the tag list's original,
                    // unconfigurable look — so existing boards don't shift
                    // until someone explicitly picks a different alignment.
                    justifyContent: columnJustify(column.numberAlign, 'left')
                }}
            >
                {selectedLabels.length > 0 ? (
                    selectedLabels.map((label: string, idx: number) => {
                        const options = Array.isArray(column.options) ? column.options : [];
                        const opt = options.find(o => o.label === label);
                        return (
                            <div key={idx} style={{
                                backgroundColor: opt?.color || '#a0c4ff',
                                color: '#fff',
                                padding: '2px 8px',
                                borderRadius: '12px',
                                fontSize: '11px',
                                fontWeight: 500,
                                whiteSpace: 'nowrap'
                            }}>
                                {label}
                            </div>
                        );
                    })
                ) : (
                    <span style={{ color: 'hsl(var(--color-text-tertiary))', fontSize: '12px' }}>+</span>
                )}
            </div>

            {isEditing && pickerPos && (
                <DropdownPicker
                    columnId={column.id}
                    options={column.options || []}
                    currentValue={selectedLabels}
                    position={pickerPos}
                    onSelect={(newValues) => {
                        updateItemValue(itemId, column.id, newValues);
                    }}
                    onClose={() => {
                        setIsEditing(false);
                        setPickerPos(null);
                    }}
                />
            )}
        </>
    );
});
