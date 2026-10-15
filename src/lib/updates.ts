/**
 * An item's updates as they are listed — de-duplicated, split into posts and
 * replies. Shared by the desktop item panel (TaskDetail) and the phone's item
 * screen, so both list the same updates. Pure — tests/updates_test.ts.
 */

// Valid, de-duplicated updates for an item. Re-imports / Monday exports can repeat the
// same post — sometimes as near-identical copies that differ only in length. Two updates
// are treated as the same when they share author + timestamp + the first 50 chars of their
// plain-text content; among duplicates we keep the longest (most complete) version.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const plainTextOf = (html: any): string =>
    String(html || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

// Normalize to minute precision so timestamps that display identically are treated as equal.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const minuteKeyOf = (createdAt: any): string => {
    const d = new Date(createdAt);
    if (isNaN(d.getTime())) return String(createdAt || '');
    return d.toISOString().slice(0, 16); // YYYY-MM-DDTHH:MM
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dedupeKeyOf = (u: any): string =>
    `${u.author}::${minuteKeyOf(u.createdAt)}::${plainTextOf(u.content).slice(0, 50)}`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const getDedupedUpdates = (updates: any): any[] => {
    if (!Array.isArray(updates)) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const valid = updates.filter((u: any) => typeof u === 'object' && u?.id);

    // Pick the longest-content update for each key
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bestByKey = new Map<string, any>();
    for (const u of valid) {
        const k = dedupeKeyOf(u);
        const existing = bestByKey.get(k);
        if (!existing || plainTextOf(u.content).length > plainTextOf(existing.content).length) {
            bestByKey.set(k, u);
        }
    }

    // Preserve original (first-seen) ordering of the kept updates
    const seen = new Set<string>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any[] = [];
    for (const u of valid) {
        const k = dedupeKeyOf(u);
        if (seen.has(k)) continue;
        seen.add(k);
        result.push(bestByKey.get(k));
    }
    return result;
};

/** An update's words on one line, as written (not lower-cased): drafts, reply context. */
export const previewText = (html: string): string =>
    String(html || '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, '&') // last, so "&amp;lt;" stays "&lt;"
        .replace(/\s+/g, ' ')
        .trim();

// A rich-text box emptied by hand can leave markup behind (<br>, <p></p>), so
// "is there anything to send" looks at the text — and at images, for GIFs.
export const hasHtmlContent = (html: string) =>
    !!html && (html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim() !== '' || html.includes('<img'));

/**
 * Posts and replies. A reply names its parent by id, or — for updates imported
 * from a monday export — by the parent's original postId; one whose parent is
 * not in the list is shown as a post of its own rather than lost.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const splitThreads = (updates: any[]): { topLevel: any[]; replies: any[] } => {
    // Use update.id as fallback when postId is absent (for new replies created in-app)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hasParent = (u: any) => u.parentId && updates.some((p: any) => p.postId === u.parentId || p.id === u.parentId);
    return {
        topLevel: updates.filter(u => !hasParent(u)),
        replies: updates.filter(u => hasParent(u)),
    };
};

/** The replies to one post, in stored order. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const repliesTo = (replies: any[], update: any): any[] =>
    replies.filter(r => r.parentId === update.postId || r.parentId === update.id);
