import { memo, useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, MessageCircle, MessageCirclePlus, Plus } from 'lucide-react';
import type { Column, Item } from '../../../types';
import { CellView, SummaryView, activateCell, columnWidthFor, UPDATES_COLUMN_WIDTH } from '../../cells';
import type { PersonInfo } from '../../ui';
import { GUTTER } from './layout';
import { useNewUi } from '../../../lib/brand';
import { countOf, useTerms } from '../../../lib/terms';

/**
 * The rows of the phone table. Every row is [gutter][frozen name cell][spacer]
 * [updates][columns…]: the name cell is position: sticky so it stays put when
 * the table scrolls sideways, and the spacer grows as the name cell narrows
 * (--m-name-w), so the columns never move relative to the content.
 */

export interface RowContext {
    boardId: string;
    canEdit: boolean;
    people: Map<string, PersonInfo>;
    itemTitle: string;
    /** NHG's New UI (src/lib/brand.ts) and its words for rows (src/lib/terms.ts). */
    newUi: boolean;
    item: string;
    items: string;
    subitem: string;
    subitems: string;
}

const NameCell = ({ children, bar, className = '', style }: {
    children: ReactNode;
    /** The group colour bar on the left edge, with which corners it rounds. */
    bar?: { color: string; roundTop?: boolean; roundBottom?: boolean; indent?: boolean };
    className?: string;
    style?: CSSProperties;
}) => {
    // NHG draws no colour bar beside a group's rows: its header row is tinted instead
    const newUi = useNewUi();
    return (
        <div className={`m-tr__name ${className}`.trim()} style={style}>
            {bar && !newUi && (
                <span
                    className="m-tr__bar"
                    style={{
                        backgroundColor: bar.color,
                        borderTopLeftRadius: bar.roundTop ? 7 : 0,
                        borderBottomLeftRadius: bar.roundBottom ? 7 : 0,
                    }}
                />
            )}
            {children}
        </div>
    );
};

const Lead = () => <><span className="m-tr__gutter" style={{ width: GUTTER }} /></>;
const Spacer = () => <span className="m-tr__spacer" />;

/**
 * A group's header: collapse chevron and title in the group colour, then every
 * column's title. NHG tints the whole row with the group's colour instead
 * (--group-color, mobile.css) and deepens the title toward ink.
 */
export const GroupHeaderRow = memo(({ title, color, collapsed, columns, onToggle, sticky = false }: {
    title: string;
    color: string;
    collapsed: boolean;
    columns: Column[];
    onToggle: () => void;
    sticky?: boolean;
}) => {
    const newUi = useNewUi();
    const t = useTerms();
    return (
        <div className={`m-tr m-tr--group${sticky ? ' m-tr--sticky-copy' : ''}`} style={newUi ? { '--group-color': color } as CSSProperties : undefined}>
            <Lead />
            <NameCell className="m-tr__name--group">
                <button type="button" className="m-tr__group-toggle" onClick={onToggle} aria-expanded={!collapsed} style={newUi ? undefined : { color }}>
                    <ChevronDown size={19} strokeWidth={2.1} style={{ transform: collapsed ? 'rotate(-90deg)' : undefined, transition: 'transform 0.15s ease' }} />
                    <span className="m-tr__group-title">{title}</span>
                </button>
            </NameCell>
            <Spacer />
            <div className="m-tr__head" style={{ width: UPDATES_COLUMN_WIDTH }}><span>{t.Updates}</span></div>
            {columns.map(col => (
                <div key={col.id} className="m-tr__head" style={{ width: columnWidthFor(col) }}><span>{col.title}</span></div>
            ))}
        </div>
    );
});
GroupHeaderRow.displayName = 'GroupHeaderRow';

