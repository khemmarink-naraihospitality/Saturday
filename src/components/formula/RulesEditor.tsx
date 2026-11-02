import { useMemo, useRef } from 'react';
import { ArrowDown, ArrowUp, Plus, Sparkles, Trash2, X } from 'lucide-react';
import type { Column, FormulaColumnRef, FormulaCondition, FormulaConditionOp, FormulaOutcome, FormulaPart, FormulaRule } from '../../types';
import { NAME_REF, isColumnRef, nameRefName, refName, subjectKind } from '../../lib/formula';
import { DEFAULT_DAYS, RULE_COLORS, daysSuffix, newConditionId, newRuleId, opInfo, opsFor, ruleTemplates } from '../../lib/formula/catalog';
import { tintLabel, LABEL_TEXT } from '../../lib/labelTint';
import { FormulaInput } from './FormulaInput';
import { makeSuggest, refEntries } from './CalcEditor';
import { ColorButton, Select, TypeIcon } from './parts';

export interface Person { id: string; name: string }

interface Ctx {
    /** The columns a rule can read: the set without the formula itself. */
    readable: Column[];
    people: Person[];
}

const columnById = (ctx: Ctx, id: string) => ctx.readable.find(c => c.id === id);
const subjectName = (ctx: Ctx, id: string) => id === NAME_REF ? nameRefName(ctx.readable) : (() => { const c = columnById(ctx, id); return c ? refName(c, ctx.readable) : 'Deleted column'; })();

/** A condition reset for a newly chosen column: its first comparison, nothing chosen yet. */
const freshCondition = (ctx: Ctx, columnId: string, keepId: string): FormulaCondition => {
    const column = columnId === NAME_REF ? null : columnById(ctx, columnId);
    const op = opsFor(subjectKind(column))[0].op;
    return {
        id: keepId,
        columnId,
        part: column?.type === 'timeline' ? 'end' : undefined,
        op,
        value: DEFAULT_DAYS[op] ?? undefined,
    };
};

// ---- the column and comparison -----------------------------------------------------------

const ColumnSelect = ({ ctx, value, onChange, label, placeholder = 'Choose a column', numericOnly, dateOnly }: {
    ctx: Ctx;
    value: string;
    onChange: (id: string) => void;
    label: string;
    placeholder?: string;
    numericOnly?: boolean;
    dateOnly?: boolean;
}) => {
    const options = ctx.readable.filter(c =>
        numericOnly ? ['number', 'priority', 'formula'].includes(c.type)
            : dateOnly ? ['date', 'due_date', 'timeline', 'formula'].includes(c.type)
                : true);
    return (
        <Select value={value} onChange={onChange} label={label} className={value ? '' : 'is-placeholder'}>
            {!value && <option value="">{placeholder}</option>}
            {!numericOnly && !dateOnly && <option value={NAME_REF}>{nameRefName(ctx.readable)}</option>}
            {options.map(c => <option key={c.id} value={c.id}>{refName(c, ctx.readable)}</option>)}
            {value && value !== NAME_REF && !columnById(ctx, value) && <option value={value}>Deleted column</option>}
        </Select>
    );
};

const PartSelect = ({ value, onChange }: { value: FormulaPart | undefined; onChange: (p: FormulaPart) => void }) => (
    <Select value={value || 'end'} onChange={v => onChange(v as FormulaPart)} label="Which date of the timeline">
        <option value="end">end date</option>
        <option value="start">start date</option>
    </Select>
);

