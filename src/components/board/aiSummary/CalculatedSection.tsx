import { useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Calculator, Check, Info, Lock, Minus } from 'lucide-react';
import { columnNames, type BoardSummary, type Finding, type PeriodCounts } from '../../../lib/boardSummary';
import { tintLabel } from '../../../lib/labelTint';
import { useTerms } from '../../../lib/terms';

/*
 * The AI Summary tab's lower section, under Gemini's: the board summed up from
 * its own numbers — statuses, deadlines, people, groups and the activity log.
 * No AI, no quota, nothing sent anywhere (src/lib/boardSummary.ts does the
 * counting). On a wide card the tables by group and by person sit on the left
 * of the status and the week / month comparison (.ais-pair).
 */

const PEOPLE_SHOWN = 6;

const FindingLine = ({ finding }: { finding: Finding }) => (
    <li className={`is-${finding.tone}`}>
        <span>{finding.parts.map((part, i) => (typeof part === 'string' ? part : <strong key={i}>{part.b}</strong>))}</span>
    </li>
);

const Progress = ({ pct }: { pct: number | null }) =>
    pct === null ? <span className="is-zero">–</span> : (
        <span className="ais-progress">
            <span className="ais-progress__track" aria-hidden="true"><span className="ais-progress__fill" style={{ width: `${pct}%` }} /></span>
            <b>{pct}%</b>
        </span>
    );

const Change = ({ now, before, good }: { now: number | null; before: number | null; good?: boolean }) => {
    if (now === null || before === null) return <span className="is-zero">–</span>;
    const diff = now - before;
    if (diff === 0) return <span className="ais-change is-zero"><Minus size={12} aria-hidden="true" />0</span>;
    const tone = good === undefined ? '' : (diff > 0) === good ? ' is-good' : ' is-warn';
    return (
        <span className={`ais-change${tone}`}>
            {diff > 0 ? <ArrowUpRight size={13} aria-hidden="true" /> : <ArrowDownRight size={13} aria-hidden="true" />}
            {diff > 0 ? `+${diff}` : diff}
        </span>
    );
};

const cell = (n: number | null, loading: boolean) => (n === null ? (loading ? '…' : '–') : n);

