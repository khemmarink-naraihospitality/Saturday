import { useEffect, useState } from 'react';
import { useBoardStore } from '../../../store/useBoardStore';
import { BottomSheet, TextButton } from '../../ui';
import { LabelsEditor } from './LabelsEditor';
import type { EditorProps } from './types';
import { tintLabel } from '../../../lib/labelTint';
import { useNewUi } from '../../../lib/brand';
import { StatusPill } from '../../../components/common/StatusPill';

/**
 * A status — reference screenshot 21: every label as a full-width block in its
 * colour, the current one ringed; a tap sets it (the option id, as desktop
 * stores it) and closes. "Edit" switches to renaming / recolouring / adding
 * labels, as the desktop picker's "Edit Labels" does.
 */
export const StatusEditor = ({ open, onClose, item, column, value }: EditorProps) => {
    const updateItemValue = useBoardStore(state => state.updateItemValue);
    const [editing, setEditing] = useState(false);
    // NHG: each label as the pill it shows in the cell, on a plain row
    const newUi = useNewUi();
    const options = Array.isArray(column.options) ? column.options : [];
    const current = options.find(o => o.id === value || o.label === value);

    useEffect(() => {
        if (open) setEditing(false);
    }, [open]);

    const choose = (optionId: string | null) => {
        onClose();
        if ((current?.id ?? null) !== optionId) void updateItemValue(item.id, column.id, optionId);
    };

    return (
        <BottomSheet
            open={open}
            onClose={onClose}
            title={column.title}
            size="medium"
            headerRight={editing
                ? <TextButton onClick={() => setEditing(false)} style={{ fontWeight: 600 }}>Done</TextButton>
                : <TextButton onClick={() => setEditing(true)}>Edit</TextButton>}
            testId="m-cell-editor"
        >
            {editing ? (
                <LabelsEditor column={column} />
            ) : (
                <div className="m-choices" role="listbox" aria-label={column.title}>
                    {options.map(option => {
                        const selected = option.id === current?.id;
                        if (newUi) {
                            return (
                                <button
                                    key={option.id}
                                    type="button"
                                    role="option"
                                    aria-selected={selected}
                                    className={`m-choice m-choice--pill${selected ? ' m-choice--on' : ''}`}
                                    onClick={() => choose(option.id)}
                                >
                                    {option.label === 'Default' ? <span className="m-choice__blank">No label</span> : <StatusPill color={option.color} label={option.label} />}
                                </button>
                            );
                        }
                        return (
                            <button
                                key={option.id}
                                type="button"
                                role="option"
                                aria-selected={selected}
                                className={`m-choice${selected ? ' m-choice--on' : ''}`}
                                style={{ backgroundColor: tintLabel(option.color) }}
                                onClick={() => choose(option.id)}
                            >
                                {option.label === 'Default' ? '' : option.label}
                            </button>
                        );
                    })}
                    {options.length === 0 && <div className="m-empty">No labels yet — tap Edit to add some.</div>}
                    {current && (
                        <button type="button" className="m-choices__clear" onClick={() => choose(null)}>
                            Clear
                        </button>
                    )}
                </div>
            )}
        </BottomSheet>
    );
};
