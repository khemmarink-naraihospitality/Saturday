/**
 * Manual verification for the Formula column (src/lib/formula): the expression
 * language (parsing, operators, functions, errors), what each column type means
 * inside a formula, the If / Then / Else rules, how results read, and the id ⇄
 * title conversion that keeps formulas working when columns are renamed.
 * Run with:  npx tsx tests/formula_test.ts
 */
import type { Column, FormulaConfig } from '../src/types';
import {
    parseFormula, evaluate, todayDay, dayFromISO, isoFromDay, fDate, toText,
    evaluateColumn, formulaCell, formulaDisplay, summarizeFormula, remapFormula, checkExpression, checkRules,
    toEditable, fromEditable, compareFormulaDisplays, formulaExportValue, formulaColumnIds,
    type FValue, type FormulaContext,
} from '../src/lib/formula';
import { RULE_COLORS, calcExamples, ruleTemplates, suggestLabelColor } from '../src/lib/formula/catalog';

let passed = 0;
let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) passed++;
    else {
        failed++;
        console.log(`FAIL ${name}${detail ? ` — ${detail}` : ''}`);
    }
};
const show = (v: FValue) => JSON.stringify(v);

const TODAY = dayFromISO('2026-11-01')!;
const ctx: FormulaContext = { today: TODAY, personName: id => ({ u1: 'Ann', u2: 'Bo' } as Record<string, string>)[id] };

// ---- the language on its own --------------------------------------------------
const calc = (src: string, refs: Record<string, FValue> = {}): FValue => {
    const { ast, error } = parseFormula(src);
    if (!ast) return { t: 'error', code: 'PARSE', message: error!.message };
    return evaluate(ast, { today: TODAY, ref: t => (t.title !== undefined ? refs[t.title] ?? null : refs[t.id!] ?? null) });
};
const same = (a: FValue, b: FValue) => JSON.stringify(a) === JSON.stringify(b);
const expect = (src: string, want: FValue, refs?: Record<string, FValue>) => {
    const got = calc(src, refs);
    check(`${src} = ${show(want)}`, same(got, want), `got ${show(got)}`);
};
const expectError = (src: string, code: string, refs?: Record<string, FValue>) => {
    const got = calc(src, refs);
    check(`${src} → ${code}`, typeof got === 'object' && got !== null && got.t === 'error' && got.code === code, `got ${show(got)}`);
};
const expectParseError = (src: string, fragment: string) => {
    const { error } = parseFormula(src);
    check(`parse error for ${src}`, !!error && error.message.toLowerCase().includes(fragment.toLowerCase()), `got ${error?.message}`);
};

// arithmetic and precedence
expect('1 + 2 * 3', 7);
expect('(1 + 2) * 3', 9);
expect('2 ^ 3 ^ 2', 512);
expect('-2 ^ 2', 4);
expect('10 / 4', 2.5);
expect('50%', 0.5);
expect('{Price} * {Qty}', 30, { Price: 7.5, Qty: 4 });
expect('{Price} + {Empty}', 7.5, { Price: 7.5, Empty: null });
expect('0.1 + 0.2', 0.30000000000000004);
check('0.1 + 0.2 reads 0.3', toText(calc('0.1 + 0.2')) === '0.3');
expect('"1,200" + 1', 1201);
expect('-{Empty}', null, { Empty: null });
expectError('1 / 0', '#DIV/0!');
expectError('{Price} / {Empty}', '#DIV/0!', { Price: 5, Empty: null });
expectError('"abc" * 2', '#VALUE!');
expect('IFERROR(1 / 0, 0)', 0);

