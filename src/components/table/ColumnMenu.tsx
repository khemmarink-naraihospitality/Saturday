import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
    Filter,
    ArrowUpDown,
    Copy,
    ArrowRightFromLine,
    PenLine,
    Trash2,
    Check,
    Hash,
    BellRing
} from 'lucide-react';
import type { ColumnType } from '../../types';

interface ColumnMenuProps {
    isOpen: boolean;
    onClose: () => void;
    position: { top: number; left: number };
    columnType: ColumnType;
    currentSort?: 'asc' | 'desc' | null;
    onSort: (direction: 'asc' | 'desc' | null) => void;
    onFilter?: () => void;
    onDuplicate: () => void;
    onAddRight: () => void;
    onRename: () => void;
    onDelete: () => void;
    onNumberFormat?: () => void;
    onNotificationSettings?: () => void;
}

import { usePermission } from '../../hooks/usePermission';

export const ColumnMenu = ({
    isOpen,
    onClose,
    position,
    columnType,
    currentSort,
    onSort,
    onFilter,
    onDuplicate,
    onAddRight,
    onRename,
    onDelete,
    onNumberFormat,
    onNotificationSettings
}: ColumnMenuProps) => {
    const menuRef = useRef<HTMLDivElement>(null);
    const { can } = usePermission();

    // Filter/Sort enabled for: Status, Date, Due Date, Dropdown, Checkbox
    const isSortFilterEnabled = ['status', 'date', 'due_date', 'dropdown', 'checkbox'].includes(columnType);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                onClose();
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return createPortal(
        <div
            ref={menuRef}
            style={{
                position: 'fixed',
                top: position.top,
                left: (() => {
                    const menuWidth = 240;
                    if (position.left + menuWidth > window.innerWidth) {
                        return window.innerWidth - menuWidth - 16;
                    }
                    return position.left;
                })(),
                backgroundColor: 'hsl(var(--color-bg-surface))',
                borderRadius: '8px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                border: '1px solid hsl(var(--color-border))',
                zIndex: 9999,
                width: '240px',
                padding: '8px 0',
                fontSize: '14px',
                color: 'hsl(var(--color-text-primary))'
            }}
        >
            <div className="menu-group">
                <MenuItem
                    icon={<Filter size={16} />}
                    label="Filter"
                    onClick={() => {
                        if (onFilter) onFilter();
                        onClose();
                    }}
                    disabled={!isSortFilterEnabled}
                />

                <MenuItem
                    icon={<ArrowUpDown size={16} />}
                    label={currentSort === 'asc' ? "Sort Descending" : "Sort Ascending"}
                    onClick={() => {
                        // Toggle: null -> asc -> desc -> null
                        // Actually better UX: Asc -> Desc -> Asc (clicking again toggles)
                        // Or if unsorted, Asc.
                        const newDir = currentSort === 'asc' ? 'desc' : 'asc';
                        onSort(newDir);
                        onClose();
                    }}
                    disabled={!isSortFilterEnabled}
                    active={!!currentSort}
                />
                {currentSort && (
                    <MenuItem
                        icon={<Trash2 size={14} />}
                        label="Clear Sort"
                        onClick={() => {
                            onSort(null);
                            onClose();
                        }}
                    />
                )}
            </div>

            {columnType === 'due_date' && onNotificationSettings && (
                <>
                    <div className="menu-divider" style={{
                        height: '1px',
                        backgroundColor: '#e1e4e8',
                        margin: '8px 0'
                    }} />
                    <div className="menu-group">
                        <MenuItem
                            icon={<BellRing size={16} />}
                            label="Notification Settings"
                            onClick={() => { onNotificationSettings(); onClose(); }}
                        />
                    </div>
                </>
            )}

            {can('manage_columns') && (
                <>
                    <div className="menu-divider" style={{
                        height: '1px',
                        backgroundColor: '#e1e4e8',
                        margin: '8px 0'
                    }} />

                    <div className="menu-group">
                        {columnType === 'number' && onNumberFormat && (
                            <MenuItem
                                icon={<Hash size={16} />}
                                label="Number Format"
                                onClick={() => { onNumberFormat(); onClose(); }}
                            />
                        )}
                        <MenuItem
                            icon={<Copy size={16} />}
                            label="Duplicate column"
                            onClick={() => { onDuplicate(); onClose(); }}
                        />
                        <MenuItem
                            icon={<ArrowRightFromLine size={16} />}
                            label="Add column to right"
                            onClick={() => { onAddRight(); onClose(); }}
                        />
                    </div>

                    <div className="menu-divider" style={{
                        height: '1px',
                        backgroundColor: '#e1e4e8',
                        margin: '8px 0'
                    }} />

                    <div className="menu-group">
                        <MenuItem
                            icon={<PenLine size={16} />}
                            label="Rename"
                            onClick={() => { onRename(); onClose(); }}
                        />
                        <MenuItem
                            icon={<Trash2 size={16} />}
                            label="Delete"
                            onClick={() => { onDelete(); onClose(); }}
                            danger
                        />
                    </div>
                </>
            )}
        </div>,
        document.body
    );
};

interface MenuItemProps {
    icon: React.ReactNode;
    label: string;
    onClick?: () => void;
    disabled?: boolean;
    danger?: boolean;
    active?: boolean;
}

const MenuItem = ({ icon, label, onClick, disabled, danger, active }: MenuItemProps) => {
    const [isHovered, setIsHovered] = React.useState(false);

    return (
        <div
            onClick={!disabled ? onClick : undefined}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            style={{
                display: 'flex',
                alignItems: 'center',
                padding: '8px 16px',
                cursor: disabled ? 'not-allowed' : 'pointer',
                backgroundColor: (!disabled && isHovered) ? 'hsl(var(--color-bg-surface-hover))' : (active ? 'hsl(var(--color-brand-light))' : 'transparent'),
                color: disabled ? 'hsl(var(--color-text-tertiary))' : (danger ? 'hsl(var(--color-status-red-bg))' : 'hsl(var(--color-text-primary))'),
                transition: 'background-color 0.1s'
            }}
        >
            <div style={{ marginRight: '12px', display: 'flex', alignItems: 'center' }}>
                {icon}
            </div>
            <span style={{ fontWeight: active ? 500 : 400 }}>{label}</span>
            {active && <Check size={14} style={{ marginLeft: 'auto', color: '#0073ea' }} />}
        </div>
    );
};
