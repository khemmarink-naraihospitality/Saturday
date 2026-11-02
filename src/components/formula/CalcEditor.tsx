import { useMemo, useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, CircleAlert, Lightbulb, Search } from 'lucide-react';
import type { Column } from '../../types';
import { FUNCTION_LIST, nameRefName, refName } from '../../lib/formula';
import { calcExamples } from '../../lib/formula/catalog';
import { FormulaInput, type FormulaInputHandle, type SuggestResult, type Suggestion } from './FormulaInput';
import { TypeIcon } from './parts';

/** Each column as it can be put into a formula; a Timeline three times (start, end, length). */
export interface RefEntry { key: string; label: string; insert: string; type: Column['type'] | 'name'; detail?: string }

export const refEntries = (columns: Column[]): RefEntry[] => {
    const out: RefEntry[] = [{ key: 'name', label: nameRefName(columns), insert: `{${nameRefName(columns)}}`, type: 'name', detail: 'Name' }];
    columns.forEach(c => {
        const name = refName(c, columns);
        if (c.type === 'timeline') {
            out.push({ key: `${c.id}:end`, label: `${name}#End`, insert: `{${name}#End}`, type: c.type, detail: 'End date' });
            out.push({ key: `${c.id}:start`, label: `${name}#Start`, insert: `{${name}#Start}`, type: c.type, detail: 'Start date' });
            out.push({ key: `${c.id}:days`, label: `${name}#Days`, insert: `{${name}#Days}`, type: c.type, detail: 'Number of days' });
        } else {
            out.push({ key: c.id, label: name, insert: `{${name}}`, type: c.type, detail: TYPE_WORD[c.type] });
        }
    });
    return out;
};

const TYPE_WORD: Partial<Record<Column['type'], string>> = {
    text: 'Text', long_text: 'Text', status: 'Status', dropdown: 'Dropdown', date: 'Date', due_date: 'Due date',
    number: 'Number', people: 'Person', checkbox: 'Checkbox', link: 'Link', files: 'Files', priority: 'Priority', formula: 'Formula',
};

