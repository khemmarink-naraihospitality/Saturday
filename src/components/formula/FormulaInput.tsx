import { forwardRef, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { highlightFormula } from './highlight';

export interface Suggestion {
    key: string;
    label: string;
    detail?: string;
    icon?: ReactNode;
    /** Replaces what was typed from `from` up to the caret. */
    insert: string;
    /** Where the caret goes inside `insert` (default: its end). */
    caret?: number;
}

export interface SuggestResult { from: number; items: Suggestion[] }

export interface FormulaInputHandle {
    /** Puts text at the caret (replacing a selection); the caret ends `caret` characters into it. */
    insert: (text: string, caret?: number) => void;
    /** NAME() at the caret, or NAME(selection) around what is selected. */
    insertFunction: (name: string) => void;
    focus: () => void;
}

/**
 * The formula box: a text area with a coloured copy of its text drawn exactly
 * behind it — columns as tinted chips, functions, texts and numbers each in
 * their colour, the part a syntax error points at underlined — and a list of
 * matching columns after "{" and of functions as a name is typed.
 */
export const FormulaInput = forwardRef<FormulaInputHandle, {
    value: string;
    onChange: (value: string) => void;
    error?: { at: number; end: number } | null;
    placeholder?: string;
    compact?: boolean;
    ariaLabel: string;
    onSubmit?: () => void;
    suggest?: (textBeforeCaret: string) => SuggestResult | null;
}>(({ value, onChange, error, placeholder, compact, ariaLabel, onSubmit, suggest }, ref) => {
    const area = useRef<HTMLTextAreaElement>(null);
    const behind = useRef<HTMLPreElement>(null);
    const pending = useRef<[number, number] | null>(null);
    const [caret, setCaret] = useState<number | null>(null);
    const [focused, setFocused] = useState(false);
    const [active, setActive] = useState(0);
    // Escape hides the list until the caret moves somewhere else.
    const [dismissedAt, setDismissedAt] = useState<number | null>(null);

    const replace = (from: number, to: number, text: string, caretInText = text.length) => {
        pending.current = [from + caretInText, from + caretInText];
        onChange(value.slice(0, from) + text + value.slice(to));
    };

    useImperativeHandle(ref, () => ({
        insert: (text, caretInText) => {
            const el = area.current;
            const from = el && document.activeElement === el ? el.selectionStart : (caret ?? value.length);
            const to = el && document.activeElement === el ? el.selectionEnd : from;
            replace(from, to, text, caretInText);
        },
        insertFunction: (name) => {
            const el = area.current;
            const from = el ? el.selectionStart : value.length;
            const to = el ? el.selectionEnd : value.length;
            const selected = value.slice(from, to);
            if (selected) replace(from, to, `${name}(${selected})`, name.length + selected.length + 2);
            else replace(from, to, `${name}()`, name.length + 1);
        },
        focus: () => area.current?.focus(),
    }));

    useLayoutEffect(() => {
        const el = area.current;
        if (!el) return;
        // Grow with the text, up to the box's max height (then it scrolls).
        el.style.height = 'auto';
        el.style.height = `${el.scrollHeight}px`;
        if (pending.current) {
            const [a, b] = pending.current;
            pending.current = null;
            el.focus();
            el.setSelectionRange(a, b);
            setCaret(a);
        }
    }, [value]);

    const syncScroll = () => {
        if (behind.current && area.current) {
            behind.current.scrollTop = area.current.scrollTop;
            behind.current.scrollLeft = area.current.scrollLeft;
        }
    };

    const trackCaret = () => {
        const el = area.current;
        if (!el) return;
        const at = el.selectionStart === el.selectionEnd ? el.selectionStart : null;
        setCaret(at);
        if (at !== dismissedAt) setDismissedAt(null);
    };

    const segments = useMemo(() => highlightFormula(value, error), [value, error]);
    const suggestions = useMemo(() => {
        if (!suggest || !focused || caret === null || dismissedAt === caret) return null;
        const result = suggest(value.slice(0, caret));
        return result && result.items.length > 0 ? result : null;
    }, [suggest, focused, caret, value, dismissedAt]);
    const activeIndex = suggestions ? Math.min(active, suggestions.items.length - 1) : 0;

    const accept = (item: Suggestion) => {
        if (!suggestions || caret === null) return;
        replace(suggestions.from, caret, item.insert, item.caret);
        setActive(0);
    };

    return (
        <div className={`fx-code${compact ? ' fx-code--compact' : ''}${error ? ' fx-code--error' : ''}`}>
            <pre ref={behind} className="fx-code__behind" aria-hidden="true">
                {segments.map((s, i) => (
                    <span key={i} className={`fx-tok fx-tok--${s.kind}${s.bad ? ' fx-tok--bad' : ''}`}>{s.text}</span>
                ))}
                {'\n'}
            </pre>
            <textarea
                ref={area}
                className="fx-code__input"
                value={value}
                rows={1}
                spellCheck={false}
                autoCapitalize="off"
                autoComplete="off"
                autoCorrect="off"
                placeholder={placeholder}
                aria-label={ariaLabel}
                aria-autocomplete={suggest ? 'list' : undefined}
                aria-expanded={suggest ? !!suggestions : undefined}
                onChange={e => { onChange(e.target.value); setCaret(e.target.selectionStart); setActive(0); }}
                onSelect={trackCaret}
                onKeyUp={trackCaret}
                onClick={trackCaret}
                onScroll={syncScroll}
                onFocus={() => { setFocused(true); trackCaret(); }}
                onBlur={() => setFocused(false)}
                onKeyDown={e => {
                    if (suggestions) {
                        if (e.key === 'ArrowDown') { e.preventDefault(); setActive((activeIndex + 1) % suggestions.items.length); return; }
                        if (e.key === 'ArrowUp') { e.preventDefault(); setActive((activeIndex - 1 + suggestions.items.length) % suggestions.items.length); return; }
                        if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); accept(suggestions.items[activeIndex]); return; }
                        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setDismissedAt(caret); return; }
                    }
                    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); onSubmit?.(); return; }
                    // One line for the compact box: Enter doesn't add a line.
                    if (compact && e.key === 'Enter') e.preventDefault();
                }}
            />
            {suggestions && (
                <div className="fx-suggest" role="listbox" onMouseDown={e => e.preventDefault()}>
                    {suggestions.items.map((item, i) => (
                        <button
                            key={item.key}
                            type="button"
                            role="option"
                            aria-selected={i === activeIndex}
                            className={`fx-suggest__item${i === activeIndex ? ' is-active' : ''}`}
                            onMouseEnter={() => setActive(i)}
                            onClick={() => accept(item)}
                        >
                            {item.icon && <span className="fx-suggest__icon">{item.icon}</span>}
                            <span className="fx-suggest__label">{item.label}</span>
                            {item.detail && <span className="fx-suggest__detail">{item.detail}</span>}
                        </button>
                    ))}
                    <div className="fx-suggest__hint">↑↓ to choose · Enter to insert · Esc to close</div>
                </div>
            )}
        </div>
    );
});
FormulaInput.displayName = 'FormulaInput';
