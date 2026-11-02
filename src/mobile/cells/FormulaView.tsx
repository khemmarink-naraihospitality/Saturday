import { memo, useMemo } from 'react';
import { Check, TriangleAlert } from 'lucide-react';
import type { Column, Item } from '../../types';
import { useBoardStore } from '../../store/useBoardStore';
import { useToday } from '../../hooks/useToday';
import { siblingColumns } from '../../lib/columnScope';
import { formatFormulaDate, formatFormulaNumber, formulaCell, formulaContext, summarizeFormula } from '../../lib/formula';
import { tintLabel } from '../../lib/labelTint';
import { useNewUi } from '../../lib/brand';
import { StatusPill } from '../../components/common/StatusPill';
import { CountsText } from '../../components/common/CountsText';

/** The board's columns, for the formula's {…} — the same set the desktop reads. */
const useBoardColumns = (boardId: string | undefined) =>
    useBoardStore(state => (boardId ? state.boards.find(b => b.id === boardId)?.columns : undefined));

/**
 * A Formula column's result on the phone: the same result as the desktop cell
 * (src/lib/formula), drawn at the phone's sizes. Read-only — a formula is
 * changed on the desktop, from its column header.
 */
export const FormulaView = memo(({ column, item, variant }: { column: Column; item: Item; variant: 'table' | 'detail' }) => {
    const columns = useBoardColumns(item.boardId);
    const members = useBoardStore(state => state.activeBoardMembers);
    const today = useToday();
    const newUi = useNewUi();
    const table = variant === 'table';
    const display = useMemo(
        () => formulaCell(column, item, siblingColumns(columns || [], column), formulaContext(today)),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [column, item, columns, today, members]
    );

    switch (display.kind) {
        case 'empty':
            return table ? null : <span className="m-detail-empty">—</span>;
        case 'label':
            if (newUi) {
                return table
                    ? <span className="m-cell-center"><StatusPill color={display.color!} label={display.text} /></span>
                    : <StatusPill color={display.color!} label={display.text} />;
            }
            return table
                ? <span className="m-cell-center"><span className="m-status-pill m-formula-pill" style={{ backgroundColor: tintLabel(display.color) }}>{display.text}</span></span>
                : <span className="m-status-pill" style={{ backgroundColor: tintLabel(display.color) }}>{display.text}</span>;
        case 'bool':
            return (
                <span className={table ? 'm-cell-center' : undefined}>
                    <span className={`m-check${display.bool ? ' m-check--on' : ''}`} role="img" aria-label={display.bool ? 'Yes' : 'No'}>
                        {display.bool && <Check size={16} strokeWidth={3} />}
                    </span>
                </span>
            );
        case 'error':
            return (
                <span className={`${table ? 'm-cell-text m-cell-text--center' : 'm-detail-text'} m-formula-error`} title={display.title}>
                    <TriangleAlert size={14} strokeWidth={2} /> {display.text}
                </span>
            );
        default: {
            const align = column.numberAlign || (display.kind === 'number' ? 'left' : 'left');
            return (
                <span
                    className={table ? 'm-cell-text' : 'm-detail-text'}
                    style={table ? { justifyContent: align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start' } : undefined}
                >
                    {table ? <span className="m-truncate">{display.text}</span> : display.text}
                </span>
            );
        }
    }
});
FormulaView.displayName = 'FormulaView';

/** A Formula column's roll-up in a group's footer row, from its rows' results. */
export const FormulaSummaryView = memo(({ column, items, color }: { column: Column; items: Item[]; color?: string }) => {
    const columns = useBoardColumns(items[0]?.boardId);
    const today = useToday();
    const newUi = useNewUi();
    const summary = useMemo(
        () => summarizeFormula(column, items, siblingColumns(columns || [], column), formulaContext(today)),
        [column, items, columns, today]
    );

    switch (summary.kind) {
        case 'number': {
            const aggregation = column.aggregation && column.aggregation !== 'none' ? column.aggregation : 'sum';
            const v = summary.values;
            const result = aggregation === 'count' ? v.length : aggregation === 'avg' ? summary.sum / v.length
                : aggregation === 'min' ? Math.min(...v) : aggregation === 'max' ? Math.max(...v) : summary.sum;
            return (
                <span className="m-summary-number">
                    <span className="m-truncate">{aggregation === 'count' ? result : formatFormulaNumber(result, column)}</span>
                    <span className="m-summary-number__label">{aggregation}</span>
                </span>
            );
        }
        case 'labels': {
            if (newUi) return <span className="m-cell-center"><CountsText parts={summary.parts} /></span>;
            const total = Math.max(items.length, 1);
            return (
                <span className="m-summary-bar" role="img" aria-label="Results breakdown">
                    {summary.parts.map(p => <span key={p.key} style={{ width: `${(p.count / total) * 100}%`, backgroundColor: tintLabel(p.color) }} />)}
                    {summary.empty > 0 && <span style={{ width: `${(summary.empty / total) * 100}%`, backgroundColor: tintLabel('#c4c4c4') }} />}
                </span>
            );
        }
        case 'dates': {
            const from = formatFormulaDate(summary.min, today);
            const to = formatFormulaDate(summary.max, today);
            const text = from === to ? from : `${from} - ${to}`;
            return newUi
                ? <span className="m-cell-center"><span className="nhg-summary-range">{text}</span></span>
                : <span className="m-cell-center"><span className="m-timeline-pill" style={{ backgroundColor: color || 'hsl(var(--m-accent))' }}>{text}</span></span>;
        }
        default:
            return null;
    }
});
FormulaSummaryView.displayName = 'FormulaSummaryView';