// text
expect('"a" & "b" & 1', 'ab1');
expect('CONCATENATE("Room ", 12)', 'Room 12');
expect('LEFT("Narai", 2)', 'Na');
expect('RIGHT("Narai", 3)', 'rai');
expect('LEN("สวัสดี")', 6);
expect('UPPER("lub d")', 'LUB D');
expect('TRIM("  a   b ")', 'a b');
expect('SUBSTITUTE("a-b-c", "-", "")', 'abc');
expect('REPT("★", 3)', '★★★');
expect('SEARCH("URG", "very urgent")', 6);
expect('SEARCH("zzz", "very urgent")', 0);
expect('TEXT(1234.5, "#,##0.00")', '1,234.50');
expect('TEXT(0.256, "0.0%")', '25.6%');
expect('“curly” & ‘quotes’', 'curlyquotes');

// comparisons and logic
expect('2 > 1', true);
expect('"Done" = "done"', true);
expect('"5" = 5', true);
expect('{Empty} = ""', true, { Empty: null });
expect('{Empty} = 0', true, { Empty: null });
expect('3 <> 3', false);
expect('IF(2 > 1, "yes", "no")', 'yes');
expect('IF(FALSE, "yes")', null);
expect('IFS(FALSE, 1, TRUE, 2)', 2);
expect('IFS(FALSE, 1, FALSE, 2, 3)', 3);
expect('AND(TRUE, 1, "x")', true);
expect('AND(TRUE, 0)', false);
expect('OR(FALSE, 0, "")', false);
expect('NOT(TRUE)', false);
expect('XOR(TRUE, TRUE, TRUE)', true);
expect('SWITCH("b", "a", 1, "b", 2, 0)', 2);
expect('SWITCH("z", "a", 1, "b", 2, 0)', 0);
expect('ISBLANK({Empty})', true, { Empty: null });
expect('ISBLANK("x")', false);
expect('EXACT("A", "a")', false);
// IF only evaluates the branch it takes
expect('IF(TRUE, 1, 1 / 0)', 1);

// numbers
expect('SUM(1, 2, {Empty}, "3")', 6, { Empty: null });
expect('AVERAGE(2, 4, {Empty})', 3, { Empty: null });
expectError('AVERAGE({Empty})', '#DIV/0!', { Empty: null });
expect('MIN(3, 1, 2)', 1);
expect('MAX(3, 1, 2)', 3);
expect('COUNT(1, "x", {Empty}, 3)', 2, { Empty: null });
expect('ROUND(2.345, 2)', 2.35);
expect('ROUND(1.005, 2)', 1.01);
expect('ROUND(-2.5)', -3);
expect('ROUNDUP(2.01)', 3);
expect('ROUNDDOWN(-2.99)', -2);
expect('ABS(-4)', 4);
expect('MOD(-7, 3)', 2);
expect('POWER(2, 10)', 1024);
expectError('SQRT(-1)', '#NUM!');
expect('MINUS(5, 3)', 2);
expect('MULTIPLY(5, 3)', 15);
expect('DIVIDE(6, 3)', 2);
expect('avg(2, 4)', 3);

// dates
const d = (iso: string) => fDate(dayFromISO(iso)!);
expect('TODAY()', d('2026-11-01'));
expect('DATE(2026, 12, 31)', d('2026-12-31'));
expect('DATE(2026, 13, 1)', d('2027-01-01'));
expect('DAYS({End}, {Start})', 4, { End: d('2026-11-05'), Start: d('2026-11-01') });
expect('DAYS({End}, {Empty})', null, { End: d('2026-11-05'), Empty: null });
expect('{End} - {Start}', 4, { End: d('2026-11-05'), Start: d('2026-11-01') });
expect('{Start} + 7', d('2026-11-08'), { Start: d('2026-11-01') });
expect('ADD_DAYS({Start}, 30)', d('2026-12-01'), { Start: d('2026-11-01') });
expect('SUBTRACT_DAYS("2026-03-01", 1)', d('2026-02-28'));
expect('{End} < TODAY()', true, { End: d('2026-10-31') });
expect('{End} < TODAY()', false, { End: d('2026-11-01') });
// An empty date is never before or after anything, so it is never "overdue".
expect('{Empty} < TODAY()', false, { Empty: null });
expect('{Empty} > TODAY()', false, { Empty: null });
expect('YEAR("2026-11-01")', 2026);
expect('MONTH("2026-11-01")', 11);
expect('DAY("2026-11-01")', 1);
expect('WEEKDAY("2026-11-01")', 1); // a Sunday
expect('WEEKNUM("2026-01-01")', 1);
expect('WEEKNUM("2026-12-31")', 53);
expect('WORKDAYS("2026-11-06", "2026-11-02")', 5); // Mon–Fri
expect('WORKDAYS("2026-11-08", "2026-11-02")', 5); // through Sunday
expect('WORKDAYS("2026-11-02", "2026-11-08")', -5);
expect('FORMAT_DATE("2026-11-01", "dddd D MMMM YYYY")', 'Sunday 1 November 2026');
expect('FORMAT_DATE("2026-11-01")', 'Nov 1, 2026');
expect('MAX("2026-01-05", {Later})', d('2026-03-01'), { Later: d('2026-03-01') });
expect('MAX({A}, {B})', d('2026-03-01'), { A: d('2026-01-05'), B: d('2026-03-01') });
expectError('"tomorrow" < TODAY()', '#VALUE!');

