import { supabase } from './supabase';

export interface DashboardPerson {
    userId: string;
    name: string;
    avatarUrl: string | null;
    // Oldest week first, matching the columns left to right.
    weeks: number[];
    total: number;
}

export interface DashboardStats {
    summary: {
        boardsUpdated: number;
        peoplePosted: number;
        updates: number;
        contributed: number;
        signedIn: number;
    };
    joined: number;
    // One entry per day of the last 30, oldest first; `day` is "YYYY-MM-DD" in the viewer's zone.
    daily: { day: string; users: { name: string; email: string }[] }[];
    boards: { boardId: string; title: string; items: number; updates: number }[];
    creators: DashboardPerson[];
    communicators: DashboardPerson[];
}

// The Admin dashboard's window: its panels read 60 days of activity, the chart
// narrows to 30 and the leaderboards to 28 — all inside admin_dashboard_stats.
export const DASHBOARD_WINDOW_DAYS = 60;

let inFlight: Promise<DashboardStats> | null = null;

/**
 * Every figure on the Admin dashboard, computed in the database by
 * admin_dashboard_stats (supabase/migrations/20261014_admin_dashboard_stats.sql).
 * It used to page ~36,000 activity_logs rows down to the browser and count them
 * there, which took long enough to be the page's whole loading time.
 *
 * The panels mount together; sharing the in-flight promise makes them one
 * request. It is released as soon as it settles, so revisiting refetches.
 */
export function fetchDashboardStats(): Promise<DashboardStats> {
    if (inFlight) return inFlight;

    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const promise = (async () => {
        const { data, error } = await supabase.rpc('admin_dashboard_stats', { p_tz: tz });
        if (error) throw error;

        const person = (p: any): DashboardPerson => ({
            userId: p.user_id,
            name: p.name,
            avatarUrl: p.avatar_url ?? null,
            weeks: p.weeks,
            total: p.total
        });

        return {
            summary: {
                boardsUpdated: data.summary.boards_updated,
                peoplePosted: data.summary.people_posted,
                updates: data.summary.updates,
                contributed: data.summary.contributed,
                signedIn: data.summary.signed_in
            },
            joined: data.joined,
            daily: data.daily,
            boards: (data.boards as any[]).map(b => ({ boardId: b.board_id, title: b.title, items: b.items, updates: b.updates })),
            creators: (data.creators as any[]).map(person),
            communicators: (data.communicators as any[]).map(person)
        } as DashboardStats;
    })();

    inFlight = promise;
    promise
        .catch(() => { /* surfaced to the caller; nothing to do here but release the slot */ })
        .then(() => {
            if (inFlight === promise) inFlight = null;
        });

    return promise;
}
