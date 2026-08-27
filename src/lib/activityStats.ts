import { supabase } from './supabase';

const PAGE_SIZE = 1000;
// Ceiling so a runaway log table can never spin here forever. 50k rows covers a
// 60-day window comfortably at this org's volume; past that the numbers would be
// undercounts, which is why fetchActivityLogsSince reports whether it hit the cap.
const MAX_PAGES = 50;

export interface ActivityLogSummaryRow {
    actor_id: string | null;
    action_type: string;
    created_at: string;
    metadata: Record<string, any> | null;
    profiles?: { full_name: string | null; email: string | null } | { full_name: string | null; email: string | null }[] | null;
}

export interface ActivityLogFetchResult {
    rows: ActivityLogSummaryRow[];
    truncated: boolean;
}

/**
 * PostgREST caps a plain select at 1000 rows, so any aggregate computed from one
 * (distinct active users, boards touched, update counts) silently undercounts the
 * moment a window holds more activity than that. Page through with explicit
 * ranges instead, and say so when the page cap is reached rather than quietly
 * returning a partial answer.
 */
export async function fetchActivityLogsSince(
    sinceIso: string,
    columns: string
): Promise<ActivityLogFetchResult> {
    const rows: ActivityLogSummaryRow[] = [];

    for (let page = 0; page < MAX_PAGES; page++) {
        const from = page * PAGE_SIZE;
        const { data, error } = await supabase
            .from('activity_logs')
            .select(columns)
            .gte('created_at', sinceIso)
            .not('actor_id', 'is', null)
            .order('created_at', { ascending: false })
            .range(from, from + PAGE_SIZE - 1);

        if (error) throw error;

        const batch = (data || []) as unknown as ActivityLogSummaryRow[];
        rows.push(...batch);

        if (batch.length < PAGE_SIZE) {
            return { rows, truncated: false };
        }
    }

    return { rows, truncated: true };
}

/** Midnight-aligned start of a window N days back, as an ISO string. */
export function startOfWindow(days: number): Date {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - (days - 1));
    return d;
}
