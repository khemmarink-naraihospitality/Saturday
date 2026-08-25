// Holds the target of an emailed "View Item" link (/?boardId=…&itemId=…) across
// a sign-in, so a recipient who clicks the link while logged out still lands on
// the right item instead of the home page.
//
// Needed because the query string does not survive the trip to the login screen:
// LoginPage clears it with replaceState after a password sign-in, and the Google
// OAuth round trip returns to the bare origin. sessionStorage does survive both
// (same tab, same origin, including a full page load), and it clears on tab
// close, which is the right lifetime for a one-shot navigation target.

const STORAGE_KEY = 'pendingDeepLink';

export interface PendingDeepLink {
    boardId?: string;
    workspaceId?: string;
    itemId?: string;
}

/** Stash the deep-link params currently in the URL, if there are any worth keeping. */
export function savePendingDeepLink(search: string) {
    try {
        const params = new URLSearchParams(search);
        const link: PendingDeepLink = {};
        const boardId = params.get('boardId');
        const workspaceId = params.get('workspaceId');
        const itemId = params.get('itemId');
        if (boardId) link.boardId = boardId;
        if (workspaceId) link.workspaceId = workspaceId;
        if (itemId) link.itemId = itemId;

        if (Object.keys(link).length === 0) return;
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(link));
    } catch {
        // Private-mode / storage-disabled browsers: losing the deep link is not
        // worth breaking sign-in over.
    }
}

/** Read and remove the stashed link — it should only ever be acted on once. */
export function takePendingDeepLink(): PendingDeepLink | null {
    try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        sessionStorage.removeItem(STORAGE_KEY);
        return JSON.parse(raw) as PendingDeepLink;
    } catch {
        return null;
    }
}

export function clearPendingDeepLink() {
    try {
        sessionStorage.removeItem(STORAGE_KEY);
    } catch {
        // ignore
    }
}
