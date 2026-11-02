import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
    AlignLeft, Calendar, CalendarClock, Check, CheckSquare, ChevronDownSquare, CircleDot, GanttChart, Hash, Link2, Paperclip,
    Sigma, Star, TriangleAlert, Type, Users, type LucideIcon,
} from 'lucide-react';
import type { Column, ColumnType } from '../../types';
import type { FormulaDisplay } from '../../lib/formula';
import { LABEL_COLORS } from '../../lib/labelColors';
import { tintLabel, LABEL_TEXT } from '../../lib/labelTint';
import { StatusPill } from '../common/StatusPill';

export const COLUMN_TYPE_ICON: Record<ColumnType, LucideIcon> = {
    text: Type,
    long_text: AlignLeft,
    status: CircleDot,
    dropdown: ChevronDownSquare,
    date: Calendar,
    due_date: CalendarClock,
    timeline: GanttChart,
    number: Hash,
    people: Users,
    checkbox: CheckSquare,
    link: Link2,
    files: Paperclip,
    priority: Star,
    formula: Sigma,
};

export const TypeIcon = ({ type, size = 14 }: { type: ColumnType | 'name'; size?: number }) => {
    const Icon = type === 'name' ? Type : COLUMN_TYPE_ICON[type] || Type;
    return <Icon size={size} strokeWidth={1.9} aria-hidden="true" />;
};

/** A result drawn small, the way its cell draws it (preview rows, the result list). */
export const ResultChip = ({ display, newUi }: { display: FormulaDisplay; newUi: boolean }) => {
    switch (display.kind) {
        case 'empty':
            return <span className="fx-result fx-result--empty">—</span>;
        case 'label':
            return newUi
                ? <StatusPill color={display.color!} label={display.text} />
                : <span className="fx-result fx-result--label" style={{ backgroundColor: tintLabel(display.color), color: LABEL_TEXT }}>{display.text}</span>;
        case 'bool':
            return display.bool
                ? <span className="fx-result fx-result--yes"><Check size={13} strokeWidth={3} /> Yes</span>
                : <span className="fx-result fx-result--no">No</span>;
        case 'error':
            return <span className="fx-result fx-result--error" title={display.title}><TriangleAlert size={13} strokeWidth={2} />{display.text}<span className="fx-result__why">{display.title}</span></span>;
        default:
            return <span className={`fx-result fx-result--${display.kind}`}>{display.text}</span>;
    }
};

/**
 * A floating panel under (or above) an anchor, in a portal so the editor's
 * scrolling body can't clip it. Closes on a click outside or Escape.
 */
export const Popover = ({ anchor, onClose, children, width = 260 }: {
    anchor: HTMLElement | null;
    onClose: () => void;
    children: ReactNode;
    width?: number;
}) => {
    const panel = useRef<HTMLDivElement>(null);
    const [style, setStyle] = useState<CSSProperties>({ visibility: 'hidden' });

    useLayoutEffect(() => {
        if (!anchor || !panel.current) return;
        const r = anchor.getBoundingClientRect();
        const h = panel.current.offsetHeight;
        const below = r.bottom + 6 + h < window.innerHeight - 8;
        setStyle({
            top: below ? r.bottom + 6 : Math.max(8, r.top - 6 - h),
            left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)),
            width,
        });
    }, [anchor, width]);

    useEffect(() => {
        const onDown = (e: MouseEvent) => {
            const t = e.target as Node;
            if (panel.current?.contains(t) || anchor?.contains(t)) return;
            onClose();
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
        };
        document.addEventListener('mousedown', onDown, true);
        document.addEventListener('keydown', onKey, true);
        return () => {
            document.removeEventListener('mousedown', onDown, true);
            document.removeEventListener('keydown', onKey, true);
        };
    }, [anchor, onClose]);

    return createPortal(<div ref={panel} className="fx-popover" style={style}>{children}</div>, document.body);
};

/** A colour button that opens the label palette (the same one Status labels use). */
export const ColorButton = ({ color, onChange, label = 'Label colour' }: { color: string; onChange: (c: string) => void; label?: string }) => {
    const [open, setOpen] = useState(false);
    const button = useRef<HTMLButtonElement>(null);
    return (
        <>
            <button
                ref={button}
                type="button"
                className="fx-color-btn"
                aria-label={label}
                title={label}
                onClick={() => setOpen(o => !o)}
            >
                <span className="fx-color-btn__dot" style={{ backgroundColor: tintLabel(color) }} />
            </button>
            {open && (
                <Popover anchor={button.current} onClose={() => setOpen(false)} width={236}>
                    <div className="fx-palette" role="listbox" aria-label={label}>
                        {LABEL_COLORS.map(c => (
                            <button
                                key={c}
                                type="button"
                                role="option"
                                aria-selected={c.toLowerCase() === color.toLowerCase()}
                                className={`fx-palette__swatch${c.toLowerCase() === color.toLowerCase() ? ' is-on' : ''}`}
                                style={{ backgroundColor: tintLabel(c) }}
                                onClick={() => { onChange(c); setOpen(false); }}
                                title={c}
                            />
                        ))}
                    </div>
                </Popover>
            )}
        </>
    );
};

/** A small select styled for the editor. */
export const Select = ({ value, onChange, children, label, className = '', disabled }: {
    value: string;
    onChange: (value: string) => void;
    children: ReactNode;
    label: string;
    className?: string;
    disabled?: boolean;
}) => (
    <select className={`fx-select ${className}`} value={value} onChange={e => onChange(e.target.value)} aria-label={label} disabled={disabled}>
        {children}
    </select>
);

/** Whether this column can be read by a formula (not the formula itself). */
export const readableColumns = (siblings: Column[], selfId: string) => siblings.filter(c => c.id !== selfId);
