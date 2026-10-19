// The path the app was opened at, recorded once at startup (App.tsx imports
// this module for that side effect) — before MainApp's URL sync rewrites it: a
// /user/workspace link becomes "/" as soon as the data has loaded. The phone
// layout, which loads later, reads it to open that workspace's own screen.
//
// Kept on window rather than in a module constant so the bundler can't move or
// drop the read: it has to happen in the main chunk, at startup.
const holder = window as unknown as { __saturdayInitialPath?: string; __saturdayMicrosoftEntry?: boolean };
if (holder.__saturdayInitialPath === undefined) {
    // /auth/microsoft starts a Microsoft sign-in (a bookmark, or the app's tile
    // in Microsoft's My Apps): it is not a page, so the app carries on at "/"
    // and LoginPage picks the request up (takeMicrosoftEntry).
    if (window.location.pathname.replace(/\/+$/, '') === '/auth/microsoft') {
        holder.__saturdayMicrosoftEntry = true;
        window.history.replaceState(window.history.state, '', `/${window.location.search}${window.location.hash}`);
    }
    holder.__saturdayInitialPath = window.location.pathname;
}

export const getInitialPath = (): string => holder.__saturdayInitialPath ?? '/';

/** Whether the app was opened at /auth/microsoft — answered once. */
export const takeMicrosoftEntry = (): boolean => {
    const wanted = !!holder.__saturdayMicrosoftEntry;
    holder.__saturdayMicrosoftEntry = false;
    return wanted;
};
