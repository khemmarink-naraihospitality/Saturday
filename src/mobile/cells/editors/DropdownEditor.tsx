import { useEffect, useMemo, useState } from 'react';
import { Check, Plus, Search } from 'lucide-react';
import { useBoardStore } from '../../../store/useBoardStore';
import { nextLabelColor } from '../../../lib/labelColors';
import { BottomSheet, TextButton } from '../../ui';
import type { EditorProps } from './types';

/**
 * Dropdown labels: any number of them, ticked on and off in place (stored as
 * the label strings, as on desktop). Typing a name that isn't a label yet
 * offers to create it — and ticks it, which is why you typed it.
 */
export const DropdownEditor = ({ open, onClose, item, column, value }: EditorProps) => {
    const updateItemValue = useBoardStore(state => state.updateItemValue);
    const addColumnOption = useBoardStore(state => state.addColumnOption);
    const [query, setQuery] = useState('');
    const options = useMemo(() => (Array.isArray(column.options) ? column.options : []), [column.options]);
    const selected: string[] = (Array.isArray(value) ? value : value ? [value] : []).map(String);

    useEffect(() => {
        if (open) setQuery('');
    }, [open]);

    const q = query.trim();
    const shown = options.filter(o => o.label.toLowerCase().includes(q.toLowerCase()));
    // Ticked labels the column no longer has (renamed or deleted elsewhere) stay
    // listed, so they can still be unticked.
    const orphans = selected.filter(l => !options.some(o => o.label === l) && l.toLowerCase().includes(q.toLowerCase()));
    const exact = options.some(o => o.label.toLowerCase() === q.toLowerCase());

    const toggle = (label: string) => {
        const next = selected.includes(label) ? selected.filter(l => l !== label) : [...selected, label];
        void updateItemValue(item.id, column.id, next);
    };

    const create = () => {
        if (!q || exact) return;
        addColumnOption(column.id, q, nextLabelColor(options.length));
        void updateItemValue(item.id, column.id, [...selected, q]);
        setQuery('');
    };

    return (
        <BottomSheet
            open={open}
            onClose={onClose}
            title={column.title}
            size={options.length > 6 ? 'tall' : 'auto'}
            headerRight={<TextButton onClick={onClose} style={{ fontWeight: 600 }}>Done</TextButton>}
            testId="m-cell-editor"
        >
            <div className="m-editor-pad">
                <label className="m-editor-search">
                    <Search size={18} />
                    <input
                        type="search"
                        enterKeyHint="done"
                        placeholder="Search or add a label"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') create(); }}
                        aria-label="Search or add a label"
                    />
                </label>
                <div className="m-check-list" role="listbox" aria-multiselectable="true" aria-label={column.title}>
                    {shown.map(option => {
                        const on = selected.includes(option.label);
                        return (
                            <button key={option.id} type="button" role="option" aria-selected={on} className="m-check-row" onClick={() => toggle(option.label)}>
                                <span className="m-check-row__chip" style={{ backgroundColor: option.color }}>{option.label}</span>
                                <span className={`m-check-row__box${on ? ' m-check-row__box--on' : ''}`}>{on && <Check size={16} strokeWidth={3} />}</span>
                            </button>
                        );
                    })}
                    {orphans.map(label => (
                        <button key={`orphan-${label}`} type="button" role="option" aria-selected className="m-check-row" onClick={() => toggle(label)}>
                            <span className="m-check-row__chip" style={{ backgroundColor: '#a0a4b8' }}>{label}</span>
                            <span className="m-check-row__box m-check-row__box--on"><Check size={16} strokeWidth={3} /></span>
                        </button>
                    ))}
                    {q && !exact && (
                        <button type="button" className="m-check-row m-check-row--create" onClick={create}>
                            <Plus size={19} /> Create “{q}”
                        </button>
                    )}
                    {!q && options.length === 0 && <div className="m-empty">No labels yet — type one above to create it.</div>}
                </div>
            </div>
        </BottomSheet>
    );
};
