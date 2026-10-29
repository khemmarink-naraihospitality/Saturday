import type { CSSProperties } from 'react';

/**
 * NHG's status label: a pill with a dot in the label's colour and the words in
 * ink, where Saturday paints the whole cell in the colour. `tag` drops the dot
 * for the smaller chips of a multi-label (dropdown) cell. The colour is the
 * stored one; nhg_ui.css mixes the pill's tint and ink from it, so it follows
 * light and dark without re-rendering. Only rendered under NHG.
 */
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
