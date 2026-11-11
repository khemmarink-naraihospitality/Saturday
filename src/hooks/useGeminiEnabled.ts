import { useEffect, useSyncExternalStore } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Whether the AI Summary tab's Gemini section is switched on — Admin › AI
 * Settings, stored as system_settings.ai_summary_enabled (everyone signed in
 * may read that one row). The tab itself is on every board: its other section
 * is worked out in the browser and sends nothing anywhere; this switch governs
 * only what goes to Google. Read once per session and shared; null until the
 * answer is in.
 */
let enabled: boolean | null = null;
let loading = false;
const listeners = new Set<() => void>();

/** The setting as just saved (AI Settings' switch), so open boards follow at once. */
export const setGeminiEnabled = (next: boolean) => {
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
            ({ data }) => setGeminiEnabled(String(data?.value) === 'true'),
            () => setGeminiEnabled(false)
        );
};

const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};

export const useGeminiEnabled = (): boolean | null => {
    useEffect(load, []);
    return useSyncExternalStore(subscribe, () => enabled, () => null);
};
