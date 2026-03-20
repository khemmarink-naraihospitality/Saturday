
import React, { useRef, useState } from 'react';
import type { Item, Column } from '../../../types';
import { useBoardStore } from '../../../store/useBoardStore';
import { usePermission } from '../../../hooks/usePermission';
import { PersonPicker } from '../PersonPicker';

interface PeopleCellProps {
    item: Item;
    column: Column;
}

export const PeopleCell: React.FC<PeopleCellProps> = ({ item, column }) => {
    const value = item.values[column.id];
    const updateItemValue = useBoardStore(state => state.updateItemValue);
    const { activeBoardMembers } = useBoardStore();
    console.log('[PersonCell] Active Members:', activeBoardMembers);
    const { can } = usePermission();

    const [isEditing, setIsEditing] = useState(false);
    const [pickerPos, setPickerPos] = useState<{ top: number, bottom: number, left: number, width: number } | null>(null);
    const cellRef = useRef<HTMLDivElement>(null);

    const selectedIds = Array.isArray(value) ? value : (value ? [value] : []);

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

    return (
        <>
            <div
                ref={cellRef}
                className="table-cell"
                onClick={() => !isEditing && startEditing()}
                style={{
                    width: '100%',
                    height: '100%',
                    borderRight: '1px solid hsl(var(--color-cell-border))',
                    padding: '4px 8px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    cursor: 'pointer',
                    overflow: 'hidden',
                    justifyContent: 'center'
                }}
            >
                {selectedIds.length > 0 ? (
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                        {selectedIds.slice(0, 2).map((userId: string, idx: number) => {
                            const member = activeBoardMembers.find(m => m.user_id === userId);
                            const profileData = Array.isArray(member?.profiles) ? member.profiles[0] : member?.profiles;
                            const profile = profileData || {};
                            const name = profile.full_name || profile.email || 'Unknown';
                            const initial = name[0].toUpperCase();

                            return (
                                <div key={idx} style={{
                                    width: '26px',
                                    height: '26px',
                                    borderRadius: '50%',
                                    backgroundColor: profile?.avatar_url ? 'transparent' : '#0073ea',
                                    color: 'white',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    border: '2px solid white',
                                    marginLeft: idx > 0 ? '-10px' : '0',
                                    zIndex: idx + 1,
                                    overflow: 'hidden',
                                    position: 'relative',
                                    boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                                }} title={name}>
                                    {profile?.avatar_url ? (
                                        <img 
                                            src={profile.avatar_url} 
                                            alt="" 
                                            referrerPolicy="no-referrer"
                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                                        />
                                    ) : (
                                        initial
                                    )}
                                </div>
                            );
                        })}
                        {selectedIds.length > 2 && (
                            <div style={{
                                width: '26px',
                                height: '26px',
                                borderRadius: '50%',
                                backgroundColor: '#e5e7eb',
                                color: '#6b7280',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '11px',
                                fontWeight: 600,
                                border: '2px solid white',
                                marginLeft: '-10px',
                                zIndex: 10,
                                position: 'relative'
                            }}>
                                +{selectedIds.length - 2}
                            </div>
                        )}
                    </div>
                ) : (
                    <span style={{ color: 'hsl(var(--color-text-tertiary))', fontSize: '18px', opacity: 0.5 }}>+</span>
                )}
            </div>

            {isEditing && pickerPos && (
                <PersonPicker
                    currentValue={selectedIds}
                    position={pickerPos}
                    onSelect={(userId) => {
                        const newValues = selectedIds.includes(userId)
                            ? selectedIds.filter((id: string) => id !== userId)
                            : [...selectedIds, userId];
                        updateItemValue(item.id, column.id, newValues);
                    }}
                    onClose={() => {
                        setIsEditing(false);
                        setPickerPos(null);
                    }}
                    boardId={item.boardId || useBoardStore.getState().activeBoardId || ''}
                    itemId={item.id}
                    columnId={column.id}
                />
            )}
        </>
    );
};