// syntax errors say where and why
expectParseError('', 'empty');
expectParseError('1 +', 'ends too soon');
expectParseError('SUM(1, 2', 'closing )');
expectParseError('(1 + 2', 'closing )');
expectParseError('1 + 2)', 'no (');
expectParseError('"abc', 'closing quote');
expectParseError('{Price', 'closing }');
expectParseError('{}', 'column name');
expectParseError('FOO(1)', 'no function called FOO');
expectParseError('ROUND()', 'ROUND takes 1 to 2 values');
expectParseError('Price * 2', 'put column names in { }');
expectParseError('TODAY', 'needs brackets');
expectParseError('IF(1,,2)', 'missing');
expectParseError('1 2', 'is an operator or a comma missing');
check('error points at the bad part', parseFormula('1 + FOO(2)').error?.at === 4);

// ---- columns ------------------------------------------------------------------
const col = (id: string, title: string, type: Column['type'], extra: Partial<Column> = {}): Column => ({ id, title, type, order: 0, ...extra });
const STATUS = col('c-status', 'Status', 'status', {
    options: [
        { id: 'o-done', label: 'Done', color: '#00C853' },
        { id: 'o-work', label: 'Working on it', color: '#FF9800' },
        { id: 'o-stuck', label: 'Stuck', color: '#E53935' },
        { id: 'o-default', label: 'Default', color: '#c4c4c4' },
    ],
});
const PRICE = col('c-price', 'Price', 'number');
const QTY = col('c-qty', 'Qty', 'number');
const TIMELINE = col('c-tl', 'Timeline', 'timeline');
const DUE = col('c-due', 'Due Date', 'due_date');
const PEOPLE = col('c-people', 'Owner', 'people');
const CHECK = col('c-check', 'Approved', 'checkbox');
const TAGS = col('c-tags', 'Tags', 'dropdown', { options: [{ id: 't1', label: 'VIP', color: '#000' }, { id: 't2', label: 'Group', color: '#111' }] });
const NOTES = col('c-notes', 'Notes', 'text');
const STARS = col('c-stars', 'Priority', 'priority');
const FILES = col('c-files', 'Files', 'files');
const STATUS2 = col('c-status2', 'Status', 'status', { options: [{ id: 'x', label: 'A', color: '#123456' }] });

const calcCol = (expr: string, extra: Partial<Column> = {}): Column => col('c-f', 'Formula', 'formula', { formula: { mode: 'calc', expr }, ...extra });
const BASE = [STATUS, PRICE, QTY, TIMELINE, DUE, PEOPLE, CHECK, TAGS, NOTES, STARS, FILES, STATUS2];
const row = (values: Record<string, unknown>, title = 'Lub d Siam') => ({ id: 'r1', title, values });
const run = (formula: Column, values: Record<string, unknown>, title?: string) =>
    evaluateColumn(formula, row(values, title), [...BASE, formula], ctx);