/** The speech bubble: how many updates, or an invitation to write the first. */
const UpdatesCell = ({ count, onOpen }: { count: number; onOpen: () => void }) => {
    const t = useTerms();
    return (
    <button type="button" className="m-tr__cell m-tr__updates" style={{ width: UPDATES_COLUMN_WIDTH }} onClick={onOpen} aria-label={count ? `${count} ${t.updates}` : `Write ${t.update === 'update' ? 'an update' : `a ${t.update}`}`}>
        {count > 0 ? (
            <span className="m-tr__bubble">
                <MessageCircle size={27} strokeWidth={1.5} />
                <span className="m-tr__bubble-count">{count > 99 ? '99+' : count}</span>
            </span>
        ) : (
            <MessageCirclePlus size={27} strokeWidth={1.4} className="m-tr__bubble-empty" />
        )}
    </button>
    );
};

/** An item or sub-item row. */
export const ItemRow = memo(({ item, columns, ctx, groupColor, isSub, subCount, expanded, updatesCount, roundTop, editingColumnId, onToggleExpand, onOpen, onOpenUpdates }: {
    item: Item;
    columns: Column[];
    ctx: RowContext;
    groupColor: string;
    isSub: boolean;
    subCount: number;
    expanded: boolean;
    updatesCount: number;
    roundTop: boolean;
    /** The column whose editor sheet is open on this row, outlined as in references 21 and 25. */
    editingColumnId?: string;
    onToggleExpand: (itemId: string) => void;
    onOpen: (itemId: string) => void;
    onOpenUpdates: (itemId: string) => void;
}) => (
    <div className={`m-tr m-tr--item${isSub ? ' m-tr--sub' : ''}`}>
        <Lead />
        <NameCell bar={{ color: groupColor, roundTop }}>
            {isSub ? (
                <span className="m-tr__sub-indent" aria-hidden="true" />
            ) : (
                (subCount > 0 || ctx.canEdit) ? (
                    <button
                        type="button"
                        className="m-tr__expand"
                        onClick={() => onToggleExpand(item.id)}
                        aria-expanded={expanded}
                        aria-label={expanded ? `Hide ${ctx.subitems}` : `Show ${ctx.subitems}`}
                    >
                        <ChevronRight size={15} strokeWidth={2} style={{ transform: expanded ? 'rotate(90deg)' : undefined, transition: 'transform 0.15s ease' }} />
                    </button>
                ) : <span className="m-tr__expand m-tr__expand--blank" aria-hidden="true" />
            )}
            {/* The sub-item count rides right after the name, truncated or not (ref 18, 20). */}
            <button type="button" className="m-tr__title" onClick={() => onOpen(item.id)}>
                <span className="m-tr__title-text">{item.title}</span>
                {!isSub && subCount > 0 && <span className="m-tr__count">{subCount}</span>}
            </button>
        </NameCell>
        <Spacer />
        <UpdatesCell count={updatesCount} onOpen={() => onOpenUpdates(item.id)} />
        {columns.map(col => {
            const value = item.values[col.id];
            return (
                <div
                    key={col.id}
                    className={`m-tr__cell${col.type === 'status' ? ' m-tr__cell--status' : ''}${col.id === editingColumnId ? ' m-tr__cell--editing' : ''}`}
                    style={{ width: columnWidthFor(col) }}
                    onClick={ctx.canEdit ? () => activateCell({ boardId: ctx.boardId, itemId: item.id, column: col, value }) : undefined}
                    role={ctx.canEdit ? 'button' : undefined}
                    aria-label={ctx.canEdit ? `${col.title}: edit` : undefined}
                >
                    <CellView column={col} value={value} item={item} people={ctx.people} variant="table" groupColor={groupColor} />
                </div>
            );
        })}
    </div>
));
ItemRow.displayName = 'ItemRow';

/** The inline "+ Add …" input, shared by groups and sub-items. */
const AddInput = ({ placeholder, value, onChange, onSubmit, onCancel }: {
    placeholder: string;
    value: string;
    onChange: (value: string) => void;
    onSubmit: () => void;
    onCancel: () => void;
}) => {
    const ref = useRef<HTMLInputElement>(null);
    useEffect(() => {
        ref.current?.focus({ preventScroll: true });
    }, []);
    return (
        <input
            ref={ref}
            className="m-tr__add-input"
            type="text"
            enterKeyHint="done"
            placeholder={placeholder}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); onSubmit(); }
                if (e.key === 'Escape') onCancel();
            }}
            onBlur={() => { if (!value.trim()) onCancel(); }}
            aria-label={placeholder}
        />
    );
};

