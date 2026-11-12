// Where Supabase keeps Saturday's session on nhgspace.com and its subdomains: a
// cookie shared by the whole domain, so that signing out of the NHG portal
// (nhgspace.com, NHGOne's app) also ends the session here (12-Nov-2026). Anywhere
// else (saturday.naraihospitalitygroup.com, localhost, previews) the Supabase client
// keeps its default localStorage and nothing changes.
//
// Mirrors NHGOne's src/lib/cookieStorage.ts, and NHGOne's sign-out deletes the cookie
// named below (WORK_SESSION_KEY in its src/lib/sso.ts): change the project ref in one
// place and you must change it in the other.
//
// What a shared cookie means, so nobody widens it casually: every subdomain of
// nhgspace.com can read it, and it cannot be HttpOnly (the client reads it). A
// subdomain nobody controls could read a session; only point subdomains at code we
// trust. SameSite=Lax, and Secure on https.
//
// A session is a few KB of JSON and a cookie holds about 4 KB, so the value is
// base64url-encoded and split in chunks: <key>.n holds how many, <key>.0 ... the pieces.

export const SHARED_DOMAIN = 'nhgspace.com';

export const onSharedDomain = (): boolean => {
    const h = window.location.hostname.toLowerCase();
    return h === SHARED_DOMAIN || h.endsWith(`.${SHARED_DOMAIN}`);
};

const CHUNK = 3000;
const MAX_AGE_SECONDS = 400 * 24 * 60 * 60;

const attributes = (maxAge: number): string => {
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    return `Domain=.${SHARED_DOMAIN}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`;
};

const readCookie = (name: string): string | null => {
    const prefix = `${name}=`;
    for (const part of document.cookie.split('; ')) {
        if (part.startsWith(prefix)) return part.slice(prefix.length);
    }
    return null;
};

const writeCookie = (name: string, value: string) => {
    document.cookie = `${name}=${value}; ${attributes(MAX_AGE_SECONDS)}`;
};

const deleteCookie = (name: string) => {
    document.cookie = `${name}=; ${attributes(0)}`;
};

const encode = (text: string): string => {
    let binary = '';
    for (const b of new TextEncoder().encode(text)) binary += String.fromCharCode(b);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const decode = (encoded: string): string => {
    const b64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
};

const chunkCount = (key: string): number => {
    const n = Number(readCookie(`${key}.n`));
    return Number.isInteger(n) && n > 0 && n < 50 ? n : 0;
};

const legacyGet = (key: string): string | null => {
    try { return window.localStorage.getItem(key); } catch { return null; }
};

const legacyRemove = (key: string) => {
    try { window.localStorage.removeItem(key); } catch { /* blocked storage: nothing to clean up */ }
};

export const cookieStorage = {
    getItem(key: string): string | null {
        const n = chunkCount(key);
        if (!n) return legacyGet(key); // a session stored before the move is still honoured
        let joined = '';
        for (let i = 0; i < n; i++) {
            const piece = readCookie(`${key}.${i}`);
            if (piece === null) return null; // a torn write: signed out, not garbage
            joined += piece;
        }
        try { return decode(joined); } catch { return null; }
    },

    setItem(key: string, value: string): void {
        const encoded = encode(value);
        const pieces: string[] = [];
        for (let i = 0; i < encoded.length; i += CHUNK) pieces.push(encoded.slice(i, i + CHUNK));
        const previous = chunkCount(key);
        pieces.forEach((piece, i) => writeCookie(`${key}.${i}`, piece));
        writeCookie(`${key}.n`, String(pieces.length));
        for (let i = pieces.length; i < previous; i++) deleteCookie(`${key}.${i}`);
        legacyRemove(key);
    },

    removeItem(key: string): void {
        const n = chunkCount(key);
        for (let i = 0; i < n; i++) deleteCookie(`${key}.${i}`);
        deleteCookie(`${key}.n`);
        legacyRemove(key);
    },
};
