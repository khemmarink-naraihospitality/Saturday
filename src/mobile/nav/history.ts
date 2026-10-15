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
