
import React, { useRef, useState } from 'react';
import type { Item, Column } from '../../../types';
import { useBoardStore } from '../../../store/useBoardStore';
import { usePermission } from '../../../hooks/usePermission';
import { TimelinePicker } from '../TimelinePicker';

interface TimelineCellProps {
    item: Item;
    column: Column;
}

export const TimelineCell: React.FC<TimelineCellProps> = ({ item, column }) => {
    const value = item.values[column.id];
    const updateItemValue = useBoardStore(state => state.updateItemValue);
    const { can } = usePermission();

    const [isEditing, setIsEditing] = useState(false);
    const [isHovered, setIsHovered] = useState(false);
    const [pickerPos, setPickerPos] = useState<{ top: number, bottom: number, left: number, width: number } | null>(null);
    const cellRef = useRef<HTMLDivElement>(null);

    const formatRange = (v: any) => {
        if (!v || !v.from || !v.to) return null;
        const formatDate = (dateStr: string) => {
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
        return `${formatDate(v.from)} - ${formatDate(v.to)}`;
    };

    const countDays = (v: any) => {
        if (!v || !v.from || !v.to) return 0;
        const start = new Date(v.from);
        const end = new Date(v.to);
        return Math.round((end.getTime() - start.getTime()) / (1000 * 3600 * 24)) + 1;
    };

    const group = useBoardStore(state => 
        state.boards.find(b => b.id === item.boardId)?.groups.find(g => g.id === item.groupId)
    );
    const groupColor = group?.color || '#ff158a';

    const displayValue = formatRange(value);
    const days = countDays(value);

    return (
        <>
            <div
                ref={cellRef}
                className="table-cell"
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
                onClick={() => {
                    if (!can('edit_items')) return;
                    if (cellRef.current) {
                        const rect = cellRef.current.getBoundingClientRect();
                        setPickerPos({
                            top: rect.bottom + 4,
                            left: rect.left,
                            width: rect.width,
                            bottom: rect.bottom
                        });
                        setIsEditing(true);
                    }
                }}
                style={{
                    width: '100%',
                    height: '100%',
                    borderRight: '1px solid hsl(var(--color-cell-border))',
                    padding: '0 10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer'
                }}
            >
                {displayValue ? (
                    <div style={{
                        backgroundColor: groupColor,
                        color: 'white',
                        padding: '0 12px',
                        borderRadius: '16px',
                        fontSize: '11px',
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '90%',
                        height: '19px',
                        position: 'relative',
                        overflow: 'hidden',
                        transition: 'all 0.2s ease',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                    }} title={`${displayValue} (${days} days)`}>
                        {isHovered ? (
                            <span style={{ fontWeight: 700 }}>{days}d</span>
                        ) : (
                            <span style={{
                                textOverflow: 'ellipsis',
                                overflow: 'hidden',
                                whiteSpace: 'nowrap',
                                maxWidth: '100%',
                                display: 'block'
                            }}>
                                {displayValue}
                            </span>
                        )}
                    </div>
                ) : (
                    <div style={{ color: 'hsl(var(--color-text-tertiary))', opacity: 0.5 }}>
                        -
                    </div>
                )}
            </div>

            {isEditing && pickerPos && (
                <TimelinePicker
                    dateRange={value}
                    position={pickerPos}
                    onSelect={(range) => {
                        updateItemValue(item.id, column.id, range);
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
