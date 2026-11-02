/**
 * The formula language of a Formula column, in the style of monday.com's:
 * {Column} references, + - * / ^ and % for numbers, & to join text, the
 * comparisons = <> < > <= >=, and functions such as IF, SUM, ROUND, DAYS and
 * TODAY. An expression is parsed once (cached by its text) and evaluated per
 * row; the row's values come in through `env.ref`, so nothing here knows about
 * React, the store or column types (src/lib/formula/index.ts does).
 *
 * Errors are values (#DIV/0!, #REF!…) rather than exceptions: they flow through
 * the expression the way they do in a spreadsheet, and IFERROR can catch them.
 * Dates are calendar days — no time of day, no time zone — counted from
 * 1970-01-01, so "is this date before today" means the same in every zone.
 */

// ---- values -----------------------------------------------------------------

export interface FDate { t: 'date'; day: number }
/** Text with a colour: a status label, or a label a rule shows. */
export interface FLabel { t: 'label'; text: string; color: string }
export interface FError { t: 'error'; code: string; message: string }
export type FValue = number | string | boolean | FDate | FLabel | FError | null;

export const fError = (code: string, message: string): FError => ({ t: 'error', code, message });
export const fDate = (day: number): FDate => ({ t: 'date', day });
export const fLabel = (text: string, color: string): FLabel => ({ t: 'label', text, color });

export const isError = (v: unknown): v is FError => typeof v === 'object' && v !== null && !Array.isArray(v) && (v as FError).t === 'error';
export const isDate = (v: FValue): v is FDate => typeof v === 'object' && v !== null && v.t === 'date';
export const isLabel = (v: FValue): v is FLabel => typeof v === 'object' && v !== null && v.t === 'label';
/** Nothing there: an empty cell, empty text or a label with no words. */
export const isBlank = (v: FValue): boolean =>
    v === null || v === '' || (isLabel(v) && v.text === '');

// ---- calendar days ----------------------------------------------------------

const MS_DAY = 86400000;

export const dayFromParts = (y: number, m: number, d: number): number => Math.round(Date.UTC(y, m - 1, d) / MS_DAY);

/** "2026-11-01" (anything after the date is ignored) → its day; null when it isn't one. */
export const dayFromISO = (s: unknown): number | null => {
    if (typeof s !== 'string') return null;
    const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s.trim());
    if (!m) return null;
    const y = Number(m[1]); const mo = Number(m[2]); const d = Number(m[3]);
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return dayFromParts(y, mo, d);
};

export const partsFromDay = (day: number) => {
    const dt = new Date(day * MS_DAY);
    return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate(), weekday: dt.getUTCDay() };
};

export const isoFromDay = (day: number): string => new Date(day * MS_DAY).toISOString().slice(0, 10);

/** Today on this device's calendar. */
export const todayDay = (now: Date = new Date()): number => dayFromParts(now.getFullYear(), now.getMonth() + 1, now.getDate());

// ---- tokens -----------------------------------------------------------------

export type Token =
    | { k: 'num'; v: number; at: number; end: number }
    | { k: 'str'; v: string; at: number; end: number }
    | { k: 'ref'; raw: string; at: number; end: number }
    | { k: 'id'; v: string; at: number; end: number }
    | { k: 'op'; v: string; at: number; end: number }
    | { k: 'eof'; at: number; end: number };

export class FormulaSyntaxError extends Error {
    at: number;
    end: number;
    constructor(message: string, at: number, end: number) {
        super(message);
        this.at = at;
        this.end = end;
    }
}

// Quotes typed on a phone or pasted from a document arrive curly.
const DOUBLE_QUOTES = '"“”„';
const SINGLE_QUOTES = "'‘’";
// The editor's operator buttons write × ÷ − as their ASCII forms, but a pasted
// formula may still carry them.
const OP_ALIASES: Record<string, string> = { '×': '*', '÷': '/', '−': '-', '≤': '<=', '≥': '>=', '≠': '<>', ';': ',' };
const TWO_CHAR_OPS = ['<=', '>=', '<>', '!=', '=='];
const ONE_CHAR_OPS = '+-*/^%&=<>(),';

export const tokenize = (src: string): Token[] => {
    const out: Token[] = [];
    let i = 0;
    while (i < src.length) {
        const c = src[i];
        if (/\s/.test(c)) { i++; continue; }

        if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
            const m = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(src.slice(i))!;
            out.push({ k: 'num', v: parseFloat(m[0]), at: i, end: i + m[0].length });
            i += m[0].length;
            continue;
        }

        if (DOUBLE_QUOTES.includes(c) || SINGLE_QUOTES.includes(c)) {
            const family = DOUBLE_QUOTES.includes(c) ? DOUBLE_QUOTES : SINGLE_QUOTES;
            let j = i + 1;
            let text = '';
            let closed = false;
            while (j < src.length) {
                if (family.includes(src[j])) {
                    // A doubled quote is a quote inside the text, as in a spreadsheet.
                    if (family.includes(src[j + 1] || '') && src[j + 1] === src[j]) { text += src[j]; j += 2; continue; }
                    closed = true;
                    break;
                }
                text += src[j];
                j++;
            }
            if (!closed) throw new FormulaSyntaxError('This text is missing its closing quote', i, src.length);
            out.push({ k: 'str', v: text, at: i, end: j + 1 });
            i = j + 1;
            continue;
        }

        if (c === '{') {
            const close = src.indexOf('}', i + 1);
            const nextOpen = src.indexOf('{', i + 1);
            if (close < 0 || (nextOpen >= 0 && nextOpen < close)) {
                throw new FormulaSyntaxError('This column name is missing its closing }', i, close < 0 ? src.length : nextOpen);
            }
            out.push({ k: 'ref', raw: src.slice(i + 1, close), at: i, end: close + 1 });
            i = close + 1;
            continue;
        }
        if (c === '}') throw new FormulaSyntaxError('There is a } with no { before it', i, i + 1);

        if (/[A-Za-z_]/.test(c)) {
            const m = /^[A-Za-z_][A-Za-z0-9_.]*/.exec(src.slice(i))!;
            out.push({ k: 'id', v: m[0], at: i, end: i + m[0].length });
            i += m[0].length;
            continue;
        }

        const two = src.slice(i, i + 2);
        if (TWO_CHAR_OPS.includes(two)) {
            out.push({ k: 'op', v: two === '==' ? '=' : two === '!=' ? '<>' : two, at: i, end: i + 2 });
            i += 2;
            continue;
        }
        const alias = OP_ALIASES[c];
        if (alias || ONE_CHAR_OPS.includes(c)) {
            out.push({ k: 'op', v: alias || c, at: i, end: i + 1 });
            i++;
            continue;
        }
        throw new FormulaSyntaxError(`"${c}" can't be used here`, i, i + 1);
    }
    out.push({ k: 'eof', at: src.length, end: src.length });
    return out;
};

