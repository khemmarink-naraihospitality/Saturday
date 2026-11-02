import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Calculator, CircleAlert, GitBranch, Sigma, X, CalendarDays } from 'lucide-react';
import type { Column, FormulaConfig, FormulaOutcome, FormulaRule } from '../../types';
import { useBoardStore } from '../../store/useBoardStore';
import { useToday } from '../../hooks/useToday';
import { useNewUi } from '../../lib/brand';
import { useTerms } from '../../lib/terms';
import { siblingColumns } from '../../lib/columnScope';
import { CURRENCY_OPTIONS } from '../../utils/format';
import {
    checkExpression, checkRules, formatDay, formulaCell, formulaContext, formulaRows, fromEditable, toEditable,
    type FormulaDisplay,
} from '../../lib/formula';
import { CalcEditor } from './CalcEditor';
import { RulesEditor, type Person } from './RulesEditor';
import { ColorButton, ResultChip, Select } from './parts';
import { RULE_COLORS, suggestLabelColor } from '../../lib/formula/catalog';

type NumberFormat = 'number' | 'percent' | 'currency';

const editableOutcome = (o: FormulaOutcome, siblings: Column[]): FormulaOutcome =>
    o.kind === 'calc' ? { ...o, expr: toEditable(o.expr, siblings) } : o;
const storedOutcome = (o: FormulaOutcome, siblings: Column[]): FormulaOutcome =>
    o.kind === 'calc' ? { ...o, expr: fromEditable(o.expr, siblings).stored } : o;

const PREVIEW_ROWS = 5;

/**
 * Where a Formula column's formula is written: Calculate (an expression with
 * the board's columns and functions) or If / Then / Else (rules built from
 * choices), the result's format, and a live preview on the board's own rows.
 * Opens when a Formula column is added, and from its header.
 */