/** A group's last row: "+ Add {Item}" (an inline input when tapped) and the column roll-ups. */
export const FooterRow = memo(({ label, columns, items, ctx, groupColor, adding, draft, onStartAdd, onDraft, onSubmit, onCancel }: {
    label: string;
    columns: Column[];
    items: Item[];
    ctx: RowContext;
    groupColor: string;
    adding: boolean;
    draft: string;
    onStartAdd: () => void;
    onDraft: (value: string) => void;
    onSubmit: () => void;
    onCancel: () => void;
}) => (
    <div className="m-tr m-tr--footer">
        <Lead />
        <NameCell bar={{ color: groupColor, roundBottom: true, roundTop: items.length === 0 }}>
            {adding ? (
                <AddInput placeholder={`New ${label}`} value={draft} onChange={onDraft} onSubmit={onSubmit} onCancel={onCancel} />
            ) : ctx.canEdit ? (
                <button type="button" className="m-tr__add" onClick={onStartAdd}>
                    <Plus size={18} strokeWidth={2.2} /> Add {label}
                </button>
            ) : (
                <span className="m-tr__footer-count">{ctx.newUi ? countOf(items.length, ctx.item, ctx.items) : <>{items.length} {items.length === 1 ? 'item' : 'items'}</>}</span>
            )}
        </NameCell>
        <Spacer />
        <div className="m-tr__cell" style={{ width: UPDATES_COLUMN_WIDTH }} />
        {columns.map(col => (
            <div key={col.id} className="m-tr__cell" style={{ width: columnWidthFor(col) }}>
                <SummaryView column={col} items={items} people={ctx.people} color={groupColor} />
            </div>
        ))}
    </div>
));
FooterRow.displayName = 'FooterRow';

/** The column titles of a parent's sub-items. */
export const SubHeaderRow = memo(({ columns, groupColor }: { columns: Column[]; groupColor: string }) => {
    const t = useTerms();
    return (
        <div className="m-tr m-tr--subhead">
            <Lead />
            <NameCell bar={{ color: groupColor }} className="m-tr__name--subhead">
                <span className="m-tr__sub-indent" aria-hidden="true" />
                <span className="m-tr__subhead-label">{t.Subitem}</span>
            </NameCell>
            <Spacer />
            <div className="m-tr__head m-tr__head--sub" style={{ width: UPDATES_COLUMN_WIDTH }} />
            {columns.map(col => (
                <div key={col.id} className="m-tr__head m-tr__head--sub" style={{ width: columnWidthFor(col) }}><span>{col.title}</span></div>
            ))}
        </div>
    );
});
SubHeaderRow.displayName = 'SubHeaderRow';

/** "+ Add subitem" under a parent's sub-items. */
export const SubFooterRow = memo(({ groupColor, ctx, adding, draft, onStartAdd, onDraft, onSubmit, onCancel }: {
    groupColor: string;
    ctx: RowContext;
    adding: boolean;
    draft: string;
    onStartAdd: () => void;
    onDraft: (value: string) => void;
    onSubmit: () => void;
    onCancel: () => void;
}) => (
    <div className="m-tr m-tr--subfoot">
        <Lead />
        <NameCell bar={{ color: groupColor }}>
            <span className="m-tr__sub-indent" aria-hidden="true" />
            {adding ? (
                <AddInput placeholder={`New ${ctx.subitem}`} value={draft} onChange={onDraft} onSubmit={onSubmit} onCancel={onCancel} />
            ) : ctx.canEdit ? (
                <button type="button" className="m-tr__add m-tr__add--sub" onClick={onStartAdd}>
                    <Plus size={16} strokeWidth={2.2} />{` Add ${ctx.subitem}`}
                </button>
            ) : null}
        </NameCell>
    </div>
));
SubFooterRow.displayName = 'SubFooterRow';
