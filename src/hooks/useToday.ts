import { useSyncExternalStore } from 'react';
import { todayDay } from '../lib/formula/engine';

/*
 * Today's date as a calendar day (src/lib/formula/engine.ts), shared by every
 * component that shows something that depends on it — a formula comparing a
 * date with TODAY(). It changes at local midnight (and is re-checked when the
 * tab comes back, since a sleeping laptop misses timers), so an "Overdue"
 * label appears on its own the morning a deadline passes.
 */

let today = todayDay();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;

const refresh = () => {
    const now = todayDay();
    if (now !== today) {
        today = now;
        listeners.forEach(l => l());
    }
};

const schedule = () => {
    if (timer) clearTimeout(timer);
    const now = new Date();
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 2);
    timer = setTimeout(() => {
        refresh();
        schedule();
    }, nextMidnight.getTime() - now.getTime());
};

const onWake = () => {
    if (document.visibilityState === 'visible') refresh();
};

const subscribe = (listener: () => void) => {
    listeners.add(listener);
    if (listeners.size === 1) {
        refresh();
        schedule();
        document.addEventListener('visibilitychange', onWake);
        window.addEventListener('focus', refresh);
    }
    return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
            if (timer) clearTimeout(timer);
            timer = null;
            document.removeEventListener('visibilitychange', onWake);
            window.removeEventListener('focus', refresh);
        }
    };
};

export const useToday = (): number => useSyncExternalStore(subscribe, () => today, () => today);
