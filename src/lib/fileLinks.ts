import { getGoogleDriveFileName, isValidGoogleDriveUrl } from './utils';
import type { FileLink } from '../types';

/**
 * Where an attached link points: Google Drive, Microsoft OneDrive / SharePoint,
 * or anywhere else. One rule for every place that files are attached (the Files
 * column, an item's Files tab, updates, the phone). Pure — tests/file_links_test.ts.
 */

const withScheme = (url: string) => (/^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`);

const hostOf = (url: string): string => {
    try {
        return new URL(withScheme(url)).hostname.toLowerCase();
    } catch {
        return '';
    }
};

/** OneDrive (personal short links and onedrive.live.com) and SharePoint / OneDrive for Business (*.sharepoint.com). */
export const isOneDriveUrl = (url: string): boolean => {
    const host = hostOf(url);
    return host === '1drv.ms' || host === 'onedrive.live.com' || host === 'sharepoint.com' || host.endsWith('.sharepoint.com');
};

export type FileSource = FileLink['type'];

export const fileTypeForUrl = (url: string): FileSource =>
    isOneDriveUrl(url) ? 'onedrive' : isValidGoogleDriveUrl(url) ? 'google-drive' : 'file-url';

/**
 * A name for a OneDrive / SharePoint link that has none: the file's own name
 * when the address carries it (…/Documents/Budget%202026.xlsx, or the id= of a
 * "my" link), else "OneDrive file".
 */
export const getOneDriveFileName = (url: string, fallback = 'OneDrive file'): string => {
    try {
        const u = new URL(withScheme(url));
        const candidates = [u.searchParams.get('id') || '', u.pathname];
        for (const c of candidates) {
            const last = decodeURIComponent(c).split('/').filter(Boolean).pop() || '';
            if (/\.[A-Za-z0-9]{2,5}$/.test(last)) return last;
        }
        return fallback;
    } catch {
        return fallback;
    }
};

/** A pasted link as an attachment, named as best it can be. */
export const fileLinkFromUrl = (raw: string, name = '', newId: () => string): FileLink | null => {
    const url = raw.trim();
    if (!url) return null;
    const full = withScheme(url);
    const type = fileTypeForUrl(full);
    const given = name.trim();
    const fallback = type === 'google-drive' ? getGoogleDriveFileName(full)
        : type === 'onedrive' ? getOneDriveFileName(full)
            : (full.split('/').pop()?.split('?')[0] || 'Attached File');
    return { id: newId(), name: given || fallback, url: full, type };
};

/** The OneDrive mark for file chips and icons: a blue cloud (inline, so it needs no request). */
export const ONEDRIVE_ICON =
    'data:image/svg+xml;utf8,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path fill="#0364b8" d="M12.2 9.6a7.4 7.4 0 0 1 6.5 3.7 6 6 0 0 1 1.3-.1 5.8 5.8 0 0 1 5.6 4.4 5 5 0 0 1 1.9 9.6H7.7a5.9 5.9 0 0 1-1.1-11.7 7.4 7.4 0 0 1 5.6-5.9z"/><path fill="#0078d4" d="M12.2 9.6a7.4 7.4 0 0 0-5.6 5.9 5.9 5.9 0 0 0-4.6 5.7 5.7 5.7 0 0 0 4 5.4h19.3a5 5 0 0 0 1.5-9.6 5.8 5.8 0 0 0-5.6-4.4 6 6 0 0 0-1.3.1 7.4 7.4 0 0 0-6.5-3.7z" opacity=".55"/><path fill="#28a8ea" d="M20 13.2a6 6 0 0 1 1.3-.1 5.8 5.8 0 0 1 5.6 4.4 5 5 0 0 1 1.9 9.6H12.3z"/></svg>'
    );

/**
 * Which cloud-file sources to offer, from how this person signed in: someone
 * who signed in with Google sees Google Drive, with Microsoft sees OneDrive,
 * and an email/password account (neither) sees both. Links to either kind can
 * still be pasted and are still shown whatever the sign-in.
 *
 * "How they signed in" is the identity used most recently
 * (identities[].last_sign_in_at), falling back to the account's first provider.
 */
export const driveSourcesFor = (
    user: { app_metadata?: { provider?: string }; identities?: { provider: string; last_sign_in_at?: string }[] } | null | undefined
) => {
    const identities = [...(user?.identities || [])].sort((a, b) => (b.last_sign_in_at || '').localeCompare(a.last_sign_in_at || ''));
    const provider = identities[0]?.provider || user?.app_metadata?.provider || '';
    return {
        google: provider !== 'azure',
        onedrive: provider !== 'google',
    };
};