const cellOf = (formula: Column, values: Record<string, unknown>) => formulaCell(formula, row(values), [...BASE, formula], ctx);

// titles ⇄ ids
const typed = '{Price} * {Qty} + {Timeline#End} - {Status (2)} & {Name}';
const { stored, unknown } = fromEditable(typed, [...BASE]);
check('typed titles become ids', stored === '{#c-price} * {#c-qty} + {#c-tl:end} - {#c-status2} & {#name}', stored);
check('no unknown titles', unknown.length === 0, unknown.join());
check('ids read back as titles', toEditable(stored, BASE) === typed, toEditable(stored, BASE));
check('a renamed column reads by its new title', toEditable('{#c-price}', [{ ...PRICE, title: 'Rate' }]) === '{Rate}');
check('a deleted column reads as such', toEditable('{#gone}', BASE) === '{Deleted column}');
check('braces inside text are left alone', fromEditable('"{Price}" & {Price}', BASE).stored === '"{Price}" & {#c-price}');
check('unknown titles are reported', fromEditable('{Nope} + 1', BASE).unknown[0] === 'Nope');
check('{Status} is the first of two', fromEditable('{Status}', BASE).stored === '{#c-status}');
check('case does not matter', fromEditable('{price}', BASE).stored === '{#c-price}');

// what each type means
check('number', run(calcCol('{#c-price} * {#c-qty}'), { 'c-price': '7.5', 'c-qty': 4 }) === 30);
check('number typed with %', run(calcCol('{#c-price}'), { 'c-price': '50%' }) === 50);
check('status is its label', show(run(calcCol('{#c-status}'), { 'c-status': 'o-stuck' })) === show({ t: 'label', text: 'Stuck', color: '#E53935' }));
check('status Default is empty', run(calcCol('{#c-status}'), { 'c-status': 'o-default' }) === null);
check('status compares by label', run(calcCol('{#c-status} = "done"'), { 'c-status': 'o-done' }) === true);
check('timeline end', show(run(calcCol('{#c-tl:end}'), { 'c-tl': { from: '2026-10-01', to: '2026-10-20' } })) === show(d('2026-10-20')));
check('timeline days', run(calcCol('{#c-tl:days}'), { 'c-tl': { from: '2026-10-01', to: '2026-10-20' } }) === 20);
check('timeline as text', run(calcCol('{#c-tl}'), { 'c-tl': { from: '2026-10-01', to: '2026-10-20' } }) === 'Oct 1 - Oct 20');
check('people are names', run(calcCol('{#c-people}'), { 'c-people': ['u1', 'u2'] }) === 'Ann, Bo');
check('checkbox', run(calcCol('IF({#c-check}, "ok", "no")'), { 'c-check': true }) === 'ok');
check('unticked checkbox', run(calcCol('IF({#c-check}, "ok", "no")'), {}) === 'no');
check('dropdown labels', run(calcCol('{#c-tags}'), { 'c-tags': ['VIP', 'Group'] }) === 'VIP, Group');
check('priority', run(calcCol('{#c-stars} * 2'), { 'c-stars': 4 }) === 8);
check('files count', run(calcCol('{#c-files}'), { 'c-files': [{ id: 'f' }, { id: 'g' }] }) === 2);
check('item name', run(calcCol('UPPER({#name})'), {}, 'Lub d Siam') === 'LUB D SIAM');
check('deleted column is #REF!', (run(calcCol('{#gone} + 1'), {}) as { code: string }).code === '#REF!');