/** Even number of double quotes before a point: not inside a text. */
const outsideText = (s: string) => (s.match(/["“”]/g) || []).length % 2 === 0;

export const makeSuggest = (entries: RefEntry[]) => (before: string): SuggestResult | null => {
    const open = before.lastIndexOf('{');
    if (open > before.lastIndexOf('}') && outsideText(before.slice(0, open))) {
        const q = before.slice(open + 1).trim().toLowerCase();
        const items: Suggestion[] = entries
            .filter(e => e.label.toLowerCase().includes(q))
            .sort((a, b) => Number(!a.label.toLowerCase().startsWith(q)) - Number(!b.label.toLowerCase().startsWith(q)))
            .slice(0, 7)
            .map(e => ({ key: e.key, label: e.label, detail: e.detail, icon: <TypeIcon type={e.type} />, insert: e.insert }));
        return { from: open, items };
    }
    const word = /(^|[^A-Za-z0-9_.{}#])([A-Za-z_][A-Za-z0-9_]*)$/.exec(before);
    if (word && outsideText(before)) {
        const q = word[2].toUpperCase();
        const items: Suggestion[] = FUNCTION_LIST
            .filter(f => f.name.startsWith(q) && f.name !== q)
            .slice(0, 6)
            .map(f => ({ key: f.name, label: f.name, detail: f.signature.replace(/^[A-Z_]+/, ''), insert: `${f.name}()`, caret: f.name.length + 1 }));
        return { from: before.length - word[2].length, items };
    }
    return null;
};

const OPERATORS: { label: string; insert: string; caret?: number; title: string }[] = [
    { label: '+', insert: ' + ', title: 'Add' },
    { label: '−', insert: ' - ', title: 'Subtract' },
    { label: '×', insert: ' * ', title: 'Multiply' },
    { label: '÷', insert: ' / ', title: 'Divide' },
    { label: '( )', insert: '()', caret: 1, title: 'Brackets' },
    { label: '&', insert: ' & ', title: 'Join texts' },
    { label: '=', insert: ' = ', title: 'Is equal to' },
    { label: '>', insert: ' > ', title: 'Greater than' },
    { label: '<', insert: ' < ', title: 'Less than' },
    { label: '"text"', insert: '""', caret: 1, title: 'A piece of text' },
    { label: 'TODAY()', insert: 'TODAY()', title: 'Today\'s date' },
];

const CATEGORIES = ['Numbers', 'Logic', 'Dates', 'Text'] as const;

/**
 * Calculate: the formula box, the operator buttons, the board's columns and
 * the functions to click into it, and example formulas built from this
 * board's own columns.
 */
export const CalcEditor = ({ text, onText, problem, columns, selfId, onSubmit, children }: {
    text: string;
    onText: (text: string) => void;
    problem: { message: string; at?: number; end?: number } | null;
    columns: Column[];
    selfId: string;
    onSubmit: () => void;
    /** How the results show (format, colours), right under the box. */
    children?: ReactNode;
}) => {
    const input = useRef<FormulaInputHandle>(null);
    const readable = useMemo(() => columns.filter(c => c.id !== selfId), [columns, selfId]);
    const entries = useMemo(() => refEntries(readable), [readable]);
    const suggest = useMemo(() => makeSuggest(entries), [entries]);
    const examples = useMemo(() => calcExamples(columns, selfId), [columns, selfId]);
    const [side, setSide] = useState<'columns' | 'functions'>('columns');
    const [query, setQuery] = useState('');
    const [openFn, setOpenFn] = useState<string | null>(null);

    const q = query.trim().toLowerCase();
    const shownEntries = entries.filter(e => !q || e.label.toLowerCase().includes(q));
    const shownFunctions = FUNCTION_LIST.filter(f => !q || f.name.toLowerCase().includes(q) || f.description.toLowerCase().includes(q));
    const showProblem = problem && text.trim() !== '';
    const errorSpan = problem && problem.at !== undefined && problem.end !== undefined ? { at: problem.at, end: problem.end } : null;

    return (
        <div className="fx-calc">
            <div className="fx-calc__main">
                <FormulaInput
                    ref={input}
                    value={text}
                    onChange={onText}
                    error={showProblem ? errorSpan : null}
                    placeholder={'Type { to pick a column — e.g. {Price} * {Quantity}'}
                    ariaLabel="Formula"
                    onSubmit={onSubmit}
                    suggest={suggest}
                />
                <div className="fx-ops" role="toolbar" aria-label="Insert">
                    {OPERATORS.map(op => (
                        <button key={op.label} type="button" className="fx-op" title={op.title} onClick={() => input.current?.insert(op.insert, op.caret)}>
                            {op.label}
                        </button>
                    ))}
                </div>
                <div className={`fx-status${showProblem ? ' fx-status--bad' : text.trim() ? ' fx-status--ok' : ''}`} role="status">
                    {showProblem ? <CircleAlert size={15} /> : text.trim() ? <CheckCircle2 size={15} /> : <Lightbulb size={15} />}
                    <span>{showProblem ? problem!.message : text.trim() ? 'The formula reads fine — see the results below' : 'Pick columns on the right, or start from an example'}</span>
                </div>
                {children}
                <div className="fx-examples">
                    <span className="fx-eyebrow">Examples</span>
                    <div className="fx-examples__list">
                        {examples.map(ex => (
                            <button key={ex.label} type="button" className="fx-example" onClick={() => onText(ex.expr)} title={ex.expr}>
                                <span className="fx-example__label">{ex.label}</span>
                                <code className="fx-example__code">{ex.expr}</code>
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <aside className="fx-calc__side" aria-label="Columns and functions">
                <div className="fx-tabs" role="tablist">
                    <button type="button" role="tab" aria-selected={side === 'columns'} className={`fx-tab${side === 'columns' ? ' is-on' : ''}`} onClick={() => setSide('columns')}>Columns</button>
                    <button type="button" role="tab" aria-selected={side === 'functions'} className={`fx-tab${side === 'functions' ? ' is-on' : ''}`} onClick={() => setSide('functions')}>Functions</button>
                </div>
                <label className="fx-search">
                    <Search size={14} />
                    <input value={query} onChange={e => setQuery(e.target.value)} placeholder={side === 'columns' ? 'Find a column' : 'Find a function'} aria-label="Search" />
                </label>
                <div className="fx-side-list">
                    {side === 'columns' ? (
                        shownEntries.length ? shownEntries.map(e => (
                            <button key={e.key} type="button" className="fx-ref" onClick={() => input.current?.insert(e.insert)} title={`Insert ${e.insert}`}>
                                <span className="fx-ref__icon"><TypeIcon type={e.type} /></span>
                                <span className="fx-ref__label">{e.label}</span>
                                <span className="fx-ref__type">{e.detail}</span>
                            </button>
                        )) : <div className="fx-empty">No column matches</div>
                    ) : (
                        CATEGORIES.map(cat => {
                            const list = shownFunctions.filter(f => f.category === cat);
                            if (!list.length) return null;
                            return (
                                <div key={cat} className="fx-fn-group">
                                    <div className="fx-eyebrow">{cat}</div>
                                    {list.map(f => (
                                        <div key={f.name} className={`fx-fn${openFn === f.name ? ' is-open' : ''}`}>
                                            <button
                                                type="button"
                                                className="fx-fn__head"
                                                onClick={() => input.current?.insertFunction(f.name)}
                                                onMouseEnter={() => setOpenFn(f.name)}
                                                onFocus={() => setOpenFn(f.name)}
                                                title={`Insert ${f.name}( )`}
                                            >
                                                <span className="fx-fn__name">{f.name}</span>
                                                <span className="fx-fn__desc">{f.description}</span>
                                            </button>
                                            {openFn === f.name && (
                                                <div className="fx-fn__more">
                                                    <code>{f.signature}</code>
                                                    <span>e.g. <code>{f.example}</code></span>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            );
                        })
                    )}
                </div>
            </aside>
        </div>
    );
};
