import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

const CLOSE_MS = 180;

/**
 * NHG's popup: a centred glass sheet over a frosted veil, with a tracked
 * eyebrow, a serif title and a round close button (the "NHG Tasks" item
 * popup). Where Saturday slides a SidePanel in, NHG opens one of these. It
 * stays mounted for the length of the exit animation, closes on Escape or a
 * click on the veil, and gives focus back to what opened it.
 * Styles: nhg_glass.css (.nhg-popup*).
 */
export const PopupPanel = ({ isOpen, onClose, eyebrow, title, children, width = 720, bare = false }: {
    isOpen: boolean;
    onClose: () => void;
    eyebrow?: string;
    title: string;
    children: ReactNode;
    width?: number;
    /** The content brings its own header and close button (an item's comments, the notifications page): the sheet is just its frame. */
    bare?: boolean;
}) => {
    const [mounted, setMounted] = useState(isOpen);
    const [closing, setClosing] = useState(false);
    const opener = useRef<Element | null>(null);
    const sheet = useRef<HTMLDivElement>(null);
    // Held through the exit animation: the parent usually passes nothing once closed
    const lastChildren = useRef<ReactNode>(children);
    if (isOpen) lastChildren.current = children;

    useEffect(() => {
        if (isOpen) {
            opener.current = document.activeElement;
            setMounted(true);
            setClosing(false);
            return;
        }
        if (!mounted) return;
        setClosing(true);
        const timer = window.setTimeout(() => { setMounted(false); setClosing(false); }, CLOSE_MS);
        return () => window.clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        sheet.current?.focus();
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
        window.addEventListener('keydown', onKey, true);
        return () => {
            window.removeEventListener('keydown', onKey, true);
            (opener.current as HTMLElement | null)?.focus?.();
        };
    }, [isOpen, onClose]);

    if (!mounted) return null;

    return createPortal(
        <div
            className={`nhg-popup-veil${closing ? ' is-closing' : ''}`}
            onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div
                ref={sheet}
                className={`nhg-popup${bare ? ' nhg-popup--bare' : ''}`}
                role="dialog"
                aria-modal="true"
                aria-labelledby={bare ? undefined : 'nhg-popup-title'}
                aria-label={bare ? title : undefined}
                tabIndex={-1}
                style={{ maxWidth: width }}
            >
                {!bare && (
                    <header className="nhg-popup__head">
                        <div className="nhg-popup__titles">
                            {eyebrow && <span className="nhg-popup__eyebrow">{eyebrow}</span>}
                            <h2 id="nhg-popup-title" className="nhg-popup__title">{title}</h2>
                        </div>
                        <button type="button" className="nhg-popup__close" onClick={onClose} aria-label="Close">
                            <X size={18} />
                        </button>
                    </header>
                )}
                <div className="nhg-popup__body">{isOpen ? children : lastChildren.current}</div>
            </div>
        </div>,
        document.body
    );
};
