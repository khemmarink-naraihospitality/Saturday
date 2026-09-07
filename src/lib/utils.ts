export function slugify(text: string): string {
    return text
        .toString()
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')     // Replace spaces with -
        .replace(/[^\w\-]+/g, '') // Remove all non-word chars
        .replace(/\-\-+/g, '-')   // Replace multiple - with single -
        .replace(/^-+/, '')       // Trim - from start
        .replace(/-+$/, '');      // Trim - from end
}

// The first 8 hex chars of a UUID (the segment before its first internal
// hyphen) — short and URL-safe on its own.
export const shortId = (id: string): string => id.slice(0, 8);

// Board URLs are titles for readability, but titles collide — a re-created
// board can reuse a deleted one's name, an import can duplicate one, a rename
// changes the slug out from under an old bookmark. Appending the id suffix
// makes the URL segment unique regardless of title collisions.
//
// The separator is a double hyphen, not a single one: slugify() collapses any
// run of hyphens in the title down to one, so a real title can never produce
// "--" on its own — including one that happens to end in 8 digits (a date
// like "sprint-20260904" is all valid hex and would otherwise look exactly
// like an id suffix). "--" is therefore an unambiguous, title-collision-proof
// marker that this segment carries a real id, not a coincidence.
export function buildBoardSlug(title: string, id: string): string {
    return `${slugify(title)}--${shortId(id)}`;
}

// Reverse of buildBoardSlug: pulls the id suffix off a path segment, if one is
// present. Returns null for a legacy (pre-suffix) slug so callers can fall
// back to title-only matching for links shared before this existed.
export function parseBoardSlugSuffix(segment: string): string | null {
    const match = segment.match(/--([0-9a-f]{8})$/i);
    return match ? match[1].toLowerCase() : null;
}

export interface LinkValue {
    url: string;
    label: string;
}

// A link cell holds either a bare URL string — how every link was stored before
// labels existed, and still how an unlabelled one is stored — or { url, label }.
// Every reader goes through here so both shapes stay readable without a backfill.
export const parseLinkValue = (raw: any): LinkValue => {
    if (!raw) return { url: '', label: '' };
    if (typeof raw === 'string') return { url: raw, label: '' };
    if (typeof raw === 'object') return { url: raw.url || '', label: raw.label || '' };
    return { url: String(raw), label: '' };
};

// Writes back a bare string when there's no label, so an unlabelled link keeps
// the exact shape sorting, export and import already handle.
export const buildLinkValue = (url: string, label: string): string | LinkValue | null => {
    const trimmedUrl = url.trim();
    const trimmedLabel = label.trim();
    if (!trimmedUrl && !trimmedLabel) return null;
    return trimmedLabel ? { url: trimmedUrl, label: trimmedLabel } : trimmedUrl;
};

// Pasted links routinely arrive without a scheme ("maps.app.goo.gl/…"), which
// the browser would otherwise resolve against our own origin.
export const linkHref = (url: string): string =>
    !url ? '' : (/^[a-z][a-z0-9+.-]*:\/\//i.test(url) ? url : `https://${url}`);

// What the link reads as: its label if it has one, otherwise the raw URL.
export const linkDisplayText = (raw: any): string => {
    const { url, label } = parseLinkValue(raw);
    return label || url;
};

// Where a column sits when nobody has picked an alignment: whatever that type
// looked like before alignment was configurable, so turning the setting on
// never moved anything on an existing board.
export const defaultColumnAlign = (type: string): 'left' | 'center' | 'right' =>
    ['number', 'date', 'due_date'].includes(type) ? 'center' : 'left';

// Shared by every column type whose Format menu offers an Alignment section
// (Number, Dropdown, Text, Date). One stored field, `column.numberAlign`, backs
// all of them — named for the type that had it first — so the per-type starting
// point comes from `fallback` rather than from the field itself.
export const columnJustify = (
    align: 'left' | 'center' | 'right' | undefined,
    fallback: 'left' | 'center' | 'right' = 'center'
): 'flex-start' | 'center' | 'flex-end' => {
    switch (align || fallback) {
        case 'left': return 'flex-start';
        case 'right': return 'flex-end';
        default: return 'center';
    }
};

export const isValidGoogleDriveUrl = (url: string): boolean => {
    try {
        const urlStr = url.trim();
        if (!urlStr) return false;

        let fullUrl = urlStr;
        if (!fullUrl.startsWith('http')) {
            fullUrl = `https://${fullUrl}`;
        }

        // const urlObj = new URL(fullUrl);
        return fullUrl.includes('drive.google.com') || fullUrl.includes('docs.google.com');
    } catch (e) {
        return false;
    }
};

export const getGoogleDriveFileName = (url: string, defaultName = 'Google Drive File'): string => {
    try {
        const urlStr = url.trim();
        if (!urlStr) return defaultName;

        if (urlStr.includes('docs.google.com')) {
            if (urlStr.includes('/document/')) return 'Google Doc';
            if (urlStr.includes('/spreadsheets/')) return 'Google Sheet';
            if (urlStr.includes('/presentation/')) return 'Google Slides';
            if (urlStr.includes('/forms/')) return 'Google Form';
        }

        // Return default if generic drive link
        return defaultName;
    } catch (e) {
        return defaultName;
    }
};
