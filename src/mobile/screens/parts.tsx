import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowRight, Star } from 'lucide-react';
import type { Board, Workspace } from '../../types';
import { useBoardStore } from '../../store/useBoardStore';
import { BoardGlyph, WorkspaceBadge, relativeTime } from '../ui';
import { workspacePath } from './data';

/** The white square arrow on a card's title row ("My favorites →"). */
export const ArrowButton = ({ label, onClick }: { label: string; onClick: () => void }) => (
    <button type="button" className="m-arrow-btn" aria-label={label} title={label} onClick={onClick}>
        <ArrowRight size={19} strokeWidth={2} />
    </button>
);

/** A favourite star that toggles the board's favourite state. */
export const StarButton = ({ board }: { board: Board }) => {
    const toggleFavorite = useBoardStore(state => state.toggleFavorite);
    return (
        <button
            type="button"
            className="m-star-btn"
            aria-label={board.isFavorite ? `Remove ${board.title} from favorites` : `Add ${board.title} to favorites`}
            aria-pressed={!!board.isFavorite}
            onClick={(e) => {
                e.stopPropagation();
                void toggleFavorite(board.id);
            }}
        >
            <Star
                size={22}
                strokeWidth={1.8}
                color={board.isFavorite ? '#ffcb00' : 'hsl(var(--m-text-3))'}
                fill={board.isFavorite ? '#ffcb00' : 'none'}
            />
        </button>
    );
};

/** A board in a list: tile, title, breadcrumb, when it was last visited, star. */
export const BoardRow = ({ board, workspaces, shared, onOpen, metaOverride, showStar = true }: {
    board: Board;
    workspaces: Workspace[];
    shared: boolean;
    onOpen: () => void;
    metaOverride?: ReactNode;
    showStar?: boolean;
}) => (
    <div className="m-row" role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(); }}>
        <span className="m-row__tile">
            <BoardGlyph size={30} isPrivate={!!board.is_private} shared={shared && !board.is_private} />
        </span>
        <span className="m-row__body">
            <span className="m-row__title">{board.title}</span>
            {metaOverride ?? (
                <>
                    <span className="m-row__meta">{workspacePath(board.workspaceId, workspaces)}</span>
                    {board.lastViewedAt && <span className="m-row__meta">Visited {relativeTime(board.lastViewedAt)}</span>}
                </>
            )}
        </span>
        {showStar && <StarButton board={board} />}
    </div>
);

/** A workspace in a list: its letter tile, title and a line underneath. */
export const WorkspaceRow = ({ workspace, meta, onOpen, indent = 0 }: {
    workspace: Workspace;
    meta?: ReactNode;
    onOpen: () => void;
    indent?: number;
}) => (
    <div
        className="m-row"
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(e) => { if (e.key === 'Enter') onOpen(); }}
        style={indent ? { paddingLeft: indent * 20 } : undefined}
    >
        <span className="m-row__tile">
            <WorkspaceBadge title={workspace.title} size={30} />
        </span>
        <span className="m-row__body">
            <span className="m-row__title">{workspace.title}</span>
            {meta && <span className="m-row__meta">{meta}</span>}
        </span>
    </div>
);

/**
 * Which page of a horizontally snapping strip is showing, for its dots. Reads
 * the strip's scroll position on scroll (once per frame).
 */
export const usePagedScroll = (pageCount: number) => {
    const ref = useRef<HTMLDivElement>(null);
    const [page, setPage] = useState(0);
    const frame = useRef(0);

    const onScroll = useCallback(() => {
        if (frame.current) return;
        frame.current = requestAnimationFrame(() => {
            frame.current = 0;
            const el = ref.current;
            if (!el || pageCount <= 1) return;
            const max = el.scrollWidth - el.clientWidth;
            const ratio = max > 0 ? el.scrollLeft / max : 0;
            setPage(Math.max(0, Math.min(pageCount - 1, Math.round(ratio * (pageCount - 1)))));
        });
    }, [pageCount]);

    useEffect(() => () => cancelAnimationFrame(frame.current), []);
    useEffect(() => {
        if (page > pageCount - 1) setPage(Math.max(0, pageCount - 1));
    }, [page, pageCount]);

    return { ref, page, onScroll };
};

export const Dots = ({ count, active, label }: { count: number; active: number; label: string }) =>
    count > 1 ? (
        <div className="m-dots" role="img" aria-label={`${label}: page ${active + 1} of ${count}`}>
            {Array.from({ length: count }, (_, i) => (
                <span key={i} className={`m-dots__dot${i === active ? ' m-dots__dot--active' : ''}`} />
            ))}
        </div>
    ) : null;

/** A row in an action sheet ("New board", "Copy link", "Delete"). */
export const ActionRow = ({ icon, label, onClick, danger = false, disabled = false, right }: {
    icon?: ReactNode;
    label: ReactNode;
    onClick: () => void;
    danger?: boolean;
    disabled?: boolean;
    right?: ReactNode;
}) => (
    <button
        type="button"
        className={`m-action-row${danger ? ' m-action-row--danger' : ''}`}
        onClick={onClick}
        disabled={disabled}
        style={disabled ? { opacity: 0.45 } : undefined}
    >
        {icon && <span className="m-action-row__icon">{icon}</span>}
        <span style={{ flex: 1, minWidth: 0 }}>{label}</span>
        {right}
    </button>
);