// ---- syntax tree --------------------------------------------------------------

/** What a {…} names: a column by id (stored form) or by title (as typed), and which part of it. */
export interface RefTarget { id?: string; title?: string; part?: string }

export type FormulaNode =
    | { k: 'num'; v: number }
    | { k: 'str'; v: string }
    | { k: 'bool'; v: boolean }
    | ({ k: 'ref'; at: number; end: number } & RefTarget)
    | { k: 'neg'; a: FormulaNode }
    | { k: 'pct'; a: FormulaNode }
    | { k: 'bin'; op: string; a: FormulaNode; b: FormulaNode }
    | { k: 'call'; name: string; args: FormulaNode[]; at: number; end: number };

export const REF_PARTS = ['start', 'end', 'days'] as const;

/**
 * The inside of {…}. Stored formulas name columns by id — `#<id>` or
 * `#<id>:end` — so renaming a column doesn't break them; the editor shows and
 * accepts titles — `Price`, `Timeline#End` — and converts (src/lib/formula/refs.ts).
 */
export const decodeRef = (raw: string): RefTarget => {
    if (raw.startsWith('#')) {
        const [id, part] = raw.slice(1).split(':');
        return { id: id.trim(), part: part?.trim().toLowerCase() || undefined };
    }
    const title = raw.trim();
    const hash = title.lastIndexOf('#');
    if (hash > 0) {
        const part = title.slice(hash + 1).trim().toLowerCase();
        if ((REF_PARTS as readonly string[]).includes(part)) return { title: title.slice(0, hash).trim(), part };
    }
    return { title };
};

export const encodeRef = (id: string, part?: string): string => `{#${id}${part ? `:${part}` : ''}}`;

export interface ParseResult {
    ast: FormulaNode | null;
    error: { message: string; at: number; end: number } | null;
}

const parseUncached = (src: string): ParseResult => {
    let toks: Token[];
    try {
        toks = tokenize(src);
    } catch (e) {
        if (e instanceof FormulaSyntaxError) return { ast: null, error: { message: e.message, at: e.at, end: e.end } };
        throw e;
    }
    let pos = 0;
    const peek = () => toks[pos];
    const isOp = (v: string) => { const t = toks[pos]; return t.k === 'op' && t.v === v; };
    const fail = (message: string, t: Token = toks[pos]): never => { throw new FormulaSyntaxError(message, t.at, Math.max(t.end, t.at + 1)); };
    const describe = (t: Token) => t.k === 'eof' ? 'the end' : t.k === 'op' ? `"${t.v}"` : t.k === 'str' ? 'a text' : t.k === 'num' ? `the number ${t.v}` : t.k === 'ref' ? `{${t.raw}}` : `"${t.v}"`;

    const COMPARE = ['=', '<>', '<', '>', '<=', '>='];

    const parseCompare = (): FormulaNode => {
        let a = parseConcat();
        while (peek().k === 'op' && COMPARE.includes((peek() as { v: string }).v)) {
            const op = (toks[pos++] as { v: string }).v;
            a = { k: 'bin', op, a, b: parseConcat() };
        }
        return a;
    };
    const parseConcat = (): FormulaNode => {
        let a = parseAdd();
        while (isOp('&')) { pos++; a = { k: 'bin', op: '&', a, b: parseAdd() }; }
        return a;
    };
    const parseAdd = (): FormulaNode => {
        let a = parseMul();
        while (isOp('+') || isOp('-')) {
            const op = (toks[pos++] as { v: string }).v;
            a = { k: 'bin', op, a, b: parseMul() };
        }
        return a;
    };
    const parseMul = (): FormulaNode => {
        let a = parsePow();
        while (isOp('*') || isOp('/')) {
            const op = (toks[pos++] as { v: string }).v;
            a = { k: 'bin', op, a, b: parsePow() };
        }
        return a;
    };
    // Right-associative, below the unary minus, as in a spreadsheet (-2^2 = 4).
    const parsePow = (): FormulaNode => {
        const a = parseUnary();
        if (isOp('^')) { pos++; return { k: 'bin', op: '^', a, b: parsePow() }; }
        return a;
    };
    const parseUnary = (): FormulaNode => {
        if (isOp('-')) { pos++; return { k: 'neg', a: parseUnary() }; }
        if (isOp('+')) { pos++; return parseUnary(); }
        return parsePostfix();
    };
    const parsePostfix = (): FormulaNode => {
        let a = parsePrimary();
        while (isOp('%')) { pos++; a = { k: 'pct', a }; }
        return a;
    };
    const parsePrimary = (): FormulaNode => {
        const t = peek();
        if (t.k === 'num') { pos++; return { k: 'num', v: t.v }; }
        if (t.k === 'str') { pos++; return { k: 'str', v: t.v }; }
        if (t.k === 'ref') {
            pos++;
            if (!t.raw.trim()) fail('Put a column name between { and }', t);
            return { k: 'ref', at: t.at, end: t.end, ...decodeRef(t.raw) };
        }
        if (t.k === 'id') {
            pos++;
            const upper = t.v.toUpperCase();
            if (isOp('(')) {
                const def = FUNCTIONS[upper];
                if (!def) return fail(`There is no function called ${t.v}`, t);
                pos++; // (
                const args: FormulaNode[] = [];
                if (!isOp(')')) {
                    for (;;) {
                        if (isOp(',') || isOp(')')) fail(`A value is missing in ${upper}( )`);
                        args.push(parseCompare());
                        if (isOp(',')) { pos++; continue; }
                        break;
                    }
                }
                if (!isOp(')')) fail(`${upper}( is missing its closing )`, peek().k === 'eof' ? t : peek());
                const close = toks[pos++];
                if (args.length < def.min || args.length > def.max) {
                    fail(`${upper} takes ${arityText(def)} — ${def.signature}`, { k: 'id', v: t.v, at: t.at, end: close.end });
                }
                return { k: 'call', name: upper, args, at: t.at, end: close.end };
            }
            if (upper === 'TRUE') return { k: 'bool', v: true };
            if (upper === 'FALSE') return { k: 'bool', v: false };
            if (FUNCTIONS[upper]) return fail(`${upper} needs brackets: ${FUNCTIONS[upper].signature}`, t);
            return fail(`"${t.v}" isn't a column or a function — put column names in { } and text in quotes`, t);
        }
        if (isOp('(')) {
            pos++;
            if (isOp(')')) fail('These brackets are empty');
            const e = parseCompare();
            if (!isOp(')')) fail(peek().k === 'eof' ? 'A ( is missing its closing )' : `Expected ) but found ${describe(peek())}`);
            pos++;
            return e;
        }
        if (t.k === 'eof') return fail(pos === 0 ? 'The formula is empty' : 'The formula ends too soon — something is missing at the end');
        return fail(`${describe(t)} can't be used here`);
    };

    try {
        if (toks[0].k === 'eof') return { ast: null, error: { message: 'The formula is empty', at: 0, end: 0 } };
        const ast = parseCompare();
        if (peek().k !== 'eof') {
            const t = peek();
            const message = t.k === 'op' && t.v === ')' ? 'There is a ) with no ( before it' : `${describe(t)} can't follow what is before it — is an operator or a comma missing?`;
            throw new FormulaSyntaxError(message, t.at, t.end);
        }
        return { ast, error: null };
    } catch (e) {
        if (e instanceof FormulaSyntaxError) return { ast: null, error: { message: e.message, at: e.at, end: e.end } };
        throw e;
    }
};