// a formula using another formula, and a loop
const TOTAL = col('c-total', 'Total', 'formula', { formula: { mode: 'calc', expr: '{#c-price} * {#c-qty}' } });
const VAT = col('c-vat', 'With VAT', 'formula', { formula: { mode: 'calc', expr: 'ROUND({#c-total} * 1.07, 2)' } });
check('formula of a formula', evaluateColumn(VAT, row({ 'c-price': 10, 'c-qty': 3 }), [...BASE, TOTAL, VAT], ctx) === 32.1);
const LOOP_A = col('c-a', 'A', 'formula', { formula: { mode: 'calc', expr: '{#c-b} + 1' } });
const LOOP_B = col('c-b', 'B', 'formula', { formula: { mode: 'calc', expr: '{#c-a} + 1' } });
check('a loop is #CYCLE!', (evaluateColumn(LOOP_A, row({}), [LOOP_A, LOOP_B], ctx) as { code: string }).code === '#CYCLE!');
check('the same formula twice is not a loop', evaluateColumn(col('c-twice', 'T', 'formula', { formula: { mode: 'calc', expr: '{#c-total} + {#c-total}' } }), row({ 'c-price': 1, 'c-qty': 2 }), [...BASE, TOTAL], ctx) === 4);

// ---- If / Then / Else ------------------------------------------------------------
const overdue: FormulaConfig = {
    mode: 'rules',
    rules: [{
        id: 'r1', match: 'all',
        conditions: [
            { id: 'a', columnId: 'c-tl', part: 'end', op: 'past' },
            { id: 'b', columnId: 'c-status', op: 'is_not', value: ['o-done'] },
        ],
        then: { kind: 'label', text: 'Overdue', color: '#E53935' },
    }],
    otherwise: { kind: 'column', columnId: 'c-status' },
};
const RULES = col('c-rules', 'Health', 'formula', { formula: overdue });
const late = { 'c-tl': { from: '2026-10-01', to: '2026-10-20' }, 'c-status': 'o-work' };
check('overdue and not done → Overdue', show(run(RULES, late)) === show({ t: 'label', text: 'Overdue', color: '#E53935' }));
check('overdue but done → its status', show(run(RULES, { ...late, 'c-status': 'o-done' })) === show({ t: 'label', text: 'Done', color: '#00C853' }));
check('not yet due → its status', show(run(RULES, { ...late, 'c-tl': { from: '2026-11-01', to: '2026-11-30' } })) === show({ t: 'label', text: 'Working on it', color: '#FF9800' }));
check('no timeline → not overdue', show(run(RULES, { 'c-status': 'o-work' })) === show({ t: 'label', text: 'Working on it', color: '#FF9800' }));
check('empty status is "not Done"', (run(RULES, { 'c-tl': late['c-tl'] }) as { text: string }).text === 'Overdue');

const rules = (conditions: FormulaConfig['rules'] extends (infer R)[] | undefined ? R extends { conditions: infer C } ? C : never : never, match: 'all' | 'any' = 'all'): Column =>
    col('c-r', 'R', 'formula', { formula: { mode: 'rules', rules: [{ id: 'r', match, conditions, then: { kind: 'text', text: 'yes' } }], otherwise: { kind: 'text', text: 'no' } } });
const holds = (c: Column, values: Record<string, unknown>, title?: string) => run(c, values, title) === 'yes';

