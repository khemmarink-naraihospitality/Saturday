import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const STORAGE_KEY = 'saturday-side-panel-width';
const MIN_WIDTH = 420;
const maxAllowedWidth = () => Math.round(window.innerWidth * 0.9);

interface SidePanelProps {
    isOpen: boolean;
    onClose: () => void;
    children: React.ReactNode;
    width?: string;
}

export const SidePanel = ({ isOpen, onClose, children, width = '800px' }: SidePanelProps) => {
    const defaultWidth = parseInt(width, 10) || 800;

    const [panelWidth, setPanelWidth] = useState<number>(() => {
        const stored = Number(localStorage.getItem(STORAGE_KEY));
        return Number.isFinite(stored) && stored >= MIN_WIDTH ? stored : defaultWidth;
    });
    const [isResizing, setIsResizing] = useState(false);

    // Releasing the drag over the dimmed area fires a click on the overlay,
    // which would otherwise be read as "clicked outside" and close the panel
    // the moment the user finishes resizing.
    const justResizedRef = useRef(false);

    // Close on Escape
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        if (isOpen) window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [isOpen, onClose]);

    const handleResizeStart = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        const startX = e.clientX;
        const startWidth = panelWidth;
        let latest = startWidth;
        setIsResizing(true);

        // The panel is anchored to the right, so dragging left widens it.
        const onMouseMove = (moveEvent: MouseEvent) => {
            const next = startWidth - (moveEvent.clientX - startX);
            latest = Math.min(maxAllowedWidth(), Math.max(MIN_WIDTH, next));
            setPanelWidth(latest);
        };

        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            document.body.style.userSelect = '';
            document.body.style.cursor = '';
            setIsResizing(false);
            localStorage.setItem(STORAGE_KEY, String(latest));

            justResizedRef.current = true;
            // Cleared after the click event that follows this mouseup.
            setTimeout(() => { justResizedRef.current = false; }, 0);
        };

        // Without these the drag selects text across the page and the cursor
        // flickers back to default whenever it leaves the 6px handle.
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'col-resize';
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    };

    const resetWidth = () => {
        setPanelWidth(defaultWidth);
        localStorage.setItem(STORAGE_KEY, String(defaultWidth));
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="side-panel-overlay" style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 100, // High z-index
            display: 'flex',
            justifyContent: 'flex-end',
            backgroundColor: 'rgba(0,0,0,0.5)', // Dim background
            backdropFilter: 'blur(2px)',
            transition: 'opacity 0.2s ease-in-out'
        }} onClick={(e) => {
            if (justResizedRef.current) return;
            if (e.target === e.currentTarget) onClose();
        }}>
            <div className="side-panel-content" style={{
                width: `${panelWidth}px`,
                height: '100%',
                backgroundColor: 'hsl(var(--color-bg-surface))',
                boxShadow: '-4px 0 24px rgba(0,0,0,0.15)',
                display: 'flex',
                flexDirection: 'column',
                position: 'relative',
                // Suppressed mid-drag: the entry animation uses a transform and
                // would fight the width changes on every mousemove frame.
                animation: isResizing ? 'none' : 'slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                maxWidth: '90vw'
            }}>
                <div
                    onMouseDown={handleResizeStart}
                    onDoubleClick={resetWidth}
                    className="side-panel-resize-handle"
                    title="Drag to resize · double-click to reset"
                    style={{
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        bottom: 0,
                        width: '6px',
                        cursor: 'col-resize',
                        zIndex: 5
                    }}
                />
                {children}
            </div>

            <style>{`
                @keyframes slideIn {
                    from { transform: translateX(100%); }
                    to { transform: translateX(0); }
                }
                .side-panel-resize-handle::after {
                    content: '';
                    position: absolute;
                    top: 0;
                    bottom: 0;
                    left: 0;
                    width: 2px;
                    background-color: transparent;
                    transition: background-color 0.15s;
                }
                .side-panel-resize-handle:hover::after {
                    background-color: hsl(var(--color-brand-primary));
                }
            `}</style>
        </div>,
        document.body
    );
};