const parseCache = new Map<string, ParseResult>();

/** The syntax tree of an expression, or where and why it doesn't read. Cached by text. */
export const parseFormula = (src: string): ParseResult => {
    const hit = parseCache.get(src);
    if (hit) return hit;
    const result = parseUncached(src);
    if (parseCache.size > 500) parseCache.clear();
    parseCache.set(src, result);
    return result;
};

/** Every {…} in a tree, in order. */
export const collectRefs = (node: FormulaNode | null, out: Extract<FormulaNode, { k: 'ref' }>[] = []) => {
    if (!node) return out;
    switch (node.k) {
        case 'ref': out.push(node); break;
        case 'neg': case 'pct': collectRefs(node.a, out); break;
        case 'bin': collectRefs(node.a, out); collectRefs(node.b, out); break;
        case 'call': node.args.forEach(a => collectRefs(a, out)); break;
    }
    return out;
};

// ---- coercion -----------------------------------------------------------------

/** A number as text, without the float noise (0.1 + 0.2 reads 0.3). */
export const plainNumber = (n: number): string =>
    Number.isInteger(n) ? String(n) : String(parseFloat(n.toPrecision(12)));

export const toText = (v: FValue): string => {
    if (v === null) return '';
    if (typeof v === 'string') return v;
    if (typeof v === 'number') return plainNumber(v);
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    if (isDate(v)) return isoFromDay(v.day);
    if (isLabel(v)) return v.text;
    return v.code;
};

/** Text as a number: "1,200", "฿1,200", "50%" (0.5), " 7 ". NaN when it isn't one. */
export const parseNumberText = (s: string): number => {
    let t = s.trim().replace(/[,\s]/g, '');
    if (t === '') return NaN;
    t = t.replace(/^[$€£฿¥₹]/, '');
    let scale = 1;
    if (t.endsWith('%')) { scale = 0.01; t = t.slice(0, -1); }
    if (!/^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(t)) return NaN;
    return parseFloat(t) * scale;
};

export const toNumber = (v: FValue): number | FError => {
    if (v === null) return 0;
    if (typeof v === 'number') return Number.isFinite(v) ? v : fError('#NUM!', 'The number is too large');
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (isError(v)) return v;
    if (isDate(v)) return fError('#VALUE!', 'A date isn\'t a number here — DAYS(end, start) counts the days between two dates');
    const s = isLabel(v) ? v.text : v;
    if (s.trim() === '') return 0;
    const n = parseNumberText(s);
    return Number.isNaN(n) ? fError('#VALUE!', `"${s}" isn't a number`) : n;
};

export const toBool = (v: FValue): boolean | FError => {
    if (v === null) return false;
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v !== 0;
    if (isError(v)) return v;
    if (isDate(v)) return true;
    const s = (isLabel(v) ? v.text : v).trim().toLowerCase();
    if (s === '' || s === 'false' || s === '0' || s === 'no') return false;
    return true;
};

/** A date, an ISO date text, or blank (null). */
const toDay = (v: FValue): number | null | FError => {
    if (v === null || v === '') return null;
    if (isDate(v)) return v.day;
    if (isError(v)) return v;
    if (typeof v === 'string' || isLabel(v)) {
        const text = isLabel(v) ? v.text : v;
        const d = dayFromISO(text);
        if (d !== null) return d;
        return text.trim() === '' ? null : fError('#VALUE!', `"${text}" isn't a date — write dates as "2026-12-31" or DATE(2026, 12, 31)`);
    }
    return fError('#VALUE!', 'Expected a date');
};

const round = (n: number, digits: number, mode: 'nearest' | 'up' | 'down'): number => {
    const d = Math.max(-10, Math.min(10, Math.trunc(digits)));
    const sign = n < 0 ? -1 : 1;
    const abs = Math.abs(n);
    // Shifting by exponent text avoids 1.005 * 100 = 100.49999…
    const shifted = Number(`${abs}e${d}`);
    const r = mode === 'nearest' ? Math.round(shifted) : mode === 'up' ? Math.ceil(shifted - 1e-9) : Math.floor(shifted + 1e-9);
    return sign * Number(`${r}e${-d}`);
};

