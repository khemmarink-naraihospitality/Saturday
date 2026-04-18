
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

    // Render logic based on type (Link vs others)
    if (column.type === 'link') {
        if (isEditing) {
            return (
                <div className="table-cell" style={{ 
                    ...cellStyle, 
                    padding: 0,
                    backgroundColor: 'hsl(var(--color-bg-surface))' 
                }}>
                    <input
                        ref={inputRef}
                        type="text"
                        value={editValue || ''}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={handleBlur}
                        onKeyDown={handleKeyDown}
                        placeholder="Paste link here..."
                        style={{
                            ...inputStyle,
                            border: '1px solid hsl(var(--color-brand-primary))',
                            borderRadius: '4px',
                            margin: '2px', // Slight margin to show the highlight background
                            padding: '0 8px',
                            backgroundColor: 'white',
                            color: 'hsl(var(--color-text-primary))'
                        }}
                    />
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
            <div className="table-cell" style={{ 
                ...cellStyle, 
                padding: 0,
                backgroundColor: 'hsl(var(--color-bg-surface))' 
            }}>
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
                    style={{
                        ...inputStyle,
                        border: '1px solid hsl(var(--color-brand-primary))',
                        borderRadius: '4px',
                        margin: '2px',
                        padding: '0 8px',
                        backgroundColor: 'white',
                        color: 'hsl(var(--color-text-primary))'
                    }}
                />
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

const inputStyle: React.CSSProperties = {
    width: '100%', height: '100%', outline: 'none',
    fontFamily: 'inherit', fontSize: '13px', backgroundColor: 'transparent', color: 'inherit'
};
const cellStyle: React.CSSProperties = {
    width: '100%', height: '100%', padding: '0 8px',
    display: 'flex', alignItems: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'text'
};
const linkStyle: React.CSSProperties = { color: 'hsl(var(--color-brand-primary))', textDecoration: 'none', cursor: 'pointer' };
const placeholderStyle: React.CSSProperties = { color: 'hsl(var(--color-text-tertiary))', opacity: 0.5, display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', cursor: 'pointer' };