check('number >', holds(rules([{ id: 'x', columnId: 'c-price', op: 'gt', value: 100 }]), { 'c-price': '150' }));
check('number > when blank', !holds(rules([{ id: 'x', columnId: 'c-price', op: 'gt', value: 100 }]), {}));
check('number ≠ when blank', holds(rules([{ id: 'x', columnId: 'c-price', op: 'neq', value: 100 }]), {}));
check('number > another column', holds(rules([{ id: 'x', columnId: 'c-price', op: 'gt', value: { column: 'c-qty' } }]), { 'c-price': 5, 'c-qty': 3 }));
check('number > an empty column', !holds(rules([{ id: 'x', columnId: 'c-price', op: 'gt', value: { column: 'c-qty' } }]), { 'c-price': 5 }));
check('due today', holds(rules([{ id: 'x', columnId: 'c-due', op: 'today' }]), { 'c-due': '2026-11-01' }));
check('due within 3 days', holds(rules([{ id: 'x', columnId: 'c-due', op: 'next_days', value: 3 }]), { 'c-due': '2026-11-04' }));
check('not within 3 days', !holds(rules([{ id: 'x', columnId: 'c-due', op: 'next_days', value: 3 }]), { 'c-due': '2026-11-05' }));
check('overdue by more than 2 days', holds(rules([{ id: 'x', columnId: 'c-due', op: 'overdue_by', value: 2 }]), { 'c-due': '2026-10-29' }));
check('overdue by only 2 days', !holds(rules([{ id: 'x', columnId: 'c-due', op: 'overdue_by', value: 2 }]), { 'c-due': '2026-10-30' }));
check('before a date', holds(rules([{ id: 'x', columnId: 'c-due', op: 'before', value: '2026-12-01' }]), { 'c-due': '2026-11-15' }));
check('timeline start in the future', holds(rules([{ id: 'x', columnId: 'c-tl', part: 'start', op: 'future' }]), { 'c-tl': { from: '2026-11-10', to: '2026-11-20' } }));
check('text contains', holds(rules([{ id: 'x', columnId: 'c-notes', op: 'contains', value: 'VIP' }]), { 'c-notes': 'a vip guest' }));
check('text is (any case)', holds(rules([{ id: 'x', columnId: 'c-notes', op: 'is', value: 'Hello' }]), { 'c-notes': ' hello ' }));
check('name contains', holds(rules([{ id: 'x', columnId: 'name', op: 'contains', value: 'siam' }]), {}, 'Lub d Siam'));
check('dropdown has', holds(rules([{ id: 'x', columnId: 'c-tags', op: 'contains', value: ['VIP'] }]), { 'c-tags': ['Group', 'VIP'] }));
check('dropdown does not have', holds(rules([{ id: 'x', columnId: 'c-tags', op: 'not_contains', value: ['VIP'] }]), { 'c-tags': ['Group'] }));
check('people includes', holds(rules([{ id: 'x', columnId: 'c-people', op: 'includes', value: ['u2'] }]), { 'c-people': ['u1', 'u2'] }));
check('people empty', holds(rules([{ id: 'x', columnId: 'c-people', op: 'empty' }]), { 'c-people': [] }));
check('checked', holds(rules([{ id: 'x', columnId: 'c-check', op: 'checked' }]), { 'c-check': true }));
check('files empty', holds(rules([{ id: 'x', columnId: 'c-files', op: 'empty' }]), {}));
check('files not empty', holds(rules([{ id: 'x', columnId: 'c-files', op: 'not_empty' }]), { 'c-files': [{ id: 'f' }] }));
check('status is any of', holds(rules([{ id: 'x', columnId: 'c-status', op: 'is', value: ['o-stuck', 'o-work'] }]), { 'c-status': 'o-work' }));
check('any: one is enough', holds(rules([{ id: 'x', columnId: 'c-check', op: 'checked' }, { id: 'y', columnId: 'c-price', op: 'gt', value: 1 }], 'any'), { 'c-price': 5 }));
check('all: both needed', !holds(rules([{ id: 'x', columnId: 'c-check', op: 'checked' }, { id: 'y', columnId: 'c-price', op: 'gt', value: 1 }]), { 'c-price': 5 }));
check('an unfinished condition is left out', holds(rules([{ id: 'x', columnId: 'c-check', op: 'checked' }, { id: 'y', columnId: 'c-status', op: 'is', value: [] }]), { 'c-check': true }));
check('a rule with no finished condition never holds', !holds(rules([{ id: 'y', columnId: 'c-status', op: 'is', value: [] }]), {}));
check('a deleted column does not hold', !holds(rules([{ id: 'x', columnId: 'gone', op: 'not_empty' }]), {}));
check('formula subject compares its result', holds(rules([{ id: 'x', columnId: 'c-total', op: 'gt', value: 10 }]), { 'c-price': 5, 'c-qty': 3 }) === false);
check('formula subject (in its set)', evaluateColumn(col('c-r2', 'R', 'formula', { formula: { mode: 'rules', rules: [{ id: 'r', match: 'all', conditions: [{ id: 'x', columnId: 'c-total', op: 'gt', value: 10 }], then: { kind: 'text', text: 'big' } }] } }), row({ 'c-price': 5, 'c-qty': 3 }), [...BASE, TOTAL], ctx) === 'big');
check('outcome: a calculation', evaluateColumn(col('c-r3', 'R', 'formula', { formula: { mode: 'rules', rules: [], otherwise: { kind: 'calc', expr: '{#c-price} * 2' } } }), row({ 'c-price': 4 }), BASE, ctx) === 8);

