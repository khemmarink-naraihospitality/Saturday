import { useEffect, useRef } from 'react';
import { pushHistoryState, readHistoryState } from './history';

let overlaySeq = 0;

/**
 * Ties an overlay (a bottom sheet, the item screen) to the browser history, the
 * way native sheets behave: opening it adds an entry, the back gesture or back
 * button closes it, and closing it any other way (X, Save, picking an option)
 * removes that entry again so the next back goes where the user expects.
 *
 * The entry is added on the next tick rather than in the effect itself so that
 * React StrictMode's mount → unmount → mount in development doesn't leave a
 * stray entry behind (the first, cancelled mount never pushes anything).
 */
export const useHistoryOverlay = (open: boolean, onClose: () => void) => {
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;

    useEffect(() => {
        if (!open) return;

        const token = `o${++overlaySeq}`;
        let pushed = false;
        let closedByBack = false;

        const timer = window.setTimeout(() => {
            pushHistoryState({ mOverlay: token });
            pushed = true;
        }, 0);

        const onPopState = () => {
            if (!pushed) return;
            // Our entry is the top one only while the overlay is open; once a
            // popstate lands anywhere else, the user went back past it.
            if (readHistoryState()?.mOverlay !== token) {
                closedByBack = true;
                onCloseRef.current();
            }
        };
        window.addEventListener('popstate', onPopState);

        return () => {
            window.clearTimeout(timer);
            window.removeEventListener('popstate', onPopState);
            // Closed by X / Save / a choice: take our entry back off the stack.
            if (pushed && !closedByBack && readHistoryState()?.mOverlay === token) {
                window.history.back();
            }
        };
    }, [open]);
};