/**
 * <0, 0 or >0 for a against b, the way the comparison operators see it.
 * `null` means "can't say": a blank date compared with a date is neither
 * before nor after it, so an empty Due date is never "overdue".
 */
const compare = (a: FValue, b: FValue): number | null | FError => {
    if (isError(a)) return a;
    if (isError(b)) return b;
    if (isDate(a) || isDate(b)) {
        const da = toDay(a);
        const db = toDay(b);
        if (isError(da)) return da;
        if (isError(db)) return db;
        if (da === null && db === null) return 0;
        if (da === null || db === null) return null;
        return da - db;
    }
    const numberish = (v: FValue) => v === null || typeof v === 'number' || typeof v === 'boolean' ||
        (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(parseNumberText(v))) ||
        (isLabel(v) && v.text.trim() !== '' && !Number.isNaN(parseNumberText(v.text)));
    const blankText = (v: FValue) => v === null || v === '' || (isLabel(v) && v.text === '');
    if (numberish(a) && numberish(b) && !(blankText(a) && blankText(b))) {
        // A blank against text compares as text below; against a number, as 0.
        const na = toNumber(a) as number;
        const nb = toNumber(b) as number;
        return na === nb ? 0 : na < nb ? -1 : 1;
    }
    const ta = toText(a).trim().toLowerCase();
    const tb = toText(b).trim().toLowerCase();
    return ta === tb ? 0 : ta < tb ? -1 : 1;
};

// ---- functions ----------------------------------------------------------------

export interface EvalEnv {
    /** The value a {…} stands for in the row being evaluated. */
    ref: (target: RefTarget) => FValue;
    /** Today, as a calendar day (todayDay()). */
    today: number;
}

type Evaluate = (node: FormulaNode) => FValue;

interface FunctionDef {
    min: number;
    max: number;
    category: 'Logic' | 'Numbers' | 'Text' | 'Dates';
    signature: string;
    description: string;
    example: string;
    /** Gets its arguments unevaluated, to evaluate only what it needs (IF, AND…). */
    lazy?: (args: FormulaNode[], ev: Evaluate, env: EvalEnv) => FValue;
    run?: (args: FValue[], env: EvalEnv) => FValue;
}

const arityText = (def: FunctionDef) =>
    def.min === def.max ? `${def.min} value${def.min === 1 ? '' : 's'}`
        : def.max === Infinity ? `at least ${def.min} value${def.min === 1 ? '' : 's'}`
            : `${def.min} to ${def.max} values`;

const firstError = (vals: FValue[]): FError | null => vals.find(isError) as FError | undefined ?? null;

/** The numbers among a function's values; blanks skipped. */
const numbersOf = (vals: FValue[]): number[] | FError => {
    const out: number[] = [];
    for (const v of vals) {
        if (isBlank(v)) continue;
        const n = toNumber(v);
        if (isError(n)) return n;
        out.push(n);
    }
    return out;
};

const num = (v: FValue): number | FError => toNumber(v);

