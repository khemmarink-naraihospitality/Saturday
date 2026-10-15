// The path the app was opened at, recorded once at startup (App.tsx imports
// this module for that side effect) — before MainApp's URL sync rewrites it: a
// /user/workspace link becomes "/" as soon as the data has loaded. The phone
// layout, which loads later, reads it to open that workspace's own screen.
//
// Kept on window rather than in a module constant so the bundler can't move or
// drop the read: it has to happen in the main chunk, at startup.
const holder = window as unknown as { __saturdayInitialPath?: string };
if (holder.__saturdayInitialPath === undefined) {
    holder.__saturdayInitialPath = window.location.pathname;
}

export const getInitialPath = (): string => holder.__saturdayInitialPath ?? '/';
