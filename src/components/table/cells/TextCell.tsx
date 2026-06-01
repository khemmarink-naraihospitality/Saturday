
import React, { useRef, useState, useEffect, memo } from 'react';
import type { Column } from '../../../types';
import { useBoardStore } from '../../../store/useBoardStore';
import { usePermission } from '../../../hooks/usePermission';
import { Hash, Type, Link2 } from 'lucide-react';

interface TextCellProps {
    itemId: string;
    column: Column;
    value: any;
}

export const TextCell: React.FC<TextCellProps> = memo(({ itemId, column, value }) => {
    const updateItemValue = useBoardStore(state => state.updateItemValue);
    const { can } = usePermission();

    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState(value);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        setEditValue(value);
    }, [value]);

    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isEditing]);

    const handleBlur = () => {
        setIsEditing(false);
        if (editValue !== value) {
            updateItemValue(itemId, column.id, editValue);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            setIsEditing(false);
            if (editValue !== value) {
                updateItemValue(itemId, column.id, editValue);
            }
        }
        if (e.key === 'Escape') {
            setEditValue(value);
            setIsEditing(false);
        }
    };

    const startEditing = () => {
        if (!can('edit_items')) return;
        setIsEditing(true);
    };

    // Edit input renderer to match Row.tsx exactly
    const renderEditInput = () => (
        <div style={{ flex: 1, overflow: 'hidden', position: 'relative', display: 'flex', alignItems: 'center', width: '100%', height: '100%', backgroundColor: 'hsl(var(--color-bg-surface))' }}>
            <input
                ref={inputRef}
                type="text"
                value={editValue || ''}
                onChange={(e) => {
                    const val = e.target.value;
                    if (column.type === 'number') {
                        if (/^[0-9]*\.?[0-9]*%?$/.test(val)) setEditValue(val);
                    } else {
                        setEditValue(val);
                    }
                }}
                onBlur={handleBlur}
                onKeyDown={handleKeyDown}
                placeholder={column.type === 'link' ? "Paste link here..." : ""}
                style={{
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    border: 'none',
                    background: 'transparent',
                    width: '100%',
                    fontSize: column.title === 'Champion' ? '12px' : '13px',
                    color: 'inherit',
                    outline: 'none',
                    paddingLeft: '4px', // Same as Item column on focus
                    cursor: 'text',
                    pointerEvents: 'auto',
                    zIndex: 100,
                    position: 'relative'
                }}
            />
        </div>
    );

    // Render logic based on type (Link vs others)
    if (column.type === 'link') {
        if (isEditing) {
            return (
                <div className="table-cell" style={{ ...cellStyle, padding: 0 }}>
                    {renderEditInput()}
                </div>
            );
        }
        const url = value ? (value.startsWith('http') ? value : `https://${value}`) : '';
        return (
            <div className="table-cell" onClick={startEditing} style={cellStyle}>
                {value ? (
                    <a href={url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} style={linkStyle}
                        onMouseEnter={(e) => e.currentTarget.style.textDecoration = 'underline'}
                        onMouseLeave={(e) => e.currentTarget.style.textDecoration = 'none'}>
                        {value}
                    </a>
                ) : (
                    <div style={placeholderStyle}>
                        <Link2 size={16} />
                    </div>
                )}
            </div>
        );
    }

    if (isEditing) {
        return (
            <div className="table-cell" style={{ ...cellStyle, padding: 0 }}>
                {renderEditInput()}
            </div>
        );
    }

    return (
        <div 
            className="table-cell" 
            onClick={startEditing} 
            style={{ 
                ...cellStyle, 
                justifyContent: column.type === 'number' ? 'flex-end' : 'flex-start',
                fontSize: column.title === 'Champion' ? '12px' : '13px',
                color: column.title === 'Champion' ? 'hsl(var(--color-text-secondary))' : 'inherit',
                transition: 'background-color 0.2s ease',
                cursor: can('edit_items') ? 'text' : 'default'
            }}
            onMouseEnter={(e) => {
                if (can('edit_items')) e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-hover))';
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
            }}
        >
            {value || (
                <div style={placeholderStyle}>
                    {column.type === 'number' && <Hash size={16} />}
                    {column.type === 'text' && <Type size={16} />}
                    {!['number', 'text'].includes(column.type) && '-'}
                </div>
            )}
        </div>
    );
});

const cellStyle: React.CSSProperties = {
    width: '100%', height: '100%', padding: '0 8px',
    display: 'flex', alignItems: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'text'
};
const linkStyle: React.CSSProperties = { color: 'hsl(var(--color-brand-primary))', textDecoration: 'none', cursor: 'pointer' };
const placeholderStyle: React.CSSProperties = { color: 'hsl(var(--color-text-tertiary))', opacity: 0.5, display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', cursor: 'pointer' };