// ---- how results read ----------------------------------------------------------------
check('number with decimals', cellOf(calcCol('10 / 3'), {}).text === (3.33).toLocaleString());
check('fixed decimals', cellOf(calcCol('10 / 4', { formula: { mode: 'calc', expr: '10 / 4', decimals: 0 } }), {}).text === (3).toLocaleString());
check('percent of a ratio', cellOf(calcCol('0.85', { numberFormat: 'percent' }), {}).text === '85%');
check('currency', cellOf(calcCol('1200', { numberFormat: 'currency', currencyCode: 'THB' }), {}).text === `฿${(1200).toLocaleString()}`);
check('date reads like the table', cellOf(calcCol('"2026-11-30" + 0'), {}).text === 'Nov 30');
check('date in another year', cellOf(calcCol('DATE(2027, 1, 5)'), {}).text === 'Jan 5, 2027');
check('a coloured text is a label', show(cellOf(calcCol('"Late"', { formula: { mode: 'calc', expr: '"Late"', labelColors: { Late: '#E53935' } } }), {})) === show({ kind: 'label', text: 'Late', color: '#E53935' }));
check('an error explains itself', cellOf(calcCol('1 / 0'), {}).title?.startsWith('Division by zero') === true);
check('yes/no', cellOf(calcCol('1 < 2'), {}).text === 'Yes');
check('export a date', formulaExportValue(fDate(dayFromISO('2026-11-30')!)) === '2026-11-30');
check('export a number', formulaExportValue(12.5) === 12.5);
check('iso round trip', isoFromDay(dayFromISO('2028-02-29')!) === '2028-02-29');
check('today is a day', todayDay(new Date(2026, 10, 1, 23, 59)) === TODAY);

// sorting: numbers by value, then text, empty last
const disp = (v: FValue) => formulaDisplay(v, { formula: { mode: 'calc' } });
const sorted = [disp('b'), disp(null), disp(10), disp(2), disp('A')].sort(compareFormulaDisplays).map(x => x.text);
check('sort order', JSON.stringify(sorted) === JSON.stringify([(2).toLocaleString(), (10).toLocaleString(), 'A', 'b', '']), JSON.stringify(sorted));

// summaries
const SUMCOL = calcCol('{#c-price} * 2');
const sumRows = [row({ 'c-price': 1 }), row({ 'c-price': 2 }), row({})];
const s1 = summarizeFormula(SUMCOL, sumRows, [...BASE, SUMCOL], ctx);
check('number summary', s1.kind === 'number' && s1.sum === 6 && s1.count === 2, JSON.stringify(s1));
const s2 = summarizeFormula(RULES, [row(late), row({ ...late, 'c-status': 'o-done' }), row({})], [...BASE, RULES], ctx);
check('label summary', s2.kind === 'labels' && s2.parts.length === 2 && s2.empty === 1, JSON.stringify(s2));

