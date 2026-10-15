/**
 * Small text helpers for the phone layout. Pure, so they can be checked from
 * node (tests/mobile_format_test.ts).
 */

/** "Good morning" / "Good afternoon" / "Good evening" for the hour of `now`. */
export const greetingFor = (now: Date = new Date()): string => {
    const hour = now.getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
};

const toDate = (value: string | number | Date | null | undefined): Date | null => {
    if (value === null || value === undefined || value === '') return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
};

const DAY = 24 * 60 * 60 * 1000;

/**
 * How long ago, the way the item list says it: "just now", "5 minutes ago",
 * "today", "yesterday", "3 days ago", "last week", "2 weeks ago", "last month",
 * "4 months ago", "last year", "2 years ago". Empty for no / bad dates.
 */
export const relativeTime = (value: string | number | Date | null | undefined, now: Date = new Date()): string => {
    const date = toDate(value);
    if (!date) return '';
    const diff = now.getTime() - date.getTime();
    if (diff < 60 * 1000) return 'just now';
    if (diff < 60 * 60 * 1000) {
        const minutes = Math.floor(diff / 60000);
        return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
    }

    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfThatDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    const days = Math.round((startOfToday - startOfThatDay) / DAY);
    if (days <= 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 7) return `${days} days ago`;
    if (days < 14) return 'last week';
    if (days < 31) return `${Math.floor(days / 7)} weeks ago`;
    const months = Math.floor(days / 30.44);
    if (months < 2) return 'last month';
    if (months < 12) return `${months} months ago`;
    const years = Math.floor(days / 365.25);
    if (years < 2) return 'last year';
    return `${years} years ago`;
};

/** The compact age next to an update's author: "now", "5m", "3h", "2d", "3w", "5mo", "3yr". */
export const shortAge = (value: string | number | Date | null | undefined, now: Date = new Date()): string => {
    const date = toDate(value);
    if (!date) return '';
    const diff = Math.max(0, now.getTime() - date.getTime());
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'now';
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d`;
    if (days < 30) return `${Math.floor(days / 7)}w`;
    if (days < 365) return `${Math.max(1, Math.floor(days / 30.44))}mo`;
    return `${Math.floor(days / 365.25)}yr`;
};

/** Up to two initials from a name or an email address. */
export const initialsOf = (name: string | null | undefined): string => {
    const clean = (name || '').trim();
    if (!clean) return '?';
    const base = clean.includes('@') ? clean.split('@')[0] : clean;
    const words = base.split(/[\s._-]+/).filter(Boolean);
    if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
    return base.slice(0, 2).toUpperCase();
};

const PALETTE = ['#FF7A45', '#2F80ED', '#9B51E0', '#27AE60', '#EB5757', '#F2994A', '#00A3BF', '#E84393', '#5E60CE', '#7CB342'];

/** A stable colour for a name (workspace letters, initials avatars). */
export const colorFor = (key: string | null | undefined): string => {
    const text = key || '';
    let hash = 0;
    for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) | 0;
    return PALETTE[Math.abs(hash) % PALETTE.length];
};
