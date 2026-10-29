/**
 * NHG shows a Priority column's 1–5 star rating as a word: 4–5 High, 3 Medium,
 * 1–2 Low (src/lib/brand.ts). The stored number does not change — Saturday
 * still shows the stars — and picking a word writes that word's own rating.
 */
export interface PriorityLevel {
    id: 'high' | 'medium' | 'low';
    label: string;
    /** What picking this level stores. */
    rating: number;
    color: string;
}

export const PRIORITY_LEVELS: PriorityLevel[] = [
    { id: 'high', label: 'High', rating: 5, color: '#c70036' },
    { id: 'medium', label: 'Medium', rating: 3, color: '#d08a00' },
    { id: 'low', label: 'Low', rating: 1, color: '#6f8a5a' },
];

/** A stored value as a 0–5 rating; anything that isn't one reads as 0 (unrated). */
export const toRating = (value: unknown): number => {
    const n = typeof value === 'number' ? value : parseInt(String(value), 10);
    if (!Number.isFinite(n)) return 0;
    return Math.min(5, Math.max(0, Math.round(n)));
};

export const priorityLevel = (value: unknown): PriorityLevel | null => {
    const rating = toRating(value);
    if (rating >= 4) return PRIORITY_LEVELS[0];
    if (rating === 3) return PRIORITY_LEVELS[1];
    if (rating >= 1) return PRIORITY_LEVELS[2];
    return null;
};
