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