export const CalculatedSection = ({ summary: s, logsLoading, onPickStatusColumn }: {
    summary: BoardSummary;
    logsLoading: boolean;
    onPickStatusColumn: (columnId: string) => void;
}) => {
    const t = useTerms();
    const [range, setRange] = useState<'week' | 'month'>('week');
    const [allPeople, setAllPeople] = useState(false);

    const names = columnNames(s.statusColumns);
    const hasDeadlines = s.deadlineColumns.length > 0;
    const period = range === 'week' ? s.week : s.month;
    const rows: { label: string; pick: (c: PeriodCounts) => number | null; good?: boolean }[] = [
        { label: `New ${t.items}`, pick: c => c.created },
        { label: 'Marked done', pick: c => c.done, good: true },
        { label: 'Status changes', pick: c => c.statusChanges },
        { label: `${t.Updates} posted`, pick: c => c.comments },
    ];
    const people = allPeople ? s.people : s.people.slice(0, PEOPLE_SHOWN);
    const deadlineFrom = [...new Set(s.deadlineColumns.map(c => (c.type === 'timeline' ? `${c.title}'s end` : c.title)))];

    return (
        <section className="ais-sec card-surface" aria-labelledby="ais-calc-title">
            <div className="ais-sec__head">
                <div className="ais-sec__eyebrow"><span className="ais-sec__mark" aria-hidden="true"><Calculator size={12} /></span>Calculated · no AI</div>
                <div className="ais-sec__titlerow">
                    <h3 id="ais-calc-title">{`From the ${t.board}'s numbers`}</h3>
                    <div className="ais-chips">
                        <span className="ais-chip ais-chip--ok"><Check size={12} aria-hidden="true" />Free, no quota</span>
                        <span className="ais-chip ais-chip--ok"><Lock size={12} aria-hidden="true" />Stays in the app</span>
                    </div>
                </div>
            </div>

            <dl className="ais-stats">
                <div className="ais-stat"><dt>{t.Items}</dt><dd>{s.total}</dd></div>
                <div className={`ais-stat${s.done ? ' is-good' : ''}`}>
                    <dt>Done</dt>
                    <dd>{s.statusColumn ? s.done : '–'}{s.pct !== null && <small>{s.pct}%</small>}</dd>
                </div>
                <div className={`ais-stat${s.overdue.length ? ' is-bad' : ''}`}><dt>Overdue</dt><dd>{hasDeadlines ? s.overdue.length : '–'}</dd></div>
                <div className={`ais-stat${s.stuck ? ' is-warn' : ''}`}><dt>Stuck or waiting</dt><dd>{s.statusColumn ? s.stuck : '–'}</dd></div>
                <div className="ais-stat"><dt>Due in 7 days</dt><dd>{hasDeadlines ? s.dueSoon.length : '–'}</dd></div>
            </dl>

            <div>
                <h4 className="ais-h">What the numbers say</h4>
                <ul className="ais-findings">
                    {s.findings.slice(0, 7).map(f => <FindingLine key={f.id} finding={f} />)}
                </ul>
            </div>

            <div className="ais-pair">
                <div className="ais-stack">
                    {s.statusColumn && s.statuses.length > 0 && (
                        <div>
                            <h4 className="ais-h">
                                Status
                                {s.statusColumns.length > 1 ? (
                                    <label className="ais-h__aside ais-pick">
                                        Done is read from
                                        <select value={s.statusColumn.id} onChange={e => onPickStatusColumn(e.target.value)}>
                                            {s.statusColumns.map(c => <option key={c.id} value={c.id}>{names.get(c.id)}</option>)}
                                        </select>
                                    </label>
                                ) : (
                                    <span className="ais-h__aside">{`from ${s.statusColumn.title}`}</span>
                                )}
                            </h4>
                            <div className="ais-bar" role="img" aria-label={s.statuses.map(x => `${x.label}: ${x.count}`).join(', ')}>
                                {s.statuses.map(x => (
                                    <span key={x.key} style={{ flexGrow: x.count, background: tintLabel(x.color) }} title={`${x.label}: ${x.count}`} />
                                ))}
                            </div>
                            <ul className="ais-legend">
                                {s.statuses.map(x => (
                                    <li key={x.key}><i style={{ background: tintLabel(x.color) }} />{x.label} <b>{x.count}</b></li>
                                ))}
                            </ul>
                            {(s.doneLabels.length > 0 || s.stoppedLabels.length > 0) && (
                                <p className="ais-note">
                                    {s.doneLabels.length > 0 && `Counted as done: ${s.doneLabels.join(', ')}. `}
                                    {s.stoppedLabels.length > 0 && `Left out of the counts: ${s.stoppedLabels.join(', ')}.`}
                                    {hasDeadlines && ` Deadlines come from ${deadlineFrom.join(', then ')}.`}
                                </p>
                            )}
                        </div>
                    )}

                    <div>
                        <h4 className="ais-h">
                            {range === 'week' ? 'This week and the one before' : 'This month and the one before'}
                            <span className="ais-seg" role="group" aria-label="Compare">
                                <button type="button" aria-pressed={range === 'week'} onClick={() => setRange('week')}>Week</button>
                                <button type="button" aria-pressed={range === 'month'} onClick={() => setRange('month')}>Month</button>
                            </span>
                        </h4>
                        <div className="ais-table-wrap">
                            <table className="ais-table">
                                <thead>
                                    <tr><th /><th>{`Last ${period.days} days`}</th><th>{`${period.days} days before`}</th><th>Change</th></tr>
                                </thead>
                                <tbody>
                                    {rows.map(r => (
                                        <tr key={r.label}>
                                            <td>{r.label}</td>
                                            <td>{cell(r.pick(period.current), logsLoading)}</td>
                                            <td>{cell(r.pick(period.previous), logsLoading)}</td>
                                            <td><Change now={r.pick(period.current)} before={r.pick(period.previous)} good={r.good} /></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {(s.groups.length > 1 || s.people.length > 0) && (
                    <div className="ais-stack">
                        {s.groups.length > 1 && (
                            <div>
                                <h4 className="ais-h">{`By ${t.group}`}</h4>
                                <div className="ais-table-wrap">
                                    <table className="ais-table">
                                        <thead>
                                            <tr><th>{t.Group}</th><th>{t.Items}</th><th>Done</th><th>Overdue</th><th>Stuck</th></tr>
                                        </thead>
                                        <tbody>
                                            {s.groups.map(g => (
                                                <tr key={g.id}>
                                                    <td title={g.title}><i className="ais-dot" style={{ background: g.color }} />{g.title}</td>
                                                    <td>{g.total}</td>
                                                    <td><Progress pct={g.pct} /></td>
                                                    <td className={g.overdue ? 'is-bad' : 'is-zero'}>{g.overdue}</td>
                                                    <td className={g.stuck ? 'is-warn' : 'is-zero'}>{g.stuck}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {s.people.length > 0 && (
                            <div>
                                <h4 className="ais-h">By person</h4>
                                <div className="ais-table-wrap">
                                    <table className="ais-table">
                                        <thead>
                                            <tr><th>Person</th><th>Open</th><th>Overdue</th><th>Done</th></tr>
                                        </thead>
                                        <tbody>
                                            {people.map(p => (
                                                <tr key={p.id}>
                                                    <td title={p.name}>{p.name}</td>
                                                    <td className={p.open ? '' : 'is-zero'}>{p.open}</td>
                                                    <td className={p.overdue ? 'is-bad' : 'is-zero'}>{p.overdue}</td>
                                                    <td className={p.done ? '' : 'is-zero'}>{p.done}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                {s.people.length > PEOPLE_SHOWN && (
                                    <button type="button" className="ais-more" onClick={() => setAllPeople(v => !v)}>
                                        {allPeople ? 'Show fewer' : `Show all ${s.people.length}`}
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>

            <p className="ais-limit">
                <Info size={13} aria-hidden="true" />
                {`Works from the numbers only: it doesn't read what the ${t.updates} say. Status labels are taken as done, stuck or skipped by their words.`}
            </p>
        </section>
    );
};
