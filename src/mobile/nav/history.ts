/**
 * Browser history in the phone layout.
 *
 * The URL is still driven by MainApp (App.tsx) for the pages both layouts share
 * (home, a board, a workspace dashboard, notifications). On top of that the
 * phone layout needs:
 *   - back/forward to move between screens the desktop never had to restore
 *     from the URL (a board, a workspace's own screen) — useMobileRouting;
 *   - its overlays (the item screen, every bottom sheet) to close on the back
 *     gesture instead of leaving the page — useHistoryOverlay;
 *   - an in-app back button that steps back through that same history when the
 *     previous entry is ours, and otherwise goes somewhere sensible — goBack.
 *
 * To know whether the previous entry is ours, every entry pushed while the
 * phone layout is mounted carries a depth counter (mDepth). An entry with
 * depth 0 is where the visit started, so going back from it would leave the app.
 */

type HistoryState = Record<string, unknown> | null;

const currentState = (): HistoryState => (window.history.state && typeof window.history.state === 'object')
    ? window.history.state as Record<string, unknown>
    : null;

export const historyDepth = (): number => {
    const depth = currentState()?.mDepth;
    return typeof depth === 'number' ? depth : 0;
};

/**
 * Stamps a depth on every pushState/replaceState while the phone layout is up
 * (MainApp's own pushes included, which carry no state of their own). Returns
 * the uninstaller.
 */
export const installHistoryDepth = (): (() => void) => {
    const originalPush = window.history.pushState;
    const originalReplace = window.history.replaceState;

    window.history.pushState = function (state: unknown, unused: string, url?: string | URL | null) {
        const base = state && typeof state === 'object' ? state as Record<string, unknown> : {};
        return originalPush.call(this, { ...base, mDepth: historyDepth() + 1 }, unused, url);
    };
    window.history.replaceState = function (state: unknown, unused: string, url?: string | URL | null) {
        const base = state && typeof state === 'object' ? state as Record<string, unknown> : {};
        return originalReplace.call(this, { ...base, mDepth: historyDepth() }, unused, url);
    };

    return () => {
        window.history.pushState = originalPush;
        window.history.replaceState = originalReplace;
    };
};

/** Whether stepping back stays inside the app. */
export const canGoBack = () => historyDepth() > 0;

/**
 * The header back button: the previous screen when there is one in this visit,
 * otherwise `fallback` (e.g. a board opened from a shared link goes back to
 * its workspace rather than off the site).
 */
export const goBack = (fallback: () => void) => {
    if (canGoBack()) window.history.back();
    else fallback();
};

/** Adds an entry for the current URL carrying `extra` (an overlay marker, a page). */
export const pushHistoryState = (extra: Record<string, unknown>, url?: string) => {
    window.history.pushState({ ...(currentState() || {}), ...extra }, '', url ?? window.location.href);
};

export const readHistoryState = currentState;

// ── Keeping overlay pushes and pops in order ────────────────────────────────
//
// history.back() is asynchronous: it only takes effect on a later task. A sheet
// that closes while another opens in the same tap (a menu → "Rename") would
// otherwise push its entry before the first one's back has landed, and that
// back would then take the new entry off instead. So every back issued for an
// overlay is counted, and pushes / navigations wait until they have all landed.

let pendingBacks = 0;
let settleTimer = 0;
const settleWaiters: (() => void)[] = [];

const flushWaiters = () => {
    while (pendingBacks === 0 && settleWaiters.length) settleWaiters.shift()!();
};

if (typeof window !== 'undefined') {
    // Registered when this module loads — before any overlay's own listener —
    // so the count is already down when those run.
    window.addEventListener('popstate', () => {
        if (pendingBacks > 0) pendingBacks--;
        if (pendingBacks === 0) {
            window.clearTimeout(settleTimer);
            // After the other popstate listeners for this same event have run.
            window.setTimeout(flushWaiters, 0);
        }
    });
}

/** Steps back off an overlay's own entry, counting it until it lands. */
export const popOverlayEntry = () => {
    pendingBacks++;
    window.clearTimeout(settleTimer);
    // A back that never lands (nothing to go back to) mustn't block everything.
    settleTimer = window.setTimeout(() => {
        pendingBacks = 0;
        flushWaiters();
    }, 700);
    window.history.back();
};

/** Runs `fn` once every pending overlay back has landed (now, if there are none). */
export const whenHistorySettled = (fn: () => void) => {
    if (pendingBacks === 0) fn();
    else settleWaiters.push(fn);
};

/**
 * Navigating from inside a sheet: close the sheet first (its entry comes off
 * during the same React commit), then call this — `fn` runs after that back has
 * landed, so the next screen's URL is pushed on top of the right entry.
 */
export const afterSheetClose = (fn: () => void) => {
    window.setTimeout(() => whenHistorySettled(fn), 0);
};
