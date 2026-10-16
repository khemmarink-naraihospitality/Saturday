import { sanitizeHtml } from './sanitizeHtml';

/**
 * Plain web addresses in updates become links — as they are pasted or typed
 * into the update editors (RichTextEditor, the phone composer), and when a
 * stored update is shown, so posts written before this, or an address typed at
 * the end of a line, are clickable too. One rule for all of them: findUrls,
 * which is pure (tests/linkify_test.ts); the rest work on DOM nodes.
 */

// An address runs until whitespace, a quote or an angle bracket — and stops at
// non-ASCII as well, because Thai is written without spaces and often runs
// straight on after a link ("ดูที่ https://x.co/aครับ"). Addresses copied from
// a browser have their non-ASCII percent-encoded, so they stay whole.
const URL_RE = /(?:https?:\/\/|www\.)[A-Za-z0-9\-._~:/?#[\]@!$&()*+,;=%]+/gi;
const TRAILING_PUNCTUATION = /[.,;:!?]+$/;

export interface UrlMatch {
    start: number;
    end: number;
    /** The address as written. */
    text: string;
    /** Where it goes: "www." addresses get https://. */
    href: string;
}

const count = (s: string, ch: string) => s.split(ch).length - 1;

/** Has a host: "https://" or "www." alone is not an address. */
const isLinkable = (url: string) =>
    /^https?:\/\/[A-Za-z0-9-]/i.test(url) || /^www\.[A-Za-z0-9-]+\.[A-Za-z]{2,}/i.test(url);

/** The web addresses in a piece of text, in order. */
export const findUrls = (text: string): UrlMatch[] => {
    const found: UrlMatch[] = [];
    if (!text) return found;
    URL_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = URL_RE.exec(text))) {
        const start = match.index;
        // Only at the start of a word: not "awww.x", "a@www.x" or the middle of a path.
        const before = start > 0 ? text[start - 1] : '';
        if (before && /[A-Za-z0-9@._\-/]/.test(before)) continue;

        let url = match[0];
        // A full stop or comma after an address belongs to the sentence, and so
        // does a closing bracket the address never opened ("(see https://x.co)").
        for (let changed = true; changed;) {
            changed = false;
            const trimmed = url.replace(TRAILING_PUNCTUATION, '');
            if (trimmed !== url) {
                url = trimmed;
                changed = true;
            }
            for (const [open, close] of [['(', ')'], ['[', ']']]) {
                if (url.endsWith(close) && count(url, close) > count(url, open)) {
                    url = url.slice(0, -1);
                    changed = true;
                }
            }
        }
        if (!isLinkable(url)) continue;
        found.push({ start, end: start + url.length, text: url, href: /^www\./i.test(url) ? `https://${url}` : url });
    }
    return found;
};

// ── DOM ────────────────────────────────────────────────────────────────────

/** How the editor's own link button styles a link (RichTextEditor.insertLink). */
const LINK_STYLE = 'color: #0073ea; text-decoration: underline;';

const createLink = (doc: Document, href: string, text: string) => {
    const a = doc.createElement('a');
    a.setAttribute('href', href);
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener noreferrer');
    a.setAttribute('style', LINK_STYLE);
    a.textContent = text;
    return a;
};

const SKIPPED_TAGS = new Set(['A', 'CODE', 'PRE', 'SCRIPT', 'STYLE', 'TEXTAREA', 'BUTTON']);

/** Text that must stay as it is: inside a link already, code, or an @mention chip. */
const isProtected = (node: Node, root: Node) => {
    for (let el = node.parentNode; el && el !== root; el = el.parentNode) {
        if (el.nodeType !== 1) continue;
        const element = el as Element;
        if (SKIPPED_TAGS.has(element.tagName) || element.hasAttribute('data-id') || element.getAttribute('contenteditable') === 'false') {
            return true;
        }
    }
    return false;
};

const MAYBE_URL = /https?:|www\./i;

/**
 * Wraps the plain web addresses in the text under `root` in links. With
 * `keepCaret` (a live editor), a caret in a text node that gets split is put
 * back at the same place — after the link if it sat at the link's end, so
 * typing carries on outside it. Returns whether anything changed.
 */
