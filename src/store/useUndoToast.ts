import { create } from 'zustand';

/**
 * A message with one button ("Undo") that stays for a while, for actions that
 * move things somewhere the person can no longer see (tasks to another board, a
 * board to another workspace). One at a time: a new one replaces the last.
 * UndoToastHost (components/ui) draws it, in both the desktop and phone layouts.
 */
export const UNDO_WINDOW_MS = 10_000;

export interface UndoToast {
    id: number;
    message: string;
    actionLabel: string;
    onAction: () => void;
    durationMs: number;
}

interface UndoToastState {
    toast: UndoToast | null;
    show: (toast: Omit<UndoToast, 'id' | 'durationMs'> & { durationMs?: number }) => void;
    dismiss: (id?: number) => void;
}

let seq = 0;
let timer: number | undefined;

export const useUndoToast = create<UndoToastState>()((set) => ({
    toast: null,
    show: (toast) => {
        const id = ++seq;
        const durationMs = toast.durationMs ?? UNDO_WINDOW_MS;
        window.clearTimeout(timer);
        set({ toast: { ...toast, id, durationMs } });
        timer = window.setTimeout(() => set(state => (state.toast?.id === id ? { toast: null } : state)), durationMs);
    },
    dismiss: (id) => set(state => {
        if (id !== undefined && state.toast?.id !== id) return state;
        window.clearTimeout(timer);
        return { toast: null };
    }),
}));

/** Shows the toast for an action that has just happened; `undo` runs once if the button is pressed in time. */
export const offerUndo = (message: string, undo: () => void | Promise<void>, actionLabel = 'Undo') => {
    let used = false;
    useUndoToast.getState().show({
        message,
        actionLabel,
        onAction: () => {
            if (used) return;
            used = true;
            void undo();
        },
    });
};
