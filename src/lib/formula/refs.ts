import type { Column } from '../../types';
import { decodeRef, encodeRef, tokenize, type Token } from './engine';

/*
 * A formula names columns by id when stored ({#<id>}, {#<id>:end}) and by title
 * when someone reads or types it ({Price}, {Timeline#End}). These convert
 * between the two against the columns of the formula's own set — the item
 * columns, or one group's sub-item columns.
 */

/** The item's own name: {#name}. */
export const NAME_REF = 'name';

const PART_LABEL: Record<string, string> = { start: 'Start', end: 'End', days: 'Days' };
const clean = (title: string) => title.replace(/[{}#]/g, '').trim() || 'Untitled';
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * How a column is written inside { }: its title, or "Status (2)" for the second
 * of two columns with the same title.
 */
export const refName = (column: Column, siblings: Column[]): string => {
    const title = clean(column.title);
    const namesakes = siblings.filter(c => same(clean(c.title), title));
    const n = namesakes.findIndex(c => c.id === column.id) + 1;
    return n > 1 ? `${title} (${n})` : title;
};

/** {Name} unless a real column is called that, then {Item name}. */
export const nameRefName = (siblings: Column[]): string =>
    siblings.some(c => same(clean(c.title), 'Name')) ? 'Item name' : 'Name';

const NAME_ALIASES = ['name', 'item name', 'item', 'task', 'task name', 'item title'];

/** The text a stored reference reads as, braces included. */
export const refText = (id: string, part: string | undefined, siblings: Column[]): string => {
    if (id === NAME_REF) return `{${nameRefName(siblings)}}`;
    const column = siblings.find(c => c.id === id);
    const name = column ? refName(column, siblings) : 'Deleted column';
    return `{${name}${part && PART_LABEL[part] ? `#${PART_LABEL[part]}` : ''}}`;
};

/** The column a typed title names, or null. */
export const resolveTitle = (title: string, siblings: Column[]): { id: string } | null => {
    const t = title.trim();
    const exact = siblings.find(c => same(clean(c.title), t));
    if (exact) return { id: exact.id };
    const numbered = /^(.*)\((\d+)\)\s*$/.exec(t);
    if (numbered) {
        const namesakes = siblings.filter(c => same(clean(c.title), numbered[1]));
        const hit = namesakes[Number(numbered[2]) - 1];
        if (hit) return { id: hit.id };
    }
    if (NAME_ALIASES.includes(t.toLowerCase())) return { id: NAME_REF };
    return null;
};

/** Replaces each {…} token with what `rewrite` returns for it, right to left so offsets hold. */
const rewriteRefs = (text: string, rewrite: (tok: Extract<Token, { k: 'ref' }>) => string | null): string | null => {
    let toks: Token[];
    try {
        toks = tokenize(text);
    } catch {
        return null;
    }
    let out = text;
    for (let i = toks.length - 1; i >= 0; i--) {
        const t = toks[i];
        if (t.k !== 'ref') continue;
        const next = rewrite(t);
        if (next !== null) out = out.slice(0, t.at) + next + out.slice(t.end);
    }
    return out;
};

/** A stored expression as it reads: {#<id>:end} → {Timeline#End}. */
export const toEditable = (stored: string, siblings: Column[]): string =>
    rewriteRefs(stored, tok => {
        const target = decodeRef(tok.raw);
        return target.id ? refText(target.id, target.part, siblings) : null;
    }) ?? stored;

/**
 * A typed expression as stored: {Timeline#End} → {#<id>:end}. Titles that
 * name no column are left as typed and listed in `unknown`.
 */
export const fromEditable = (text: string, siblings: Column[]): { stored: string; unknown: string[] } => {
    const unknown: string[] = [];
    const stored = rewriteRefs(text, tok => {
        const target = decodeRef(tok.raw);
        if (target.id) return null;
        const hit = resolveTitle(target.title || '', siblings);
        if (!hit) {
            unknown.push(tok.raw.trim());
            return null;
        }
        return encodeRef(hit.id, target.part);
    });
    return { stored: stored ?? text, unknown };
};

/** A stored expression with its column ids swapped through `map` (a copied board, a linked group). */
export const remapExpr = (stored: string, map: (id: string) => string | undefined): string =>
    rewriteRefs(stored, tok => {
        const target = decodeRef(tok.raw);
        if (!target.id || target.id === NAME_REF) return null;
        const next = map(target.id);
        return next ? encodeRef(next, target.part) : null;
    }) ?? stored;

/** The column ids a stored expression reads. */
export const exprColumnIds = (stored: string): string[] => {
    const ids: string[] = [];
    rewriteRefs(stored, tok => {
        const target = decodeRef(tok.raw);
        if (target.id && target.id !== NAME_REF) ids.push(target.id);
        return null;
    });
    return ids;
};
