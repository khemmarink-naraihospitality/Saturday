
import React, { memo } from 'react';
import type { Column } from '../../../types';
import { useBoardStore } from '../../../store/useBoardStore';
import { Check } from 'lucide-react';

interface CheckboxCellProps {
    itemId: string;
    column: Column;
    value: any;
}

export const CheckboxCell: React.FC<CheckboxCellProps> = memo(({ itemId, column, value }) => {
    const updateItemValue = useBoardStore(state => state.updateItemValue);
    const isChecked = value === true;

    return (
        <div
            className="table-cell"
            onClick={() => updateItemValue(itemId, column.id, !isChecked)}
            style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                padding: 0
            }}
        >
            <div style={{
                width: '18px',
                height: '18px',
                borderRadius: '3px',
                border: '2px solid ' + (isChecked ? 'hsl(var(--color-brand-primary))' : 'hsl(var(--color-text-tertiary))'),
                backgroundColor: isChecked ? 'hsl(var(--color-brand-primary))' : 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.1s ease'
            }}>
                {isChecked && <Check size={14} color="white" strokeWidth={3} />}
            </div>
        </div>
    );
});