// ---- copying and checking --------------------------------------------------------
const map: Record<string, string> = { 'c-tl': 'n-tl', 'c-status': 'n-status', 'c-price': 'n-price' };
const moved = remapFormula(overdue, id => map[id], (columnId, optionId) => (columnId === 'c-status' && optionId === 'o-done' ? 'n-done' : undefined))!;
check('rules remapped', moved.rules![0].conditions[0].columnId === 'n-tl' && moved.rules![0].conditions[1].columnId === 'n-status' && (moved.otherwise as { columnId: string }).columnId === 'n-status');
check('status options remapped', JSON.stringify(moved.rules![0].conditions[1].value) === '["n-done"]');
check('expression remapped', remapFormula({ mode: 'calc', expr: '{#c-price} * {#c-tl:end} + {#name}' }, id => map[id])!.expr === '{#n-price} * {#n-tl:end} + {#name}');
check('columns a formula reads', JSON.stringify(formulaColumnIds(overdue).sort()) === JSON.stringify(['c-status', 'c-tl']));
check('expression check passes', checkExpression('{#c-price} * 2', BASE) === null);
check('expression check: own column', checkExpression('{#c-f} * 2', [...BASE], 'c-f')?.message.includes('own column') === true);
check('expression check: unknown title', checkExpression('{Nope} * 2', BASE)?.message.includes('no column called') === true);
check('expression check: typed titles', checkExpression('{Price} * {Timeline#End}', BASE) === null);
check('expression check points into the typed text', checkExpression('{Price} * {Nope}', BASE)?.at === 10);
check('expression check: #End on a number', checkExpression('{#c-price:end}', BASE)?.message.includes('Timeline') === true);
check('rules check passes', checkRules(overdue, BASE) === null);
check('rules check: no IF', checkRules({ mode: 'rules', rules: [] }, BASE)?.message === 'Add an IF first');
check('rules check: empty label', checkRules({ mode: 'rules', rules: [{ id: 'r', match: 'all', conditions: [{ id: 'c', columnId: 'c-check', op: 'checked' }], then: { kind: 'label', text: ' ', color: '#000' } }] }, BASE)?.message.includes('label a name') === true);

// ---- blank rows, colours by meaning, ready-made rules ---------------------------------------
check('a row with nothing filled in is blank', run(calcCol('{#c-price} * {#c-qty}'), {}) === null);
check('one value is enough to show a result', run(calcCol('{#c-price} * 2 + {#c-qty}'), { 'c-price': 3 }) === 6);
check('a formula with no columns always shows', run(calcCol('1 + 1'), {}) === 2);
check('TODAY() alone always shows', show(run(calcCol('TODAY()'), {})) === show(fDate(TODAY)));
check('Overdue is red', suggestLabelColor('Overdue') === RULE_COLORS.red);
check('Due soon is amber', suggestLabelColor('Due soon') === RULE_COLORS.amber);
check('On track is green', suggestLabelColor('On track') === RULE_COLORS.green);
check('Within budget is green', suggestLabelColor('Within budget') === RULE_COLORS.green);
check('Over budget is red', suggestLabelColor('Over budget') === RULE_COLORS.red);
check('other words are neutral', suggestLabelColor('Phase 2', 0) === RULE_COLORS.blue);
const templates = ruleTemplates([...BASE]);
check('templates for these columns', JSON.stringify(templates.map(t => t.id)) === JSON.stringify(['overdue', 'due-soon', 'budget', 'owner']), JSON.stringify(templates.map(t => t.id)));
const flag = templates[0].build();
check('overdue template uses the timeline end and skips Done', flag.rules[0].conditions[0].columnId === 'c-tl' && flag.rules[0].conditions[0].part === 'end' && JSON.stringify(flag.rules[0].conditions[1].value) === '["o-done"]');
check('overdue template keeps the status otherwise', flag.otherwise.kind === 'column' && (flag.otherwise as { columnId: string }).columnId === 'c-status');
const TPL = col('c-tpl', 'Health', 'formula', { formula: { mode: 'rules', ...flag } });
check('overdue template works', (run(TPL, late) as { text: string }).text === 'Overdue');
check('templates are checked complete', checkRules({ mode: 'rules', ...templates[1].build() }, BASE) === null && checkRules({ mode: 'rules', ...templates[2].build() }, BASE) === null);
check('no templates without the columns', ruleTemplates([NOTES]).length === 0);
check('examples use the board\'s titles', calcExamples([...BASE]).some(e => e.expr.includes('{Timeline#End}')));
check('example formulas read fine', calcExamples([...BASE]).every(e => checkExpression(e.expr, BASE) === null), JSON.stringify(calcExamples([...BASE]).map(e => [e.expr, checkExpression(e.expr, BASE)])));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
