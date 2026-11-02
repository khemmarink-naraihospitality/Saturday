import { isFunctionName } from '../../lib/formula/engine';

export type SegmentKind = 'ref' | 'fn' | 'str' | 'num' | 'op' | 'bool' | 'plain';

export interface Segment {
    text: string;
    kind: SegmentKind;
    /** Inside the part a syntax error points at. */
    bad?: boolean;
}

/**
 * Colours for a formula as it is typed: never throws, whatever the text
 * (half-typed strings and braces included), and covers every character exactly
 * once, so the coloured copy drawn behind the text box lines up with it.
 */
export const highlightFormula = (text: string, bad?: { at: number; end: number } | null): Segment[] => {
    const raw: { start: number; end: number; kind: SegmentKind }[] = [];
    let i = 0;
    const push = (start: number, end: number, kind: SegmentKind) => {
        if (end > start) raw.push({ start, end, kind });
    };
    while (i < text.length) {
        const c = text[i];
        if (c === '{') {
            const close = text.indexOf('}', i + 1);
            const end = close < 0 ? text.length : close + 1;
            push(i, end, 'ref');
            i = end;
            continue;
        }
        if ('"“”\'‘’'.includes(c)) {
            const family = '"“”'.includes(c) ? '"“”' : '\'‘’';
            let j = i + 1;
            while (j < text.length && !family.includes(text[j])) j++;
            const end = Math.min(text.length, j + 1);
            push(i, end, 'str');
            i = end;
            continue;
        }
        const num = /^(?:\d+(?:\.\d*)?|\.\d+)/.exec(text.slice(i));
        if (num) {
            push(i, i + num[0].length, 'num');
            i += num[0].length;
            continue;
        }
        const word = /^[A-Za-z_][A-Za-z0-9_.]*/.exec(text.slice(i));
        if (word) {
            const w = word[0];
            const upper = w.toUpperCase();
            const kind: SegmentKind = upper === 'TRUE' || upper === 'FALSE' ? 'bool' : isFunctionName(w) ? 'fn' : 'plain';
            push(i, i + w.length, kind);
            i += w.length;
            continue;
        }
        if ('+-*/^%&=<>(),;!×÷−≤≥≠'.includes(c)) {
            push(i, i + 1, 'op');
            i++;
            continue;
        }
        // Spaces and anything else: plain, merged with plain neighbours below.
        push(i, i + 1, 'plain');
        i++;
    }

    // Split at the error's edges so just that stretch is underlined.
    const cuts = bad && bad.end > bad.at ? [bad.at, bad.end] : [];
    const out: Segment[] = [];
    raw.forEach(r => {
        const points = [r.start, ...cuts.filter(p => p > r.start && p < r.end), r.end];
        for (let k = 0; k + 1 < points.length; k++) {
            const start = points[k];
            const end = points[k + 1];
            const isBad = !!bad && start >= bad.at && end <= bad.end;
            const prev = out[out.length - 1];
            const seg: Segment = { text: text.slice(start, end), kind: r.kind, bad: isBad || undefined };
            if (prev && prev.kind === seg.kind && seg.kind === 'plain' && prev.bad === seg.bad) prev.text += seg.text;
            else out.push(seg);
        }
    });
    return out;
};
