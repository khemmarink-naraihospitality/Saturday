import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

const CLOSE_MS = 180;

/**
 * The popup: a centred sheet over a veil, with a tracked eyebrow, a serif (NHG)
 * or bold (Saturday) title and a close button. Space Activity, an item's
 * comments, Notifications and Contact support open in it. It stays mounted for
 * the length of the exit animation, closes on Escape or a click on the veil,
 * and gives focus back to what opened it. Styles: popup.css (every palette)
 * and the end of nhg_glass.css (NHG's glass).
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
            className={`app-popup-veil${closing ? ' is-closing' : ''}`}
            onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div
                ref={sheet}
                className={`app-popup${bare ? ' app-popup--bare' : ''}`}
                role="dialog"
                aria-modal="true"
                aria-labelledby={bare ? undefined : 'app-popup-title'}
                aria-label={bare ? title : undefined}
                tabIndex={-1}
                style={{ maxWidth: width }}
            >
                {!bare && (
                    <header className="app-popup__head">
                        <div className="app-popup__titles">
                            {eyebrow && <span className="app-popup__eyebrow">{eyebrow}</span>}
                            <h2 id="app-popup-title" className="app-popup__title">{title}</h2>
                        </div>
                        <button type="button" className="app-popup__close" onClick={onClose} aria-label="Close">
                            <X size={18} />
                        </button>
                    </header>
                )}
                <div className="app-popup__body">{isOpen ? children : lastChildren.current}</div>
            </div>
        </div>,
        document.body
    );
};