export const linkifyNode = (root: Node, keepCaret = false): boolean => {
    const doc = root.ownerDocument || (root as Document);
    const walker = doc.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */);
    const targets: Text[] = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = node as Text;
        if (!MAYBE_URL.test(text.data) || isProtected(text, root)) continue;
        if (findUrls(text.data).length) targets.push(text);
    }
    if (targets.length === 0) return false;

    const selection = keepCaret ? doc.getSelection?.() : null;
    const caret = selection && selection.rangeCount > 0 && selection.isCollapsed
        ? { node: selection.anchorNode, offset: selection.anchorOffset }
        : null;
    let restoreCaret: (() => void) | null = null;

    for (const text of targets) {
        const data = text.data;
        const pieces: { node: Node; from: number; to: number; link: boolean }[] = [];
        const fragment = doc.createDocumentFragment();
        let last = 0;
        const addText = (from: number, to: number) => {
            const node = doc.createTextNode(data.slice(from, to));
            fragment.appendChild(node);
            pieces.push({ node, from, to, link: false });
        };
        for (const match of findUrls(data)) {
            if (match.start > last) addText(last, match.start);
            const link = createLink(doc, match.href, match.text);
            fragment.appendChild(link);
            pieces.push({ node: link, from: match.start, to: match.end, link: true });
            last = match.end;
        }
        if (last < data.length) addText(last, data.length);

        if (caret && caret.node === text && selection) {
            const at = caret.offset;
            const inText = pieces.find(p => !p.link && at >= p.from && at <= p.to);
            const inLink = pieces.find(p => p.link && at > p.from && at <= p.to);
            restoreCaret = () => {
                const range = doc.createRange();
                if (inText) range.setStart(inText.node, at - inText.from);
                else range.setStartAfter((inLink || pieces[pieces.length - 1]).node);
                range.collapse(true);
                selection.removeAllRanges();
                selection.addRange(range);
            };
        }
        text.parentNode?.replaceChild(fragment, text);
    }
    restoreCaret?.();
    return true;
};

/**
 * Just after a space is typed in an editor: if the word before it is a web
 * address, it becomes a link. The caret stays after the space, outside it.
 */
export const autolinkBeforeCaret = (root: HTMLElement): boolean => {
    const doc = root.ownerDocument;
    const selection = doc.getSelection();
    if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) return false;
    const node = selection.anchorNode;
    const offset = selection.anchorOffset;
    if (!node || node.nodeType !== 3 || !root.contains(node) || isProtected(node, root)) return false;

    const text = node as Text;
    const before = text.data.slice(0, offset);
    if (!/[\s ]$/.test(before)) return false;
    const typed = before.replace(/[\s ]+$/, '');
    const wordStart = Math.max(typed.lastIndexOf(' '), typed.lastIndexOf(' '), typed.lastIndexOf('\n'), typed.lastIndexOf('\t')) + 1;
    // The word may open with a bracket or quote ("(https://x.co)"): findUrls
    // starts the address after it and leaves trailing punctuation outside.
    const matches = findUrls(typed.slice(wordStart));
    if (matches.length !== 1) return false;

    const { href, text: url } = matches[0];
    const start = wordStart + matches[0].start;
    const stop = wordStart + matches[0].end;
    const after = text.splitText(stop);
    const urlNode = text.splitText(start);
    urlNode.parentNode?.replaceChild(createLink(doc, href, url), urlNode);
    if (text.data === '') text.remove();

    const range = doc.createRange();
    range.setStart(after, offset - stop);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    return true;
};

// ── Showing stored updates ─────────────────────────────────────────────────

/** Stored (already sanitised) HTML with its plain addresses made into links. */
export const linkifyHtml = (html: string): string => {
    if (!html || !MAYBE_URL.test(html)) return html;
    const template = document.createElement('template');
    template.innerHTML = html;
    return linkifyNode(template.content) ? template.innerHTML : html;
};

const shown = new Map<string, string>();

/**
 * An update or reply as it is drawn: sanitised (sanitizeHtml — see there for
 * why) with its plain addresses made into links. The stored text is left as
 * it was. Remembered per content, since a thread re-renders on every keystroke
 * in its composer.
 */
export const displayUpdateHtml = (content: string | null | undefined): string => {
    const key = content || '';
    const cached = shown.get(key);
    if (cached !== undefined) return cached;
    const html = linkifyHtml(sanitizeHtml(key));
    if (shown.size >= 500) shown.clear();
    shown.set(key, html);
    return html;
};
