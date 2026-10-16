import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useDragControls, type PanInfo } from 'framer-motion';
import { X } from 'lucide-react';
import { useHistoryOverlay } from '../nav/useHistoryOverlay';

export interface BottomSheetProps {
    open: boolean;
    onClose: () => void;
    /** Centred in the header. Omit together with `bare` for a headerless sheet. */
    title?: ReactNode;
    /** Right side of the header: an "Edit" link, a "Save" button. */
    headerRight?: ReactNode;
    /** Replaces the X on the left (e.g. a "Cancel" text button). */
    headerLeft?: ReactNode;
    /** 'auto' grows with its content up to near the top; 'medium' is a fixed
     *  half-and-a-bit, like the cell editors in references 21–25, so the row
     *  being edited stays in sight above it; 'tall' reaches near the top;
     *  'full' covers the whole screen (the item screen). */
    size?: 'auto' | 'medium' | 'tall' | 'full';
    /** No header row at all; the children draw their own. */
    bare?: boolean;
    /** Pinned under the scrolling body (a composer, a button row). */
    footer?: ReactNode;
    /** Tap-outside and swipe-down close it. On by default. */
    dismissible?: boolean;
    ariaLabel?: string;
    testId?: string;
    bodyStyle?: CSSProperties;
    /** Extra class on the panel, for a sheet with its own look (the item screen). */
    className?: string;
    children: ReactNode;
}

/** A 'medium' sheet: 54% of the screen, but room for a month calendar on a small phone. */
export const MEDIUM_SHEET_HEIGHT = 'max(54dvh, min(500px, calc(100dvh - var(--m-sheet-gap))))';

/** The same in pixels, for code that has to keep something clear of the sheet. */
export const mediumSheetHeightPx = (viewportHeight: number) =>
    Math.max(viewportHeight * 0.54, Math.min(500, viewportHeight - 56));

/**
 * The phone layout's one sheet: slides up from the bottom over a dimmed page,
 * closes on X, a tap on the dimmed page, a swipe down on its header, Escape, or
 * the back gesture (it owns a history entry while open — useHistoryOverlay).
 * Rendered into document.body so it sits above every screen and the tab bar.
 */
export const BottomSheet = (props: BottomSheetProps) => {
    // Here rather than in the panel: the panel stays mounted through its closing
    // animation, and the history entry has to come off the moment the sheet
    // closes — before whatever the tap that closed it navigates to next.
    useHistoryOverlay(props.open, props.onClose);
    return createPortal(
        <AnimatePresence>{props.open && <SheetPanel {...props} />}</AnimatePresence>,
        document.body
    );
};

const SheetPanel = ({
    onClose,
    title,
    headerRight,
    headerLeft,
    size = 'auto',
    bare = false,
    footer,
    dismissible = true,
    ariaLabel,
    testId,
    bodyStyle,
    className,
    children
}: BottomSheetProps) => {
    const dragControls = useDragControls();
    const panelRef = useRef<HTMLDivElement>(null);
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;

    useEffect(() => {
        // Children mount first: if one took focus on purpose (an autofocused
        // field, which is what brings up the phone keyboard), leave it there.
        const panel = panelRef.current;
        if (panel && !panel.contains(document.activeElement)) panel.focus({ preventScroll: true });
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onCloseRef.current();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, []);

    const canDrag = dismissible && size !== 'full';
    const onDragEnd = (_: unknown, info: PanInfo) => {
        if (info.offset.y > 110 || info.velocity.y > 650) onClose();
    };

    const panelStyle: CSSProperties | undefined = size === 'tall'
        ? { height: 'calc(100dvh - var(--m-sheet-gap))' }
        : size === 'medium'
            ? { height: MEDIUM_SHEET_HEIGHT }
            : undefined;

    return (
        <div className="m-portal">
            <motion.div
                className="m-sheet-scrim"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                onClick={dismissible ? onClose : undefined}
            />
            <motion.div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-label={ariaLabel ?? (typeof title === 'string' ? title : undefined)}
                tabIndex={-1}
                data-testid={testId}
                className={`m-sheet${size === 'full' ? ' m-sheet--full' : ''}${className ? ` ${className}` : ''}`}
                style={panelStyle}
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%', transition: { duration: 0.22, ease: [0.4, 0, 1, 1] } }}
                transition={{ type: 'spring', damping: 34, stiffness: 380, mass: 0.9 }}
                drag={canDrag ? 'y' : false}
                dragControls={dragControls}
                dragListener={false}
                dragConstraints={{ top: 0, bottom: 0 }}
                dragElastic={{ top: 0, bottom: 0.7 }}
                onDragEnd={onDragEnd}
            >
                {!bare && (
                    <div
                        className="m-sheet__header"
                        onPointerDown={canDrag ? (e) => dragControls.start(e) : undefined}
                        style={{ touchAction: canDrag ? 'none' : undefined }}
                    >
                        <div>
                            {headerLeft ?? (
                                <button className="m-sheet__close" onClick={onClose} aria-label="Close">
                                    <X size={26} strokeWidth={2} />
                                </button>
                            )}
                        </div>
                        <div className="m-sheet__title">{title}</div>
                        <div className="m-sheet__right">{headerRight}</div>
                    </div>
                )}
                <div className="m-sheet__body" style={bodyStyle}>{children}</div>
                {footer}
            </motion.div>
        </div>
    );
};
