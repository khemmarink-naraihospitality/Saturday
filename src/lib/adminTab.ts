/**
 * Opening the Admin Console on one of its tabs rather than its Overview: a
 * board's AI Summary sends an admin straight to AI Settings. AdminPage reads
 * the request as it first renders (peek, which StrictMode may run twice) and
 * clears it once mounted.
 */
const KEY = 'adminConsoleTab';

export const requestAdminTab = (tab: string) => {
    try { sessionStorage.setItem(KEY, tab); } catch { /* storage blocked: opens on Overview */ }
};

export const peekAdminTab = (): string | null => {
    try { return sessionStorage.getItem(KEY); } catch { return null; }
};

export const clearAdminTab = () => {
    try { sessionStorage.removeItem(KEY); } catch { /* nothing kept */ }
};