const dateArg = (v: FValue, fn: string): number | null | FError => {
    const d = toDay(v);
    if (isError(d)) return fError(d.code, `${fn}: ${d.message}`);
    return d;
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Dates as words: YYYY YY MMMM MMM MM M DD D dddd ddd. */
export const formatDay = (day: number, pattern: string): string => {
    const { y, m, d, weekday } = partsFromDay(day);
    return pattern.replace(/YYYY|YY|MMMM|MMM|MM|M|DD|D|dddd|ddd/g, token => {
        switch (token) {
            case 'YYYY': return String(y);
            case 'YY': return String(y).slice(-2);
            case 'MMMM': return MONTHS[m - 1];
            case 'MMM': return MONTHS[m - 1].slice(0, 3);
            case 'MM': return String(m).padStart(2, '0');
            case 'M': return String(m);
            case 'DD': return String(d).padStart(2, '0');
            case 'D': return String(d);
            case 'dddd': return WEEKDAYS[weekday];
            case 'ddd': return WEEKDAYS[weekday].slice(0, 3);
            default: return token;
        }
    });
};

/** ISO-8601 week of the year (weeks start on Monday; week 1 holds the first Thursday). */
const isoWeek = (day: number): number => {
    const { weekday } = partsFromDay(day);
    const thursday = day - ((weekday + 6) % 7) + 3;
    const { y } = partsFromDay(thursday);
    return Math.floor((thursday - dayFromParts(y, 1, 1)) / 7) + 1;
};

/** Working days (Monday to Friday) from one date to another, both counted. */
const workdays = (from: number, to: number): number => {
    const sign = to < from ? -1 : 1;
    const start = Math.min(from, to);
    const end = Math.max(from, to);
    const span = end - start + 1;
    const weeks = Math.floor(span / 7);
    let count = weeks * 5;
    const startWeekday = partsFromDay(start + weeks * 7).weekday;
    for (let i = 0; i < span % 7; i++) {
        const wd = (startWeekday + i) % 7;
        if (wd !== 0 && wd !== 6) count++;
    }
    return sign * count;
};

/** TEXT(value, pattern) for numbers: 0, 0.00, #,##0, #,##0.0, 0%, 0.0%. */
const formatNumberPattern = (n: number, pattern: string): string => {
    const percent = pattern.includes('%');
    const value = percent ? n * 100 : n;
    const dot = pattern.indexOf('.');
    const decimals = dot >= 0 ? (pattern.slice(dot + 1).match(/[0#]/g) || []).length : 0;
    const grouped = pattern.includes(',');
    const text = value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: grouped });
    return percent ? `${text}%` : text;
};

const FUNCTIONS: Record<string, FunctionDef> = {
    // -- Logic
    IF: {
        min: 2, max: 3, category: 'Logic', signature: 'IF(condition, value if true, value if false)',
        description: 'Shows one value when the condition is true and another when it isn\'t.',
        example: 'IF({Budget} > 1000, "Over", "OK")',
        lazy: ([cond, yes, no], ev) => {
            const c = toBool(ev(cond));
            if (isError(c)) return c;
            return c ? ev(yes) : no ? ev(no) : null;
        },
    },
    IFS: {
        min: 2, max: Infinity, category: 'Logic', signature: 'IFS(condition 1, value 1, condition 2, value 2, …, [otherwise])',
        description: 'Checks conditions in order and shows the value of the first one that is true. A last value on its own is shown when none is.',
        example: 'IFS({Score} >= 80, "Great", {Score} >= 50, "Fair", "Low")',
        lazy: (args, ev) => {
            for (let i = 0; i + 1 < args.length; i += 2) {
                const c = toBool(ev(args[i]));
                if (isError(c)) return c;
                if (c) return ev(args[i + 1]);
            }
            return args.length % 2 === 1 ? ev(args[args.length - 1]) : null;
        },
    },
    IFERROR: {
        min: 2, max: 2, category: 'Logic', signature: 'IFERROR(value, value if error)',
        description: 'Shows the value, or the second value when the first one is an error (such as dividing by zero).',
        example: 'IFERROR({Spent} / {Budget}, 0)',
        lazy: ([value, fallback], ev) => {
            const v = ev(value);
            return isError(v) ? ev(fallback) : v;
        },
    },
    AND: {
        min: 1, max: Infinity, category: 'Logic', signature: 'AND(condition 1, condition 2, …)',
        description: 'True when every condition is true.',
        example: 'AND({Done} = TRUE, {Approved} = TRUE)',
        lazy: (args, ev) => {
            for (const a of args) {
                const b = toBool(ev(a));
                if (isError(b)) return b;
                if (!b) return false;
            }
            return true;
        },
    },
    OR: {
        min: 1, max: Infinity, category: 'Logic', signature: 'OR(condition 1, condition 2, …)',
        description: 'True when at least one condition is true.',
        example: 'OR({Status} = "Stuck", {Priority} >= 4)',
        lazy: (args, ev) => {
            for (const a of args) {
                const b = toBool(ev(a));
                if (isError(b)) return b;
                if (b) return true;
            }
            return false;
        },
    },
    NOT: {
        min: 1, max: 1, category: 'Logic', signature: 'NOT(condition)',
        description: 'True when the condition is false, and false when it is true.',
        example: 'NOT({Done})',
        run: ([v]) => { const b = toBool(v); return isError(b) ? b : !b; },
    },
    XOR: {
        min: 1, max: Infinity, category: 'Logic', signature: 'XOR(condition 1, condition 2, …)',
        description: 'True when an odd number of the conditions are true.',
        example: 'XOR({Checked}, {Approved})',
        run: (vals) => {
            let count = 0;
            for (const v of vals) { const b = toBool(v); if (isError(b)) return b; if (b) count++; }
            return count % 2 === 1;
        },
    },
    SWITCH: {
        min: 3, max: Infinity, category: 'Logic', signature: 'SWITCH(value, case 1, result 1, case 2, result 2, …, [otherwise])',
        description: 'Compares a value with each case in turn and shows the result of the first one it equals.',
        example: 'SWITCH({Status}, "Done", 100, "Working on it", 50, 0)',
        lazy: ([subject, ...rest], ev) => {
            const v = ev(subject);
            if (isError(v)) return v;
            for (let i = 0; i + 1 < rest.length; i += 2) {
                const c = compare(v, ev(rest[i]));
                if (isError(c)) return c;
                if (c === 0) return ev(rest[i + 1]);
            }
            return rest.length % 2 === 1 ? ev(rest[rest.length - 1]) : null;
        },
    },
    ISBLANK: {
        min: 1, max: 1, category: 'Logic', signature: 'ISBLANK(value)',
        description: 'True when the value is empty.',
        example: 'IF(ISBLANK({Owner}), "Needs an owner", "")',
        run: ([v]) => isError(v) ? v : isBlank(v),
    },
    EXACT: {
        min: 2, max: 2, category: 'Logic', signature: 'EXACT(text 1, text 2)',
        description: 'True when two texts are exactly the same, capital letters included.',
        example: 'EXACT({Code}, "A1")',
        run: (vals) => firstError(vals) ?? toText(vals[0]) === toText(vals[1]),
    },

    // -- Numbers
    SUM: {
        min: 1, max: Infinity, category: 'Numbers', signature: 'SUM(number 1, number 2, …)',
        description: 'Adds the numbers up. Empty values are skipped.',
        example: 'SUM({Q1}, {Q2}, {Q3})',
        run: (vals) => { const ns = numbersOf(vals); return isError(ns) ? ns : ns.reduce((a, b) => a + b, 0); },
    },
    AVERAGE: {
        min: 1, max: Infinity, category: 'Numbers', signature: 'AVERAGE(number 1, number 2, …)',
        description: 'The average of the numbers. Empty values are left out.',
        example: 'AVERAGE({Score 1}, {Score 2})',
        run: (vals) => {
            const ns = numbersOf(vals);
            if (isError(ns)) return ns;
            return ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : fError('#DIV/0!', 'AVERAGE has no numbers to average');
        },
    },
    MIN: {
        min: 1, max: Infinity, category: 'Numbers', signature: 'MIN(value 1, value 2, …)',
        description: 'The smallest number — or the earliest date, when they are all dates.',
        example: 'MIN({Estimate}, {Actual})',
        run: (vals) => extreme(vals, -1),
    },
    MAX: {
        min: 1, max: Infinity, category: 'Numbers', signature: 'MAX(value 1, value 2, …)',
        description: 'The largest number — or the latest date, when they are all dates.',
        example: 'MAX({Due date}, {Timeline#End})',
        run: (vals) => extreme(vals, 1),
    },
    COUNT: {
        min: 1, max: Infinity, category: 'Numbers', signature: 'COUNT(value 1, value 2, …)',
        description: 'How many of the values are numbers.',
        example: 'COUNT({Q1}, {Q2}, {Q3})',
        run: (vals) => vals.filter(v => !isBlank(v) && !isError(v) && !isDate(v) && !isError(toNumber(v))).length,
    },
    ROUND: {
        min: 1, max: 2, category: 'Numbers', signature: 'ROUND(number, [decimals])',
        description: 'Rounds to the given number of decimals (none if left out).',
        example: 'ROUND({Price} * 1.07, 2)',
        run: ([v, d]) => roundFn(v, d, 'nearest'),
    },
    ROUNDUP: {
        min: 1, max: 2, category: 'Numbers', signature: 'ROUNDUP(number, [decimals])',
        description: 'Rounds away from zero.',
        example: 'ROUNDUP({Hours} / 8)',
        run: ([v, d]) => roundFn(v, d, 'up'),
    },
    ROUNDDOWN: {
        min: 1, max: 2, category: 'Numbers', signature: 'ROUNDDOWN(number, [decimals])',
        description: 'Rounds towards zero.',
        example: 'ROUNDDOWN({Score}, 1)',
        run: ([v, d]) => roundFn(v, d, 'down'),
    },
    ABS: {
        min: 1, max: 1, category: 'Numbers', signature: 'ABS(number)',
        description: 'The number without its minus sign.',
        example: 'ABS({Budget} - {Spent})',
        run: ([v]) => { const n = num(v); return isError(n) ? n : Math.abs(n); },
    },
    MOD: {
        min: 2, max: 2, category: 'Numbers', signature: 'MOD(number, divisor)',
        description: 'What is left over after dividing.',
        example: 'MOD({Rooms}, 2)',
        run: ([a, b]) => {
            const x = num(a); if (isError(x)) return x;
            const y = num(b); if (isError(y)) return y;
            if (y === 0) return fError('#DIV/0!', 'MOD can\'t divide by zero');
            return x - y * Math.floor(x / y);
        },
    },
    POWER: {
        min: 2, max: 2, category: 'Numbers', signature: 'POWER(number, power)',
        description: 'The number raised to a power (the same as ^).',
        example: 'POWER(1.05, {Years})',
        run: ([a, b]) => powerOf(a, b),
    },
    SQRT: {
        min: 1, max: 1, category: 'Numbers', signature: 'SQRT(number)',
        description: 'The square root.',
        example: 'SQRT({Area})',
        run: ([v]) => {
            const n = num(v); if (isError(n)) return n;
            return n < 0 ? fError('#NUM!', 'SQRT of a negative number') : Math.sqrt(n);
        },
    },
    MINUS: {
        min: 2, max: 2, category: 'Numbers', signature: 'MINUS(number 1, number 2)',
        description: 'The first number minus the second (the same as -).',
        example: 'MINUS({Budget}, {Spent})',
        run: ([a, b]) => arith('-', a, b),
    },
    MULTIPLY: {
        min: 2, max: 2, category: 'Numbers', signature: 'MULTIPLY(number 1, number 2)',
        description: 'The two numbers multiplied (the same as *).',
        example: 'MULTIPLY({Price}, {Quantity})',
        run: ([a, b]) => arith('*', a, b),
    },
    DIVIDE: {
        min: 2, max: 2, category: 'Numbers', signature: 'DIVIDE(number 1, number 2)',
        description: 'The first number divided by the second (the same as /).',
        example: 'DIVIDE({Spent}, {Budget})',
        run: ([a, b]) => arith('/', a, b),
    },

    // -- Text
    CONCATENATE: {
        min: 1, max: Infinity, category: 'Text', signature: 'CONCATENATE(text 1, text 2, …)',
        description: 'Joins texts together (the same as &).',
        example: 'CONCATENATE({Name}, " – ", {Status})',
        run: (vals) => firstError(vals) ?? vals.map(toText).join(''),
    },
    LEFT: {
        min: 1, max: 2, category: 'Text', signature: 'LEFT(text, [count])',
        description: 'The first characters of a text (one if the count is left out).',
        example: 'LEFT({Code}, 3)',
        run: ([v, n]) => sliceText(v, n, 'left'),
    },
    RIGHT: {
        min: 1, max: 2, category: 'Text', signature: 'RIGHT(text, [count])',
        description: 'The last characters of a text.',
        example: 'RIGHT({Phone}, 4)',
        run: ([v, n]) => sliceText(v, n, 'right'),
    },
    LEN: {
        min: 1, max: 1, category: 'Text', signature: 'LEN(text)',
        description: 'How many characters the text has.',
        example: 'LEN({Notes})',
        run: ([v]) => isError(v) ? v : [...toText(v)].length,
    },
    UPPER: {
        min: 1, max: 1, category: 'Text', signature: 'UPPER(text)',
        description: 'The text in capital letters.',
        example: 'UPPER({Code})',
        run: ([v]) => isError(v) ? v : toText(v).toUpperCase(),
    },
    LOWER: {
        min: 1, max: 1, category: 'Text', signature: 'LOWER(text)',
        description: 'The text in small letters.',
        example: 'LOWER({Email})',
        run: ([v]) => isError(v) ? v : toText(v).toLowerCase(),
    },
    TRIM: {
        min: 1, max: 1, category: 'Text', signature: 'TRIM(text)',
        description: 'The text without spaces at either end or doubled spaces inside.',
        example: 'TRIM({Name})',
        run: ([v]) => isError(v) ? v : toText(v).trim().replace(/\s+/g, ' '),
    },
    SUBSTITUTE: {
        min: 3, max: 3, category: 'Text', signature: 'SUBSTITUTE(text, find, replace with)',
        description: 'Replaces every place the text contains one thing with another.',
        example: 'SUBSTITUTE({Phone}, "-", "")',
        run: (vals) => {
            const e = firstError(vals); if (e) return e;
            const [text, find, rep] = vals.map(toText);
            return find === '' ? text : text.split(find).join(rep);
        },
    },
    REPT: {
        min: 2, max: 2, category: 'Text', signature: 'REPT(text, times)',
        description: 'The text repeated — handy for a small bar like ★★★.',
        example: 'REPT("★", {Rating})',
        run: ([v, n]) => {
            if (isError(v)) return v;
            const times = num(n); if (isError(times)) return times;
            return toText(v).repeat(Math.max(0, Math.min(200, Math.floor(times))));
        },
    },
    SEARCH: {
        min: 2, max: 2, category: 'Text', signature: 'SEARCH(find, text)',
        description: 'Where the text first contains what you look for, counted from 1 (0 if it doesn\'t). Capital letters don\'t matter.',
        example: 'IF(SEARCH("urgent", {Notes}) > 0, "!", "")',
        run: (vals) => {
            const e = firstError(vals); if (e) return e;
            const [find, text] = vals.map(v => toText(v).toLowerCase());
            return text.indexOf(find) + 1;
        },
    },
    TEXT: {
        min: 2, max: 2, category: 'Text', signature: 'TEXT(value, format)',
        description: 'A number or date written in a format: "0.00", "#,##0", "0%", or a date format such as "DD/MM/YYYY".',
        example: 'TEXT({Price}, "#,##0.00")',
        run: ([v, f]) => {
            if (isError(v)) return v;
            const pattern = toText(f);
            if (isDate(v)) return formatDay(v.day, pattern);
            const n = toNumber(v);
            if (isError(n)) return n;
            return formatNumberPattern(n, pattern);
        },
    },

    // -- Dates
    TODAY: {
        min: 0, max: 0, category: 'Dates', signature: 'TODAY()',
        description: 'Today\'s date. Results that use it update by themselves each day.',
        example: 'IF({Timeline#End} < TODAY(), "Overdue", "On time")',
        run: (_v, env) => fDate(env.today),
    },
    DATE: {
        min: 3, max: 3, category: 'Dates', signature: 'DATE(year, month, day)',
        description: 'A date from its year, month and day.',
        example: 'DATE(2026, 12, 31)',
        run: (vals) => {
            const ns = vals.map(num);
            const e = ns.find(isError) as FError | undefined; if (e) return e;
            const [y, m, d] = ns as number[];
            return fDate(dayFromParts(Math.trunc(y), Math.trunc(m), Math.trunc(d)));
        },
    },
    DAYS: {
        min: 2, max: 2, category: 'Dates', signature: 'DAYS(end date, start date)',
        description: 'How many days from the start date to the end date. Negative when the end comes first; empty when either date is.',
        example: 'DAYS({Timeline#End}, TODAY())',
        run: ([a, b]) => {
            const end = dateArg(a, 'DAYS'); if (isError(end)) return end;
            const start = dateArg(b, 'DAYS'); if (isError(start)) return start;
            return end === null || start === null ? null : end - start;
        },
    },
    WORKDAYS: {
        min: 2, max: 2, category: 'Dates', signature: 'WORKDAYS(end date, start date)',
        description: 'How many working days (Monday to Friday) from the start date to the end date, both counted.',
        example: 'WORKDAYS({Timeline#End}, {Timeline#Start})',
        run: ([a, b]) => {
            const end = dateArg(a, 'WORKDAYS'); if (isError(end)) return end;
            const start = dateArg(b, 'WORKDAYS'); if (isError(start)) return start;
            return end === null || start === null ? null : workdays(start, end);
        },
    },
    ADD_DAYS: {
        min: 2, max: 2, category: 'Dates', signature: 'ADD_DAYS(date, days)',
        description: 'The date that many days later.',
        example: 'ADD_DAYS({Start date}, 14)',
        run: ([a, n]) => shiftDays(a, n, 1, 'ADD_DAYS'),
    },
    SUBTRACT_DAYS: {
        min: 2, max: 2, category: 'Dates', signature: 'SUBTRACT_DAYS(date, days)',
        description: 'The date that many days earlier.',
        example: 'SUBTRACT_DAYS({Due date}, 3)',
        run: ([a, n]) => shiftDays(a, n, -1, 'SUBTRACT_DAYS'),
    },
    YEAR: {
        min: 1, max: 1, category: 'Dates', signature: 'YEAR(date)', description: 'The year of a date.', example: 'YEAR({Date})',
        run: ([v]) => datePart(v, 'YEAR', p => p.y),
    },
    MONTH: {
        min: 1, max: 1, category: 'Dates', signature: 'MONTH(date)', description: 'The month of a date, 1 to 12.', example: 'MONTH({Date})',
        run: ([v]) => datePart(v, 'MONTH', p => p.m),
    },
    DAY: {
        min: 1, max: 1, category: 'Dates', signature: 'DAY(date)', description: 'The day of the month, 1 to 31.', example: 'DAY({Date})',
        run: ([v]) => datePart(v, 'DAY', p => p.d),
    },
    WEEKDAY: {
        min: 1, max: 1, category: 'Dates', signature: 'WEEKDAY(date)',
        description: 'The day of the week: 1 for Sunday to 7 for Saturday.',
        example: 'IF(WEEKDAY({Date}) = 1, "Sunday", "")',
        run: ([v]) => datePart(v, 'WEEKDAY', p => p.weekday + 1),
    },
    WEEKNUM: {
        min: 1, max: 1, category: 'Dates', signature: 'WEEKNUM(date)',
        description: 'The week of the year (weeks start on Monday).',
        example: 'WEEKNUM({Date})',
        run: ([v]) => {
            const d = dateArg(v, 'WEEKNUM'); if (isError(d)) return d;
            return d === null ? null : isoWeek(d);
        },
    },
    FORMAT_DATE: {
        min: 1, max: 2, category: 'Dates', signature: 'FORMAT_DATE(date, [format])',
        description: 'A date written out: YYYY year, MMMM / MMM / MM month, DD day, dddd / ddd weekday. "MMM D, YYYY" if the format is left out.',
        example: 'FORMAT_DATE({Date}, "dddd D MMMM")',
        run: ([v, f]) => {
            const d = dateArg(v, 'FORMAT_DATE'); if (isError(d)) return d;
            if (isError(f ?? null)) return f as FError;
            return d === null ? null : formatDay(d, f === undefined ? 'MMM D, YYYY' : toText(f));
        },
    },
};

// Accepted spellings people bring from other tools.
const ALIASES: Record<string, string> = { AVG: 'AVERAGE', ISEMPTY: 'ISBLANK', CONCAT: 'CONCATENATE', NETWORKDAYS: 'WORKDAYS' };
Object.entries(ALIASES).forEach(([alias, name]) => { FUNCTIONS[alias] = FUNCTIONS[name]; });

function extreme(vals: FValue[], dir: 1 | -1): FValue {
    const e = firstError(vals); if (e) return e;
    const present = vals.filter(v => !isBlank(v));
    if (present.length === 0) return null;
    // Dates among them: the earliest or latest date (date texts count as dates).
    if (present.some(isDate)) {
        const days: number[] = [];
        for (const v of present) {
            const d = toDay(v);
            if (isError(d)) return d;
            if (d !== null) days.push(d);
        }
        return fDate(dir > 0 ? Math.max(...days) : Math.min(...days));
    }
    const ns = numbersOf(present);
    if (isError(ns)) return ns;
    return dir > 0 ? Math.max(...ns) : Math.min(...ns);
}

function roundFn(v: FValue, d: FValue | undefined, mode: 'nearest' | 'up' | 'down'): FValue {
    if (isBlank(v)) return null;
    const n = num(v); if (isError(n)) return n;
    const digits = d === undefined ? 0 : num(d);
    if (isError(digits)) return digits;
    return round(n, digits, mode);
}

function powerOf(a: FValue, b: FValue): FValue {
    const x = num(a); if (isError(x)) return x;
    const y = num(b); if (isError(y)) return y;
    const r = Math.pow(x, y);
    return Number.isFinite(r) ? r : fError('#NUM!', 'The result isn\'t a real number');
}

function sliceText(v: FValue, n: FValue | undefined, side: 'left' | 'right'): FValue {
    if (isError(v)) return v;
    const count = n === undefined ? 1 : num(n);
    if (isError(count)) return count;
    const chars = [...toText(v)];
    const k = Math.max(0, Math.floor(count));
    return (side === 'left' ? chars.slice(0, k) : chars.slice(Math.max(0, chars.length - k))).join('');
}

function shiftDays(a: FValue, n: FValue, sign: 1 | -1, fn: string): FValue {
    const d = dateArg(a, fn); if (isError(d)) return d;
    if (d === null) return null;
    const days = num(n); if (isError(days)) return days;
    return fDate(d + sign * Math.round(days));
}

function datePart(v: FValue, fn: string, pick: (p: ReturnType<typeof partsFromDay>) => number): FValue {
    const d = dateArg(v, fn); if (isError(d)) return d;
    return d === null ? null : pick(partsFromDay(d));
}

/** "2026-11-30" written as text, as a date — so it can be added to or counted from. */
const isoTextAsDate = (v: FValue): FValue =>
    typeof v === 'string' && /^\s*\d{4}-\d{2}-\d{2}\s*$/.test(v) && dayFromISO(v) !== null ? fDate(dayFromISO(v)!) : v;

function arith(op: string, a: FValue, b: FValue): FValue {
    if (isError(a)) return a;
    if (isError(b)) return b;
    if (op === '+' || op === '-') {
        a = isoTextAsDate(a);
        b = isoTextAsDate(b);
        if (isDate(a) && isDate(b)) {
            return op === '-' ? a.day - b.day : fError('#VALUE!', 'Two dates can\'t be added — subtract them to count the days between');
        }
        if (isDate(a)) {
            const n = toNumber(b); if (isError(n)) return n;
            return fDate(a.day + (op === '+' ? 1 : -1) * Math.round(n));
        }
        if (isDate(b)) {
            if (op === '-') return fError('#VALUE!', 'A date can\'t be taken away from a number');
            const n = toNumber(a); if (isError(n)) return n;
            return fDate(b.day + Math.round(n));
        }
    }
    const x = toNumber(a); if (isError(x)) return x;
    const y = toNumber(b); if (isError(y)) return y;
    switch (op) {
        case '+': return x + y;
        case '-': return x - y;
        case '*': return x * y;
        case '/': return y === 0 ? fError('#DIV/0!', 'Division by zero — the number below the line is 0 or empty') : x / y;
        default: return powerOf(x, y);
    }
}

/** The functions as the editor lists them, alphabetically within each group. */
export const FUNCTION_LIST = Object.entries(FUNCTIONS)
    .filter(([name]) => !ALIASES[name])
    .map(([name, def]) => ({ name, category: def.category, signature: def.signature, description: def.description, example: def.example }))
    .sort((a, b) => a.name.localeCompare(b.name));

export const isFunctionName = (name: string) => !!FUNCTIONS[name.toUpperCase()];

// ---- evaluation -----------------------------------------------------------------

export const evaluate = (node: FormulaNode, env: EvalEnv): FValue => {
    const ev = (n: FormulaNode): FValue => evaluate(n, env);
    switch (node.k) {
        case 'num': return node.v;
        case 'str': return node.v;
        case 'bool': return node.v;
        case 'ref': return env.ref(node);
        case 'neg': {
            const v = ev(node.a);
            if (isBlank(v)) return null;
            const n = toNumber(v);
            return isError(n) ? n : -n;
        }
        case 'pct': {
            const n = toNumber(ev(node.a));
            return isError(n) ? n : n / 100;
        }
        case 'bin': {
            const a = ev(node.a);
            const b = ev(node.b);
            if (node.op === '&') return isError(a) ? a : isError(b) ? b : toText(a) + toText(b);
            if (['=', '<>', '<', '>', '<=', '>='].includes(node.op)) {
                const c = compare(a, b);
                if (isError(c)) return c;
                if (c === null) return node.op === '<>';
                switch (node.op) {
                    case '=': return c === 0;
                    case '<>': return c !== 0;
                    case '<': return c < 0;
                    case '>': return c > 0;
                    case '<=': return c <= 0;
                    default: return c >= 0;
                }
            }
            if (node.op === '^') return isError(a) ? a : isError(b) ? b : powerOf(a, b);
            return arith(node.op, a, b);
        }
        case 'call': {
            const def = FUNCTIONS[node.name];
            if (!def) return fError('#NAME?', `There is no function called ${node.name}`);
            if (def.lazy) return def.lazy(node.args, ev, env);
            const vals = node.args.map(ev);
            // Logic and blank checks take errors as values; the rest pass the first one on.
            return def.run!(vals, env);
        }
    }
};
