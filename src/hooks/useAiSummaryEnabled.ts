import { useEffect, useSyncExternalStore } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Whether the AI Summary view is switched on — Admin › AI Settings, stored as
 * system_settings.ai_summary_enabled. Every place that offers the view (the
 * desktop's view tabs, the phone's Views sheet and toolbar button) and every
 * place that draws it asks this, so the feature is either there everywhere or
 * nowhere. Read once per session and shared; null until the answer is in.
 */
let enabled: boolean | null = null;
let loading = false;
const listeners = new Set<() => void>();

/** The setting as just saved (AI Settings' switch), so open boards follow at once. */
export const setAiSummaryEnabled = (next: boolean) => {
    enabled = next;
    listeners.forEach(listener => listener());
};

const load = () => {
    if (enabled !== null || loading) return;
    loading = true;
    supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'ai_summary_enabled')
        .maybeSingle()
        .then(
            ({ data }) => setAiSummaryEnabled(data?.value === 'true'),
            () => setAiSummaryEnabled(false)
        );
};

const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};

export const useAiSummaryEnabled = (): boolean | null => {
    useEffect(load, []);
    return useSyncExternalStore(subscribe, () => enabled, () => null);
};

/**
 * The view a board actually shows. A board left on AI Summary shows its main
 * table while the feature is off — or not yet known to be on, so a switched-off
 * feature never flashes up.
 */
export const shownViewId = (viewId: string | null | undefined, aiEnabled: boolean | null): string =>
    viewId === 'ai_summary' && aiEnabled !== true ? 'main_table' : (viewId || 'main_table');
