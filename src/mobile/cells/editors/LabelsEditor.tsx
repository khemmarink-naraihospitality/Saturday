import { useEffect, useRef, useState } from 'react';
import { Check, Plus, Trash2 } from 'lucide-react';
import { useBoardStore } from '../../../store/useBoardStore';
import { LABEL_COLORS, nextLabelColor, nextUniqueLabel } from '../../../lib/labelColors';
import type { Column } from '../../../types';

/**
 * A column's labels, editable: rename, recolour from the shared palette
 * (LABEL_COLORS), add, delete — the desktop pickers' "Edit Labels", through the
 * same store actions. A name is written when the field is left, not on every
 * keystroke; a delete asks once more, since a thumb slips.
 */
export const LabelsEditor = ({ column }: { column: Column }) => {
    const addColumnOption = useBoardStore(state => state.addColumnOption);
    const updateColumnOption = useBoardStore(state => state.updateColumnOption);
    const deleteColumnOption = useBoardStore(state => state.deleteColumnOption);
    const options = Array.isArray(column.options) ? column.options : [];

    const [paletteFor, setPaletteFor] = useState<string | null>(null);
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
    const [drafts, setDrafts] = useState<Record<string, string>>({});
    const focusNew = useRef(false);
    const inputs = useRef(new Map<string, HTMLInputElement>());

    // A label added here gets its name typed straight away.
    useEffect(() => {
        if (!focusNew.current) return;
        const added = options[options.length - 1];
        const input = added && inputs.current.get(added.id);
        if (!input) return;
        focusNew.current = false;
        input.scrollIntoView({ block: 'nearest' });
        input.focus();
        input.select();
    }, [options]);

    const commitName = (optionId: string, current: string) => {
        const draft = drafts[optionId];
        if (draft === undefined) return;
        setDrafts(prev => {
            const next = { ...prev };
            delete next[optionId];
            return next;
        });
        const name = draft.trim();
        if (name && name !== current) updateColumnOption(column.id, optionId, { label: name });
    };

    const add = () => {
        focusNew.current = true;
        // Status starts grey and Dropdown cycles colours, as on desktop.
        const color = column.type === 'status' ? '#c4c4c4' : nextLabelColor(options.length);
        addColumnOption(column.id, nextUniqueLabel(options.map(o => o.label)), color);
    };

    return (
        <div className="m-labels">
            {options.map(option => (
                <div key={option.id} className="m-labels__item">
                    <div className="m-labels__row">
                        <button
                            type="button"
                            className="m-labels__swatch"
                            style={{ backgroundColor: option.color }}
                            onClick={() => setPaletteFor(prev => (prev === option.id ? null : option.id))}
                            aria-label={`Colour of ${option.label || 'label'}`}
                            aria-expanded={paletteFor === option.id}
                        />
                        <input
                            ref={el => {
                                if (el) inputs.current.set(option.id, el);
                                else inputs.current.delete(option.id);
                            }}
                            className="m-labels__input"
                            value={drafts[option.id] ?? option.label}
                            enterKeyHint="done"
                            maxLength={120}
                            onChange={(e) => setDrafts(prev => ({ ...prev, [option.id]: e.target.value }))}
                            onBlur={() => commitName(option.id, option.label)}
                            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                            aria-label="Label name"
                        />
                        {confirmDelete === option.id ? (
                            <button type="button" className="m-labels__delete m-labels__delete--confirm" onClick={() => { setConfirmDelete(null); deleteColumnOption(column.id, option.id); }}>
                                Delete
                            </button>
                        ) : (
                            <button type="button" className="m-labels__delete" onClick={() => setConfirmDelete(option.id)} aria-label={`Delete ${option.label || 'label'}`}>
                                <Trash2 size={19} />
                            </button>
                        )}
                    </div>
                    {paletteFor === option.id && (
                        <div className="m-palette" role="listbox" aria-label="Colours">
                            {LABEL_COLORS.map(color => (
                                <button
                                    key={color}
                                    type="button"
                                    role="option"
                                    aria-selected={option.color === color}
                                    aria-label={color}
                                    className="m-palette__swatch"
                                    style={{ backgroundColor: color }}
                                    onClick={() => {
                                        updateColumnOption(column.id, option.id, { color });
                                        setPaletteFor(null);
                                    }}
                                >
                                    {option.color.toLowerCase() === color.toLowerCase() && <Check size={14} strokeWidth={3} color="#fff" />}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            ))}
            <button type="button" className="m-labels__add" onClick={add}>
                <Plus size={19} /> New label
            </button>
        </div>
    );
};