/** Chosen Status labels, Dropdown labels or people as chips, plus a list to add another. */
const MultiPick = ({ chosen, choices, onChange, label }: {
    chosen: string[];
    choices: { value: string; label: string; color?: string }[];
    onChange: (values: string[]) => void;
    label: string;
}) => {
    const left = choices.filter(c => !chosen.includes(c.value));
    return (
        <span className="fx-multi">
            {chosen.map(v => {
                const choice = choices.find(c => c.value === v);
                return (
                    <span
                        key={v}
                        className={`fx-chip${choice?.color ? ' fx-chip--color' : ''}`}
                        style={choice?.color ? { backgroundColor: tintLabel(choice.color), color: LABEL_TEXT } : undefined}
                    >
                        {choice?.label ?? 'Removed'}
                        <button type="button" aria-label={`Remove ${choice?.label ?? ''}`} onClick={() => onChange(chosen.filter(x => x !== v))}><X size={12} strokeWidth={2.5} /></button>
                    </span>
                );
            })}
            {left.length > 0 && (
                <Select value="" onChange={v => v && onChange([...chosen, v])} label={label} className="fx-select--add">
                    <option value="">{chosen.length ? '+ or…' : 'Choose…'}</option>
                    {left.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </Select>
            )}
        </span>
    );
};

/** A typed value, or another column of the row to compare with. */
const ValueOrColumn = ({ ctx, value, onChange, kind }: {
    ctx: Ctx;
    value: FormulaCondition['value'];
    onChange: (v: FormulaCondition['value']) => void;
    kind: 'number' | 'date';
}) => {
    const fromColumn = isColumnRef(value);
    return (
        <span className="fx-value-or-col">
            <Select
                value={fromColumn ? (value as FormulaColumnRef).column : ''}
                onChange={v => onChange(v ? { column: v, part: columnById(ctx, v)?.type === 'timeline' ? 'end' : undefined } : undefined)}
                label="Compare with"
            >
                <option value="">{kind === 'number' ? 'a number' : 'a date'}</option>
                <optgroup label="or a column">
                    {ctx.readable
                        .filter(c => kind === 'number' ? ['number', 'priority', 'formula'].includes(c.type) : ['date', 'due_date', 'timeline', 'formula'].includes(c.type))
                        .map(c => <option key={c.id} value={c.id}>{refName(c, ctx.readable)}</option>)}
                </optgroup>
            </Select>
            {fromColumn ? (
                columnById(ctx, (value as FormulaColumnRef).column)?.type === 'timeline' && (
                    <PartSelect value={(value as FormulaColumnRef).part} onChange={p => onChange({ ...(value as FormulaColumnRef), part: p })} />
                )
            ) : kind === 'number' ? (
                <input
                    className="fx-input fx-input--num"
                    type="number"
                    inputMode="decimal"
                    value={typeof value === 'number' || typeof value === 'string' ? String(value) : ''}
                    onChange={e => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
                    placeholder="0"
                    aria-label="Number"
                />
            ) : (
                <input
                    className="fx-input fx-input--date"
                    type="date"
                    value={typeof value === 'string' ? value : ''}
                    onChange={e => onChange(e.target.value || undefined)}
                    aria-label="Date"
                />
            )}
        </span>
    );
};

const ConditionRow = ({ ctx, cond, joiner, onChange, onRemove, onToggleJoin }: {
    ctx: Ctx;
    cond: FormulaCondition;
    /** "AND" / "OR" before every condition but the first. */
    joiner: 'AND' | 'OR' | null;
    onChange: (c: FormulaCondition) => void;
    onRemove: () => void;
    onToggleJoin: () => void;
}) => {
    const column = cond.columnId && cond.columnId !== NAME_REF ? columnById(ctx, cond.columnId) : null;
    const kind = subjectKind(column);
    const ops = cond.columnId ? opsFor(kind) : [];
    const info = cond.columnId ? opInfo(kind, cond.op) : undefined;
    const days = typeof cond.value === 'number' ? cond.value : DEFAULT_DAYS[cond.op] ?? 0;

    const valueEditor = () => {
        if (!info) return null;
        switch (info.value) {
            case 'options':
                return (
                    <MultiPick
                        label="Status"
                        chosen={Array.isArray(cond.value) ? cond.value : []}
                        choices={(column?.options || []).filter(o => o.label && o.label !== 'Default').map(o => ({ value: o.id, label: o.label, color: o.color }))}
                        onChange={v => onChange({ ...cond, value: v })}
                    />
                );
            case 'labels':
                return (
                    <MultiPick
                        label="Label"
                        chosen={Array.isArray(cond.value) ? cond.value : []}
                        choices={(column?.options || []).map(o => ({ value: o.label, label: o.label, color: o.color }))}
                        onChange={v => onChange({ ...cond, value: v })}
                    />
                );
            case 'people':
                return (
                    <MultiPick
                        label="Person"
                        chosen={Array.isArray(cond.value) ? cond.value : []}
                        choices={ctx.people.map(p => ({ value: p.id, label: p.name }))}
                        onChange={v => onChange({ ...cond, value: v })}
                    />
                );
            case 'text':
                return (
                    <input
                        className="fx-input"
                        value={typeof cond.value === 'string' ? cond.value : typeof cond.value === 'number' ? String(cond.value) : ''}
                        onChange={e => onChange({ ...cond, value: e.target.value })}
                        placeholder="Type a text"
                        aria-label="Text"
                    />
                );
            case 'number':
                return <ValueOrColumn ctx={ctx} kind="number" value={cond.value} onChange={v => onChange({ ...cond, value: v })} />;
            case 'date':
                return <ValueOrColumn ctx={ctx} kind="date" value={cond.value} onChange={v => onChange({ ...cond, value: v })} />;
            case 'days':
                return (
                    <span className="fx-days">
                        <input
                            className="fx-input fx-input--num fx-input--days"
                            type="number"
                            min={0}
                            value={days}
                            onChange={e => onChange({ ...cond, value: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
                            aria-label="Days"
                        />
                        <span className="fx-days__word">{daysSuffix(cond.op, days)}</span>
                    </span>
                );
            default:
                return null;
        }
    };

    return (
        <div className="fx-cond">
            {joiner ? (
                <button type="button" className={`fx-join fx-join--${joiner.toLowerCase()}`} onClick={onToggleJoin} title="AND: every condition must hold · OR: any one is enough. Click to switch.">
                    {joiner}
                </button>
            ) : <span className="fx-join fx-join--first" aria-hidden="true" />}
            <div className="fx-cond__body">
                <span className="fx-cond__subject">
                    <span className="fx-cond__icon"><TypeIcon type={cond.columnId === NAME_REF ? 'name' : column?.type || 'text'} /></span>
                    <ColumnSelect ctx={ctx} value={cond.columnId} label="Column" onChange={id => onChange(freshCondition(ctx, id, cond.id))} />
                </span>
                {column?.type === 'timeline' && <PartSelect value={cond.part} onChange={p => onChange({ ...cond, part: p })} />}
                {cond.columnId && (
                    <Select
                        value={cond.op}
                        label="Condition"
                        onChange={op => {
                            const next = opInfo(kind, op as FormulaConditionOp);
                            const keep = info && next && info.value === next.value;
                            onChange({ ...cond, op: op as FormulaConditionOp, value: keep ? cond.value : DEFAULT_DAYS[op as FormulaConditionOp] ?? undefined });
                        }}
                    >
                        {ops.map(o => <option key={o.op} value={o.op}>{o.label}</option>)}
                    </Select>
                )}
                {valueEditor()}
            </div>
            <button type="button" className="fx-icon-btn" aria-label="Remove this condition" title="Remove this condition" onClick={onRemove}><X size={15} /></button>
        </div>
    );
};

// ---- what to show ----------------------------------------------------------------------

const OUTCOME_KINDS: { kind: FormulaOutcome['kind']; label: string; title: string }[] = [
    { kind: 'label', label: 'Label', title: 'A coloured label, like a status' },
    { kind: 'column', label: 'Column', title: 'What another column of the row says' },
    { kind: 'text', label: 'Text', title: 'Plain text' },
    { kind: 'number', label: 'Number', title: 'A number' },
    { kind: 'calc', label: 'Calculation', title: 'A formula, as on the Calculate tab' },
    { kind: 'empty', label: 'Nothing', title: 'Leave the cell empty' },
];

const switchOutcome = (kind: FormulaOutcome['kind'], from: FormulaOutcome, ctx: Ctx): FormulaOutcome => {
    switch (kind) {
        case 'label': return { kind, text: from.kind === 'text' ? from.text : '', color: RULE_COLORS.red };
        case 'column': return { kind, columnId: ctx.readable.find(c => c.type === 'status')?.id || ctx.readable[0]?.id || NAME_REF };
        case 'text': return { kind, text: from.kind === 'label' ? from.text : '' };
        case 'number': return { kind, value: 0 };
        case 'calc': return { kind, expr: '' };
        default: return { kind: 'empty' };
    }
};

export const OutcomeEditor = ({ ctx, outcome, onChange, statusLabels }: {
    ctx: Ctx;
    outcome: FormulaOutcome;
    onChange: (o: FormulaOutcome) => void;
    /** The board's own Status labels, offered as ready-made labels. */
    statusLabels: { label: string; color: string }[];
}) => {
    const entries = useMemo(() => refEntries(ctx.readable), [ctx.readable]);
    const suggest = useMemo(() => makeSuggest(entries), [entries]);
    const labelInput = useRef<HTMLInputElement>(null);

    return (
        <div className="fx-outcome">
            <div className="fx-kinds" role="radiogroup" aria-label="Show">
                {OUTCOME_KINDS.map(k => (
                    <button
                        key={k.kind}
                        type="button"
                        role="radio"
                        aria-checked={outcome.kind === k.kind}
                        className={`fx-kind${outcome.kind === k.kind ? ' is-on' : ''}`}
                        title={k.title}
                        onClick={() => {
                            if (outcome.kind === k.kind) return;
                            onChange(switchOutcome(k.kind, outcome, ctx));
                            if (k.kind === 'label') setTimeout(() => labelInput.current?.focus(), 0);
                        }}
                    >
                        {k.label}
                    </button>
                ))}
            </div>
            <div className="fx-outcome__body">
                {outcome.kind === 'label' && (
                    <>
                        <div className="fx-label-edit">
                            <ColorButton color={outcome.color} onChange={color => onChange({ ...outcome, color })} />
                            <input
                                ref={labelInput}
                                className="fx-input fx-input--label"
                                value={outcome.text}
                                onChange={e => onChange({ ...outcome, text: e.target.value })}
                                placeholder="Label, e.g. Overdue"
                                aria-label="Label"
                                maxLength={60}
                            />
                            {outcome.text.trim() && (
                                <span className="fx-result fx-result--label fx-label-edit__preview" style={{ backgroundColor: tintLabel(outcome.color), color: LABEL_TEXT }}>{outcome.text.trim()}</span>
                            )}
                        </div>
                        {statusLabels.length > 0 && (
                            <div className="fx-quick">
                                <span className="fx-quick__title">Or use a status label:</span>
                                {statusLabels.map(s => (
                                    <button
                                        key={`${s.label}|${s.color}`}
                                        type="button"
                                        className="fx-quick__chip"
                                        style={{ backgroundColor: tintLabel(s.color), color: LABEL_TEXT }}
                                        onClick={() => onChange({ kind: 'label', text: s.label, color: s.color })}
                                    >
                                        {s.label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </>
                )}
                {outcome.kind === 'column' && (
                    <span className="fx-inline">
                        <span className="fx-cond__icon"><TypeIcon type={outcome.columnId === NAME_REF ? 'name' : columnById(ctx, outcome.columnId)?.type || 'text'} /></span>
                        <ColumnSelect ctx={ctx} value={outcome.columnId} label="Column to show" onChange={id => onChange({ kind: 'column', columnId: id, part: columnById(ctx, id)?.type === 'timeline' ? 'end' : undefined })} />
                        {columnById(ctx, outcome.columnId)?.type === 'timeline' && (
                            <Select value={outcome.part || 'end'} onChange={p => onChange({ ...outcome, part: p as FormulaPart })} label="Which part">
                                <option value="end">end date</option>
                                <option value="start">start date</option>
                                <option value="days">number of days</option>
                            </Select>
                        )}
                        <span className="fx-hint">{subjectName(ctx, outcome.columnId) ? `shows the row's ${subjectName(ctx, outcome.columnId)} as it is` : ''}</span>
                    </span>
                )}
                {outcome.kind === 'text' && (
                    <input className="fx-input fx-input--wide" value={outcome.text} onChange={e => onChange({ ...outcome, text: e.target.value })} placeholder="Text to show" aria-label="Text to show" />
                )}
                {outcome.kind === 'number' && (
                    <input
                        className="fx-input fx-input--num"
                        type="number"
                        inputMode="decimal"
                        value={Number.isFinite(outcome.value) ? outcome.value : ''}
                        onChange={e => onChange({ kind: 'number', value: e.target.value === '' ? NaN : Number(e.target.value) })}
                        aria-label="Number to show"
                    />
                )}
                {outcome.kind === 'calc' && (
                    <FormulaInput
                        compact
                        value={outcome.expr}
                        onChange={expr => onChange({ kind: 'calc', expr })}
                        placeholder="e.g. {Price} * {Quantity}"
                        ariaLabel="Calculation"
                        suggest={suggest}
                    />
                )}
                {outcome.kind === 'empty' && <span className="fx-hint">The cell stays empty.</span>}
            </div>
        </div>
    );
};

// ---- one IF -------------------------------------------------------------------------------

const RuleCard = ({ ctx, rule, index, count, onChange, onRemove, onMove, statusLabels }: {
    ctx: Ctx;
    rule: FormulaRule;
    index: number;
    count: number;
    onChange: (r: FormulaRule) => void;
    onRemove: () => void;
    onMove: (dir: -1 | 1) => void;
    statusLabels: { label: string; color: string }[];
}) => {
    const joiner = rule.match === 'any' ? 'OR' : 'AND';
    return (
        <section className="fx-rule" aria-label={index === 0 ? 'IF' : `ELSE IF ${index + 1}`}>
            <header className="fx-rule__head">
                <span className="fx-rule__tag">{index === 0 ? 'IF' : 'ELSE IF'}</span>
                {count > 1 && <span className="fx-rule__note">checked {index === 0 ? 'first' : `${ordinal(index + 1)}`}</span>}
                <span className="fx-rule__tools">
                    {count > 1 && (
                        <>
                            <button type="button" className="fx-icon-btn" aria-label="Check this one earlier" title="Check this one earlier" disabled={index === 0} onClick={() => onMove(-1)}><ArrowUp size={15} /></button>
                            <button type="button" className="fx-icon-btn" aria-label="Check this one later" title="Check this one later" disabled={index === count - 1} onClick={() => onMove(1)}><ArrowDown size={15} /></button>
                        </>
                    )}
                    <button type="button" className="fx-icon-btn fx-icon-btn--danger" aria-label="Delete this IF" title="Delete this IF" onClick={onRemove}><Trash2 size={15} /></button>
                </span>
            </header>
            <div className="fx-rule__conds">
                {rule.conditions.map((c, i) => (
                    <ConditionRow
                        key={c.id}
                        ctx={ctx}
                        cond={c}
                        joiner={i === 0 ? null : joiner}
                        onChange={next => onChange({ ...rule, conditions: rule.conditions.map(x => x.id === c.id ? next : x) })}
                        onRemove={() => onChange({ ...rule, conditions: rule.conditions.filter(x => x.id !== c.id) })}
                        onToggleJoin={() => onChange({ ...rule, match: rule.match === 'any' ? 'all' : 'any' })}
                    />
                ))}
                <button
                    type="button"
                    className="fx-add fx-add--cond"
                    onClick={() => onChange({ ...rule, conditions: [...rule.conditions, { id: newConditionId(), columnId: '', op: 'is' }] })}
                >
                    <Plus size={14} /> {rule.conditions.length ? `Add ${joiner === 'OR' ? 'an OR' : 'an AND'} condition` : 'Add a condition'}
                </button>
            </div>
            <div className="fx-rule__then">
                <span className="fx-then-tag">THEN show</span>
                <OutcomeEditor ctx={ctx} outcome={rule.then} onChange={then => onChange({ ...rule, then })} statusLabels={statusLabels} />
            </div>
        </section>
    );
};

const ordinal = (n: number) => (n === 2 ? 'second' : n === 3 ? 'third' : `${n}th`);

/**
 * If / Then / Else: IFs checked top to bottom — the first whose conditions
 * hold decides what the row shows — then ELSE. Built entirely from choices:
 * columns, comparisons and values from the board, labels in the Status
 * palette, and ready-made rules to start from.
 */
export const RulesEditor = ({ rules, onRules, otherwise, onOtherwise, columns, selfId, people }: {
    rules: FormulaRule[];
    onRules: (rules: FormulaRule[]) => void;
    otherwise: FormulaOutcome;
    onOtherwise: (o: FormulaOutcome) => void;
    columns: Column[];
    selfId: string;
    people: Person[];
}) => {
    const readable = useMemo(() => columns.filter(c => c.id !== selfId), [columns, selfId]);
    const ctx: Ctx = useMemo(() => ({ readable, people }), [readable, people]);
    const templates = useMemo(() => ruleTemplates(columns, selfId), [columns, selfId]);
    const statusLabels = useMemo(() => {
        const seen = new Set<string>();
        const out: { label: string; color: string }[] = [];
        readable.filter(c => c.type === 'status').forEach(c => (c.options || []).forEach(o => {
            if (!o.label || o.label === 'Default') return;
            const key = `${o.label.toLowerCase()}|${o.color}`;
            if (seen.has(key)) return;
            seen.add(key);
            out.push({ label: o.label, color: o.color });
        }));
        return out.slice(0, 12);
    }, [readable]);

    const addRule = () => onRules([...rules, {
        id: newRuleId(), match: 'all',
        conditions: [{ id: newConditionId(), columnId: '', op: 'is' }],
        then: { kind: 'label', text: '', color: rules.length === 0 ? RULE_COLORS.red : RULE_COLORS.amber },
    }]);

    return (
        <div className="fx-rules">
            {templates.length > 0 && (
                <div className="fx-templates">
                    <span className="fx-eyebrow"><Sparkles size={13} /> Start from</span>
                    <div className="fx-templates__list">
                        {templates.map(t => (
                            <button
                                key={t.id}
                                type="button"
                                className="fx-template"
                                onClick={() => {
                                    const built = t.build();
                                    onRules(built.rules);
                                    onOtherwise(built.otherwise);
                                }}
                            >
                                <span className="fx-template__title">{t.title}</span>
                                <span className="fx-template__desc">{t.description}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {rules.length === 0 ? (
                <div className="fx-rules__empty">
                    <p>Show something different when a condition holds — for example, <strong>"Overdue"</strong> in red once a timeline has passed.</p>
                    <button type="button" className="fx-btn fx-btn--primary" onClick={addRule}><Plus size={15} /> Add an IF</button>
                </div>
            ) : (
                <>
                    {rules.map((r, i) => (
                        <RuleCard
                            key={r.id}
                            ctx={ctx}
                            rule={r}
                            index={i}
                            count={rules.length}
                            statusLabels={statusLabels}
                            onChange={next => onRules(rules.map(x => x.id === r.id ? next : x))}
                            onRemove={() => onRules(rules.filter(x => x.id !== r.id))}
                            onMove={dir => {
                                const next = [...rules];
                                const j = i + dir;
                                [next[i], next[j]] = [next[j], next[i]];
                                onRules(next);
                            }}
                        />
                    ))}
                    <button type="button" className="fx-add fx-add--rule" onClick={addRule}><Plus size={14} /> Add ELSE IF</button>
                    <section className="fx-rule fx-rule--else" aria-label="ELSE">
                        <header className="fx-rule__head">
                            <span className="fx-rule__tag fx-rule__tag--else">ELSE</span>
                            <span className="fx-rule__note">when no IF above holds</span>
                        </header>
                        <div className="fx-rule__then">
                            <span className="fx-then-tag">show</span>
                            <OutcomeEditor ctx={ctx} outcome={otherwise} onChange={onOtherwise} statusLabels={statusLabels} />
                        </div>
                    </section>
                </>
            )}
        </div>
    );
};

export { subjectName };
