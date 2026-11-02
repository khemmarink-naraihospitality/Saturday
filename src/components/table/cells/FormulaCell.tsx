import { memo, useMemo } from 'react';
import { Check, TriangleAlert } from 'lucide-react';
import type { Column, Item } from '../../../types';
import { useBoardStore } from '../../../store/useBoardStore';
import { useToday } from '../../../hooks/useToday';
import { formulaCell, formulaContext } from '../../../lib/formula';
import { siblingColumns } from '../../../lib/columnScope';
import { columnJustify } from '../../../lib/utils';
import { tintLabel, LABEL_TEXT } from '../../../lib/labelTint';
import { useNewUi } from '../../../lib/brand';
import { StatusPill } from '../../common/StatusPill';

/**
 * A Formula column's cell: the row's result, worked out from its other columns
 * (src/lib/formula). Nothing to edit here — the formula itself is edited from
 * the column header. A label result is drawn the way a Status cell is, so a
 * rule like "Overdue when the Timeline has passed" reads as a status.
 */
export const FormulaCell = memo(({ item, column }: { item: Item; column: Column }) => {
    const columns = useBoardStore(state => state.boards.find(b => b.id === item.boardId)?.columns);
    // {Person} reads names, which arrive with the board's members.
    const members = useBoardStore(state => state.activeBoardMembers);
    const today = useToday();
    const newUi = useNewUi();

    const display = useMemo(
        () => formulaCell(column, item, siblingColumns(columns || [], column), formulaContext(today)),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [column, item, columns, today, members]
    );

    if (display.kind === 'label') {
        return newUi ? (
            <div className="table-cell status-cell-pill formula-cell--readonly">
                <StatusPill color={display.color!} label={display.text} />
            </div>
        ) : (
            <div
                className="table-cell status-cell-full formula-cell--readonly"
                title={display.text}
                style={{
                    width: '100%',
                    height: '100%',
                    padding: '0 8px',
                    backgroundColor: tintLabel(display.color),
                    color: LABEL_TEXT,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textAlign: 'center',
                    fontWeight: 500,
                    fontSize: '13px',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    userSelect: 'none',
                    letterSpacing: '0.01em'
                }}
            >
                <span className="formula-cell__text">{display.text}</span>
            </div>
        );
    }

    return (
        <div
            className={`table-cell formula-cell formula-cell--${display.kind}`}
            style={{ justifyContent: columnJustify(column.numberAlign, 'center') }}
            title={display.kind === 'error' ? `${display.text} — ${display.title}` : display.kind === 'text' ? display.text : undefined}
        >
            {display.kind === 'error' ? (
                <span className="formula-cell__error"><TriangleAlert size={13} strokeWidth={2} />{display.text}</span>
            ) : display.kind === 'bool' ? (
                display.bool ? <span className="formula-cell__check" aria-label="Yes"><Check size={13} strokeWidth={3} /></span> : <span className="formula-cell__no" aria-label="No">–</span>
            ) : (
                <span className="formula-cell__text">{display.text}</span>
            )}
        </div>
    );
});
FormulaCell.displayName = 'FormulaCell';