export const FormulaEditor = ({ boardId, columnId, onClose }: { boardId: string; columnId: string; onClose: () => void }) => {
    const board = useBoardStore(state => state.boards.find(b => b.id === boardId));
    const column = board?.columns.find(c => c.id === columnId);
    const members = useBoardStore(state => state.activeBoardMembers);
    const setColumnFormula = useBoardStore(state => state.setColumnFormula);
    const updateColumnTitle = useBoardStore(state => state.updateColumnTitle);
    const today = useToday();
    const newUi = useNewUi();
    const t = useTerms();

    const siblings = useMemo(() => (board && column ? siblingColumns(board.columns, column) : []), [board, column]);

    // The draft, as typed: expressions name columns by title until saved.
    const initial = useRef<string>('');
    const [title, setTitle] = useState(column?.title || 'Formula');
    const [mode, setMode] = useState<'calc' | 'rules'>(column?.formula?.mode ?? 'calc');
    const [text, setText] = useState(() => (column?.formula?.expr ? toEditable(column.formula.expr, siblings) : ''));
    const [rules, setRules] = useState<FormulaRule[]>(() => (column?.formula?.rules ?? []).map(r => ({ ...r, then: editableOutcome(r.then, siblings) })));
    const [otherwise, setOtherwise] = useState<FormulaOutcome>(() => editableOutcome(column?.formula?.otherwise ?? { kind: 'empty' }, siblings));
    const [decimals, setDecimals] = useState<number | undefined>(column?.formula?.decimals);
    const [labelColors, setLabelColors] = useState<Record<string, string>>(column?.formula?.labelColors ?? {});
    const [numberFormat, setNumberFormat] = useState<NumberFormat>(column?.numberFormat ?? 'number');
    const [currencyCode, setCurrencyCode] = useState(column?.currencyCode ?? 'THB');
    const [saving, setSaving] = useState(false);
    const [saveFailed, setSaveFailed] = useState(false);
    // A formula is wrong half the time it is being typed: say so only once
    // typing pauses.
    const [settled, setSettled] = useState(true);
    const settleTimer = useRef<number | undefined>(undefined);
    const typeText = useCallback((value: string) => {
        setText(value);
        setSettled(false);
        window.clearTimeout(settleTimer.current);
        settleTimer.current = window.setTimeout(() => setSettled(true), 700);
    }, []);
    useEffect(() => () => window.clearTimeout(settleTimer.current), []);

    const people: Person[] = useMemo(() => (members || []).map((m: { user_id: string; profiles?: unknown }) => {
        const p = (Array.isArray(m.profiles) ? m.profiles[0] : m.profiles) as { full_name?: string; email?: string } | undefined;
        return { id: m.user_id, name: p?.full_name || p?.email || 'Someone' };
    }).sort((a, b) => a.name.localeCompare(b.name)), [members]);

    // What would be saved, and what still stops it.
    const { config, problem } = useMemo(() => {
        const cleanColors = Object.fromEntries(Object.entries(labelColors).filter(([k]) => k.trim()));
        const base = { decimals, labelColors: Object.keys(cleanColors).length ? cleanColors : undefined };
        if (mode === 'calc') {
            return {
                config: { mode: 'calc', expr: fromEditable(text, siblings).stored, ...base } as FormulaConfig,
                problem: checkExpression(text, siblings, columnId),
            };
        }
        const editable: FormulaConfig = { mode: 'rules', rules, otherwise, ...base };
        return {
            config: {
                ...editable,
                rules: rules.map(r => ({ ...r, then: storedOutcome(r.then, siblings) })),
                otherwise: storedOutcome(otherwise, siblings),
            } as FormulaConfig,
            problem: checkRules(editable, siblings, columnId),
        };
    }, [mode, text, rules, otherwise, decimals, labelColors, siblings, columnId]);

    const snapshot = JSON.stringify({ title, config, numberFormat, currencyCode });
    if (!initial.current) initial.current = snapshot;
    const dirty = snapshot !== initial.current;

    // Live results on the board's own rows, with the draft as if saved.
    const draftColumn = useMemo<Column | null>(() => column ? { ...column, formula: config, numberFormat, currencyCode: numberFormat === 'currency' ? currencyCode : undefined } : null, [column, config, numberFormat, currencyCode]);
    const rows = useMemo(() => (board && column ? formulaRows(board, column).filter(i => !i.isHidden) : []), [board, column]);
    const results = useMemo(() => {
        if (!draftColumn) return [] as { id: string; title: string; display: FormulaDisplay }[];
        const ctx = formulaContext(today);
        return rows.map(r => ({ id: r.id, title: r.title, display: formulaCell(draftColumn, r, siblings, ctx) }));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [draftColumn, rows, siblings, today, members]);
    const hasNumbers = results.some(r => r.display.kind === 'number');
    const textResults = useMemo(() => {
        const seen = new Map<string, number>();
        results.forEach(r => {
            if (r.display.kind === 'text' || (r.display.kind === 'label' && labelColors[r.display.text])) seen.set(r.display.text, (seen.get(r.display.text) || 0) + 1);
        });
        return [...seen.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([text]) => text);
    }, [results, labelColors]);

    const close = useCallback(() => {
        if (dirty && !window.confirm('Close without saving this formula?')) return;
        onClose();
    }, [dirty, onClose]);

    const save = async () => {
        if (problem || saving || !column) return;
        setSaving(true);
        setSaveFailed(false);
        const ok = await setColumnFormula(columnId, config, { numberFormat, currencyCode: numberFormat === 'currency' ? currencyCode : undefined });
        if (ok && title.trim() && title.trim() !== column.title) await updateColumnTitle(columnId, title.trim());
        setSaving(false);
        if (ok) onClose();
        else setSaveFailed(true);
    };

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !e.defaultPrevented) close();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [close]);

    if (!board || !column) return null;

    const shown = results.slice(0, PREVIEW_ROWS);
    // Nothing written yet: say what to do, not that something is wrong.
    const nothingYet = mode === 'calc' ? !text.trim() : rules.length === 0;
    const scopeWord = column.scope === 'subitem' ? t.subitem : t.item;
    const scopeWords = column.scope === 'subitem' ? t.subitems : t.items;

    // How the results show: number format and decimals, and colours for text results.
    const formatPanel = () => (hasNumbers || (mode === 'calc' && textResults.length > 0)) ? (
        <div className="fx-format">
            {hasNumbers && (
                <div className="fx-format__row">
                    <span className="fx-eyebrow">Numbers show as</span>
                    <div className="fx-seg" role="radiogroup" aria-label="Number format">
                        {([['number', '1,234'], ['percent', '%'], ['currency', 'Currency']] as [NumberFormat, string][]).map(([f, label]) => (
                            <button key={f} type="button" role="radio" aria-checked={numberFormat === f} className={`fx-seg__btn${numberFormat === f ? ' is-on' : ''}`} onClick={() => setNumberFormat(f)}>{label}</button>
                        ))}
                    </div>
                    {numberFormat === 'currency' && (
                        <Select value={currencyCode} onChange={setCurrencyCode} label="Currency">
                            {CURRENCY_OPTIONS.map(c => <option key={c.code} value={c.code}>{c.symbol} {c.code}</option>)}
                        </Select>
                    )}
                    <Select value={decimals === undefined ? 'auto' : String(decimals)} onChange={v => setDecimals(v === 'auto' ? undefined : Number(v))} label="Decimals">
                        <option value="auto">Decimals: as needed</option>
                        {[0, 1, 2, 3, 4].map(n => <option key={n} value={n}>{n === 0 ? 'No decimals' : `${n} decimal${n === 1 ? '' : 's'}`}</option>)}
                    </Select>
                    {numberFormat === 'percent' && <span className="fx-hint">0.85 shows as 85%</span>}
                </div>
            )}
            {mode === 'calc' && textResults.length > 0 && (
                <div className="fx-format__row fx-format__row--colors">
                    <span className="fx-eyebrow">Colour the results</span>
                    {textResults.map(text => (
                        <span key={text} className="fx-result-color">
                            <ColorButton
                                color={labelColors[text] || '#c4c4c4'}
                                onChange={c => setLabelColors(prev => ({ ...prev, [text]: c }))}
                                label={`Colour for "${text}"`}
                            />
                            <ResultChip display={labelColors[text] ? { kind: 'label', text, color: labelColors[text] } : { kind: 'text', text }} newUi={newUi} />
                            {labelColors[text] && (
                                <button type="button" className="fx-icon-btn fx-icon-btn--tiny" aria-label={`No colour for "${text}"`} title="No colour" onClick={() => setLabelColors(prev => { const next = { ...prev }; delete next[text]; return next; })}><X size={12} /></button>
                            )}
                        </span>
                    ))}
                    {Object.keys(labelColors).length === 0 && (
                        <button type="button" className="fx-link" onClick={() => {
                            // Red for trouble, amber for a warning, green for good news.
                            let neutral = 0;
                            setLabelColors(Object.fromEntries(textResults.map(txt => {
                                const c = suggestLabelColor(txt, neutral);
                                if (c !== RULE_COLORS.red && c !== RULE_COLORS.amber && c !== RULE_COLORS.green) neutral++;
                                return [txt, c];
                            })));
                        }}>Colour them all</button>
                    )}
                </div>
            )}
        </div>
    ) : null;

    return createPortal(
        <div className="fx-overlay" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}>
            <div className="fx-dialog" role="dialog" aria-modal="true" aria-labelledby="fx-title">
                <header className="fx-head">
                    <span className="fx-head__tile" aria-hidden="true"><Sigma size={20} strokeWidth={2.2} /></span>
                    <div className="fx-head__text">
                        <label className="fx-head__eyebrow" htmlFor="fx-title">Formula column</label>
                        <input
                            id="fx-title"
                            className="fx-title-input"
                            value={title}
                            onChange={e => setTitle(e.target.value)}
                            maxLength={80}
                            aria-label="Column name"
                        />
                    </div>
                    <button type="button" className="fx-icon-btn fx-close" onClick={close} aria-label="Close"><X size={18} /></button>
                </header>

                <div className="fx-modes" role="tablist" aria-label="Kind of formula">
                    <button type="button" role="tab" aria-selected={mode === 'calc'} className={`fx-mode${mode === 'calc' ? ' is-on' : ''}`} onClick={() => setMode('calc')}>
                        <span className="fx-mode__icon"><Calculator size={18} /></span>
                        <span className="fx-mode__text">
                            <span className="fx-mode__title">Calculate</span>
                            <span className="fx-mode__sub">Add, subtract, multiply and divide columns, or use functions such as SUM, ROUND and DAYS</span>
                        </span>
                    </button>
                    <button type="button" role="tab" aria-selected={mode === 'rules'} className={`fx-mode${mode === 'rules' ? ' is-on' : ''}`} onClick={() => setMode('rules')}>
                        <span className="fx-mode__icon"><GitBranch size={18} /></span>
                        <span className="fx-mode__text">
                            <span className="fx-mode__title">If / Then / Else</span>
                            <span className="fx-mode__sub">Show a label or a value when a condition holds — e.g. "Overdue" once a timeline has passed</span>
                        </span>
                    </button>
                </div>

                <div className="fx-body">
                    {mode === 'calc' ? (
                        <CalcEditor text={text} onText={typeText} problem={settled ? problem : null} columns={siblings} selfId={columnId} onSubmit={save}>
                            {formatPanel()}
                        </CalcEditor>
                    ) : (
                        <>
                            <RulesEditor rules={rules} onRules={setRules} otherwise={otherwise} onOtherwise={setOtherwise} columns={siblings} selfId={columnId} people={people} />
                            {formatPanel()}
                        </>
                    )}
                </div>


                <section className="fx-preview" aria-label="Preview">
                    <header className="fx-preview__head">
                        <span className="fx-eyebrow">Preview</span>
                        <span className="fx-preview__count">{rows.length === 0 ? `No ${scopeWords} yet` : rows.length > PREVIEW_ROWS ? `First ${PREVIEW_ROWS} of ${rows.length} ${scopeWords}` : `${rows.length} ${rows.length === 1 ? scopeWord : scopeWords}`}</span>
                        <span className="fx-preview__today"><CalendarDays size={13} /> Today is {formatDay(today, 'ddd D MMM YYYY')}</span>
                    </header>
                    {mode === 'calc' && problem && text.trim() ? (
                        // One calm line rather than an error on every row while the formula is unfinished.
                        <p className="fx-preview__none">Results show here once the formula is complete.</p>
                    ) : shown.length > 0 ? (
                        <ul className="fx-preview__list">
                            {shown.map(r => (
                                <li key={r.id} className="fx-preview__row">
                                    <span className="fx-preview__name" title={r.title}>{r.title || 'Untitled'}</span>
                                    <span className="fx-preview__value"><ResultChip display={r.display} newUi={newUi} /></span>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="fx-preview__none">{`Results appear here as soon as this ${t.board} has ${scopeWords}.`}</p>
                    )}
                </section>

                <footer className="fx-foot">
                    <span className={`fx-foot__note${(problem && !nothingYet && settled) || saveFailed ? ' is-bad' : ''}`} role="status">
                        {saveFailed ? <><CircleAlert size={15} /> Couldn't save — check your connection and try again</>
                            : nothingYet ? (mode === 'calc' ? 'Write a formula, or pick an example, to see the results.' : 'Add an IF — or start from a ready-made rule — to see the results.')
                                : problem && !settled ? 'Checking the formula as you type…'
                                : problem ? <><CircleAlert size={15} /> {problem.message}</>
                                    : 'Results work themselves out for every row and keep up as values change.'}
                    </span>
                    <button type="button" className="fx-btn" onClick={close}>Cancel</button>
                    <button type="button" className="fx-btn fx-btn--primary" onClick={save} disabled={!!problem || saving} title={problem ? problem.message : 'Save (Ctrl + Enter)'}>
                        {saving ? 'Saving…' : 'Save formula'}
                    </button>
                </footer>
            </div>
        </div>,
        document.body
    );
};
