
import React, { memo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Column } from '../../../types';
import { useBoardStore } from '../../../store/useBoardStore';
import { Star } from 'lucide-react';
import { useNewUi } from '../../../lib/brand';
import { PRIORITY_LEVELS, priorityLevel, toRating } from '../../../lib/priority';
import { StatusPill } from '../../common/StatusPill';

interface PriorityCellProps {
    itemId: string;
    column: Column;
    value: any;
}

const MAX_STARS = 5;
const STAR_COLOR = '#fdab3d';

// Stored as a plain number 1-5; toRating reads anything else as 0 (unrated).

export const PriorityCell: React.FC<PriorityCellProps> = memo(({ itemId, column, value }) => {
    const newUi = useNewUi();
    if (newUi) return <PriorityLabelCell itemId={itemId} column={column} value={value} />;
    return <PriorityStarsCell itemId={itemId} column={column} value={value} />;
});

const PriorityStarsCell: React.FC<PriorityCellProps> = ({ itemId, column, value }) => {
    const updateItemValue = useBoardStore(state => state.updateItemValue);
    const rating = toRating(value);
    const [hovered, setHovered] = useState(0);

    // Hovering previews the rating a click would set, so the count is readable
    // before committing to it.
    const shown = hovered || rating;

    const apply = (star: number) => {
        // Clicking the star that already holds the rating clears it. Without
        // this a 1-star row could never be put back to unrated.
        updateItemValue(itemId, column.id, star === rating ? null : star);
    };

    return (
        <div
            className="table-cell"
            onMouseLeave={() => setHovered(0)}
            title={rating ? `Priority ${rating} of ${MAX_STARS}` : 'Not prioritised'}
            style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '2px',
                padding: 0
            }}
        >
            {Array.from({ length: MAX_STARS }, (_, i) => i + 1).map(star => {
                const filled = star <= shown;
                return (
                    <Star
                        key={star}
                        size={16}
                        onMouseEnter={() => setHovered(star)}
                        onClick={() => apply(star)}
                        color={filled ? STAR_COLOR : 'hsl(var(--color-text-tertiary))'}
                        fill={filled ? STAR_COLOR : 'none'}
                        style={{
                            cursor: 'pointer',
                            flexShrink: 0,
                            transition: 'color 0.1s ease, fill 0.1s ease'
                        }}
                    />
                );
            })}
        </div>
    );
};

/**
 * NHG: the rating as a word (src/lib/priority.ts). A click opens High / Medium
 * / Low / Clear; picking the level the row already has leaves its rating as it
 * is, so a 4 stays a 4.
 */
const PriorityLabelCell: React.FC<PriorityCellProps> = ({ itemId, column, value }) => {
    const updateItemValue = useBoardStore(state => state.updateItemValue);
    const level = priorityLevel(value);
    const [menu, setMenu] = useState<{ top: number; left: number; width: number } | null>(null);
    const cellRef = useRef<HTMLDivElement>(null);

    const open = () => {
        const rect = cellRef.current?.getBoundingClientRect();
        if (rect) setMenu({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    };

    const pick = (rating: number | null, id?: string) => {
        setMenu(null);
        if (id && id === level?.id) return;
        updateItemValue(itemId, column.id, rating);
    };

    return (
        <>
            <div
                ref={cellRef}
                className="table-cell nhg-priority-cell"
                onClick={open}
                title={level ? `Priority: ${level.label}` : 'Set priority'}
            >
                {level && <StatusPill color={level.color} label={level.label} />}
            </div>
            {menu && createPortal(
                <>
                    <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }} onClick={() => setMenu(null)} />
                    <div className="nhg-priority-menu" role="menu" style={{ top: menu.top, left: menu.left, minWidth: Math.max(menu.width, 160) }}>
                        {PRIORITY_LEVELS.map(l => (
                            <button key={l.id} type="button" role="menuitemradio" aria-checked={level?.id === l.id} className="nhg-status-option" onClick={() => pick(l.rating, l.id)}>
                                <StatusPill color={l.color} label={l.label} />
                            </button>
                        ))}
                        {level && (
                            <button type="button" role="menuitem" className="nhg-priority-menu__clear" onClick={() => pick(null)}>
                                Clear
                            </button>
                        )}
                    </div>
                </>,
                document.body
            )}
        </>
    );
};
