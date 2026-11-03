import type { CSSProperties } from 'react';

/**
 * NHG's status label: a pill with a dot in the label's colour and the words in
 * ink, where Saturday paints the whole cell in the colour. `tag` drops the dot
 * for the smaller chips of a multi-label (dropdown) cell. The colour is the
 * stored one; nhg_ui.css mixes the pill's tint and ink from it, so it follows
 * light and dark without re-rendering. Only rendered under NHG.
 */
/**
 * NHG's status in a table cell: a rounded rectangle in the label's colour that
 * fills the cell (a little inset so its corners show), the words centred on it.
 * An empty status is the same block in neutral grey, so the cell is never a
 * hole in the column.
 */
export const StatusBlock = ({ color, label }: { color?: string; label?: string }) => (
    <span
        className={`status-block${label ? '' : ' status-block--empty'}`}
        style={{ '--block': color || '#c4c4c4' } as CSSProperties}
        title={label || undefined}
    >
        {label}
    </span>
);

export const StatusPill = ({ color, label, tag = false, className }: {
    color: string;
    label: string;
    tag?: boolean;
    className?: string;
}) => (
    <span
        className={`status-pill${tag ? ' status-pill--tag' : ''}${className ? ` ${className}` : ''}`}
        style={{ '--pill': color } as CSSProperties}
        title={label}
    >
        {!tag && <span className="status-pill__dot" />}
        <span className="status-pill__text">{label}</span>
    </span>
);
