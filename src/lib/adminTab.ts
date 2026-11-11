/**
 * Opening the Admin Console on one of its tabs rather than its Overview: a
 * board's AI Summary sends an admin straight to AI Settings. The request is
 * taken once, by AdminPage's first render.
 */
const KEY = 'adminConsoleTab';

export const requestAdminTab = (tab: string) => {
    try { sessionStorage.setItem(KEY, tab); } catch { /* storage blocked: opens on Overview */ }
};

export const takeAdminTab = (): string | null => {
    try {
        const tab = sessionStorage.getItem(KEY);
        sessionStorage.removeItem(KEY);
        return tab;
    } catch {
        return null;
    }
};
