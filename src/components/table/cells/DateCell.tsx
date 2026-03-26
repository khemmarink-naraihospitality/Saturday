
import React, { useRef, useState, useCallback, memo } from 'react';
import type { Column } from '../../../types';
import { useBoardStore } from '../../../store/useBoardStore';
import { usePermission } from '../../../hooks/usePermission';
import { Calendar } from 'lucide-react';
import { DatePicker } from '../../ui/DatePicker';

interface DateCellProps {
    itemId: string;
    column: Column;
    value: any;
}

export const DateCell: React.FC<DateCellProps> = memo(({ itemId, column, value }) => {
    const updateItemValue = useBoardStore(state => state.updateItemValue);
    const { can } = usePermission();

    const [isEditing, setIsEditing] = useState(false);
    const [pickerPos, setPickerPos] = useState<{ top: number, bottom: number, left: number, width: number } | null>(null);
    const cellRef = useRef<HTMLDivElement>(null);

    const formatDate = (dateStr: string) => {
        if (!dateStr) return '';
        const [y, m, d] = dateStr.split('-').map(Number);
        const date = new Date(y, m - 1, d);
        const today = new Date();
        const isCurrentYear = date.getFullYear() === today.getFullYear();

        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: isCurrentYear ? undefined : 'numeric'
        });
    };

    const startEditing = useCallback(() => {
        if (!can('edit_items')) return;
        if (cellRef.current) {
            const rect = cellRef.current.getBoundingClientRect();
            setPickerPos({
                top: rect.bottom + 4,
                left: rect.left,
                width: rect.width,
                bottom: rect.bottom + 4
            });
            setIsEditing(true);
        }
    }, [can]);

    return (
        <>
            <div
                ref={cellRef}
                className="table-cell"
                onClick={startEditing}
                style={{
                    width: '100%',
                    height: '100%',
                    borderRight: '1px solid hsl(var(--color-cell-border))',
                    padding: '0 8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    color: value ? 'inherit' : 'hsl(var(--color-text-tertiary))',
                    backgroundColor: isEditing ? 'hsl(var(--color-brand-light))' : 'transparent'
                }}
            >
                {value ? (
                    <span>{formatDate(value)}</span>
                ) : (
                    <div style={{ opacity: 0.5, display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
                        <Calendar size={16} strokeWidth={1.5} />
                    </div>
                )}
            </div>

            {isEditing && pickerPos && (
                <DatePicker
                    date={value ? new Date(value) : undefined}
                    position={pickerPos}
                    onSelect={(date) => {
                        if (date) {
                            const offset = date.getTimezoneOffset();
                            const localDate = new Date(date.getTime() - (offset * 60 * 1000));
                            const dateStr = localDate.toISOString().split('T')[0];
                            updateItemValue(itemId, column.id, dateStr);
                        } else {
                            updateItemValue(itemId, column.id, null);
                        }
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
});
