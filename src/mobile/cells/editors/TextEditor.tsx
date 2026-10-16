import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ExternalLink, Star } from 'lucide-react';
import { useBoardStore } from '../../../store/useBoardStore';
import { buildLinkValue, linkHref, parseLinkValue } from '../../../lib/utils';
import { BottomSheet, PrimaryButton, TextButton } from '../../ui';
import type { EditorProps } from './types';

// The desktop TextCell's rule for a number column: digits, one point, an optional %.
const NUMBER_INPUT = /^[0-9]*\.?[0-9]*%?$/;

const SaveButton = ({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) => (
    <PrimaryButton onClick={onClick} disabled={disabled} style={{ minHeight: 38, padding: '0 20px', fontSize: 16 }}>Save</PrimaryButton>
);

/**
 * Text, long text and number: one field and Save (Enter saves a one-line
 * value; long text keeps its line breaks). Written only when it changed, as
 * the desktop TextCell does.
 */
export const TextEditor = ({ open, onClose, item, column, value }: EditorProps) => {
    const updateItemValue = useBoardStore(state => state.updateItemValue);
    const initial = value === null || value === undefined || typeof value === 'object' ? '' : String(value);
    const [text, setText] = useState(initial);
    const areaRef = useRef<HTMLTextAreaElement>(null);
    const multiline = column.type === 'long_text';
    const isNumber = column.type === 'number';

    useEffect(() => {
        if (open) setText(initial);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    useLayoutEffect(() => {
        const el = areaRef.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight, 320)}px`;
    }, [text, open]);

    const save = () => {
        onClose();
        if (text !== initial) void updateItemValue(item.id, column.id, text);
    };

    return (
        <BottomSheet open={open} onClose={onClose} title={column.title} headerRight={<SaveButton onClick={save} />} testId="m-cell-editor">
            <div className="m-editor-pad">
                {multiline ? (
                    <textarea
                        ref={areaRef}
                        className="m-editor-input m-editor-input--area"
                        autoFocus
                        rows={3}
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        placeholder="Write something"
                        aria-label={column.title}
                    />
                ) : (
                    <input
                        className="m-editor-input"
                        autoFocus
                        type="text"
                        inputMode={isNumber ? 'decimal' : 'text'}
                        enterKeyHint="done"
                        value={text}
                        onChange={(e) => {
                            const next = e.target.value;
                            if (!isNumber || NUMBER_INPUT.test(next)) setText(next);
                        }}
                        onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
                        placeholder={isNumber ? '0' : 'Type here'}
                        aria-label={column.title}
                    />
                )}
                {text && (
                    <TextButton onClick={() => setText('')} style={{ marginTop: 10 }}>Clear</TextButton>
                )}
            </div>
        </BottomSheet>
    );
};

/** A link: the address and, optionally, the words it shows as — stored as the desktop LinkCell does. */
export const LinkEditor = ({ open, onClose, item, column, value }: EditorProps) => {
    const updateItemValue = useBoardStore(state => state.updateItemValue);
    const current = parseLinkValue(value);
    const [url, setUrl] = useState(current.url);
    const [label, setLabel] = useState(current.label);

    useEffect(() => {
        if (!open) return;
        setUrl(current.url);
        setLabel(current.label);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const save = () => {
        onClose();
        const next = buildLinkValue(url, label);
        if (JSON.stringify(next) !== JSON.stringify(buildLinkValue(current.url, current.label))) {
            void updateItemValue(item.id, column.id, next);
        }
    };

    return (
        <BottomSheet open={open} onClose={onClose} title={column.title} headerRight={<SaveButton onClick={save} />} testId="m-cell-editor">
            <div className="m-editor-pad" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <label className="m-editor-field">
                    <span>Web address</span>
                    <input autoFocus type="url" inputMode="url" enterKeyHint="next" placeholder="www.example.com" value={url} onChange={(e) => setUrl(e.target.value)} />
                </label>
                <label className="m-editor-field">
                    <span>Text to show (optional)</span>
                    <input type="text" enterKeyHint="done" placeholder="Shown instead of the address" value={label} onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') save(); }} />
                </label>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    {current.url ? (
                        <a className="m-text-btn" href={linkHref(current.url)} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <ExternalLink size={16} /> Open link
                        </a>
                    ) : <span />}
                    {current.url && (
                        <TextButton
                            onClick={() => {
                                onClose();
                                void updateItemValue(item.id, column.id, null);
                            }}
                            style={{ color: 'hsl(var(--color-danger))' }}
                        >
                            Remove link
                        </TextButton>
                    )}
                </div>
            </div>
        </BottomSheet>
    );
};

/** Priority: five big stars; the star that already holds the rating clears it (the desktop rule). */
export const PriorityEditor = ({ open, onClose, item, column, value }: EditorProps) => {
    const updateItemValue = useBoardStore(state => state.updateItemValue);
    const n = typeof value === 'number' ? value : parseFloat(String(value));
    const rating = Number.isFinite(n) ? Math.min(5, Math.max(0, Math.round(n))) : 0;

    const apply = (star: number) => {
        onClose();
        void updateItemValue(item.id, column.id, star === rating ? null : star);
    };

    return (
        <BottomSheet open={open} onClose={onClose} title={column.title} testId="m-cell-editor">
            <div className="m-editor-pad">
                <div className="m-stars" role="radiogroup" aria-label={column.title}>
                    {[1, 2, 3, 4, 5].map(star => (
                        <button key={star} type="button" role="radio" aria-checked={rating === star} aria-label={`${star} of 5`} onClick={() => apply(star)}>
                            <Star size={40} strokeWidth={1.6} color={star <= rating ? '#fdab3d' : 'hsl(var(--m-chip-strong))'} fill={star <= rating ? '#fdab3d' : 'none'} />
                        </button>
                    ))}
                </div>
                <div className="m-stars__caption">{rating ? `${rating} of 5 · tap the same star to clear` : 'Not prioritised yet'}</div>
            </div>
        </BottomSheet>
    );
};
