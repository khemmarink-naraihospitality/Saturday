import { createClient } from '@supabase/supabase-js';
import { cookieStorage, onSharedDomain } from './cookieStorage';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
        'Missing Supabase credentials. Please configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.'
    );
}

// On nhgspace.com and its subdomains (work.nhgspace.com) the session lives in a cookie
// shared by the whole domain, so signing out of the NHG portal ends it too (see
// cookieStorage.ts). Anywhere else the client keeps its default localStorage.
export const supabase = createClient(
    supabaseUrl,
    supabaseAnonKey,
    onSharedDomain() ? { auth: { storage: cookieStorage } } : undefined,
);


