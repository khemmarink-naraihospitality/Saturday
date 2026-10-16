/**
 * Manual verification for src/lib/linkify.ts — plain web addresses in updates
 * becoming links: which text counts as an address (findUrls), wrapping them in
 * stored HTML without touching links, mentions or code (linkifyNode), the
 * address typed before a space (autolinkBeforeCaret), and the drawn update
 * staying sanitised (displayUpdateHtml).
 * Needs a DOM:  npm install --no-save jsdom
 * Run with:     npx tsx tests/linkify_test.ts
 */
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;
g.window = dom.window;
g.document = dom.window.document;
g.NodeFilter = dom.window.NodeFilter;

let passed = 0;
let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) passed++;
    else {
        failed++;
        console.log(`FAIL ${name}${detail ? ` — ${detail}` : ''}`);
    }
};
const eq = (name: string, got: unknown, want: unknown) =>
    check(name, JSON.stringify(got) === JSON.stringify(want), `${JSON.stringify(got)} vs ${JSON.stringify(want)}`);

const main = async () => {
    const { findUrls, linkifyHtml, displayUpdateHtml, autolinkBeforeCaret } = await import('../src/lib/linkify');
    const urls = (text: string) => findUrls(text).map(m => m.text);

    // findUrls — what is an address
    eq('the address from the report', urls('https://saturday.naraihospitalitygroup.com/pattaravadee-nararattanapradit/pattara-workspace/test-import'),
        ['https://saturday.naraihospitalitygroup.com/pattaravadee-nararattanapradit/pattara-workspace/test-import']);
    eq('inside a sentence', urls('see https://example.com/a?b=1&c=2#d for details'), ['https://example.com/a?b=1&c=2#d']);
    eq('full stop after it is not part of it', urls('Go to https://example.com.'), ['https://example.com']);
    eq('comma and colon too', urls('https://a.com, https://b.com: done'), ['https://a.com', 'https://b.com']);
    eq('a bracket it never opened stays outside', urls('(see https://example.com/x)'), ['https://example.com/x']);
    eq('a bracket it opened stays in', urls('https://en.wikipedia.org/wiki/Bangkok_(disambiguation)'), ['https://en.wikipedia.org/wiki/Bangkok_(disambiguation)']);
    eq('www. without a scheme', urls('ดู www.narai.com ได้'), ['www.narai.com']);
    eq('www. gets https://', findUrls('www.narai.com')[0]?.href, 'https://www.narai.com');
    eq('Thai straight after the address is not part of it', urls('ลิงก์ https://example.com/aครับ'), ['https://example.com/a']);
    eq('Thai straight before it', urls('ดูที่https://example.com'), ['https://example.com']);
    eq('http too', urls('http://localhost:5173/x'), ['http://localhost:5173/x']);
    eq('several', urls('https://a.com and www.b.org'), ['https://a.com', 'www.b.org']);
    eq('no scheme alone', urls('https:// and www. and www.abc'), []);
    eq('not inside a word', urls('awww.example.com user@www.example.com'), []);
    eq('an email is not an address', urls('mail khemmarin.k@lubd.com'), []);
    eq('percent-encoded Thai stays whole', urls('https://th.wikipedia.org/wiki/%E0%B8%81'), ['https://th.wikipedia.org/wiki/%E0%B8%81']);
    eq('quotes end it', urls('"https://example.com"'), ['https://example.com']);
    eq('positions', findUrls('ab https://x.co cd').map(m => [m.start, m.end]), [[3, 15]]);

    // linkifyHtml — stored HTML
    const one = linkifyHtml('<p>Test <a href="https://google.com">google</a></p><p>https://example.com/test-import</p>');
    check('a plain address becomes a link', /<a href="https:\/\/example\.com\/test-import" target="_blank" rel="noopener noreferrer" style="[^"]*">https:\/\/example\.com\/test-import<\/a>/.test(one), one);
    check('an existing link is left alone', (one.match(/<a /g) || []).length === 2 && one.includes('<a href="https://google.com">google</a>'), one);
    const chip = '<p><span data-id="u1" contenteditable="false">@https://not.a.link</span> https://x.com</p>';
    const chipOut = linkifyHtml(chip);
    check('a mention chip is left alone', chipOut.includes('<span data-id="u1" contenteditable="false">@https://not.a.link</span>') && chipOut.includes('<a href="https://x.com"'), chipOut);
    const code = linkifyHtml('<code>https://x.com</code>');
    check('code is left alone', code === '<code>https://x.com</code>', code);
    eq('no address, nothing changes', linkifyHtml('<p>hello <b>world</b></p>'), '<p>hello <b>world</b></p>');
    const mid = linkifyHtml('<p>before https://a.com middle www.b.com after</p>');
    check('text around the links is kept', mid.startsWith('<p>before <a') && mid.includes('</a> middle <a') && mid.endsWith('</a> after</p>'), mid);

    // displayUpdateHtml — still sanitised
    const evil = displayUpdateHtml('<img src=x onerror="alert(1)"><p>https://x.com</p><a href="javascript:alert(1)">bad</a>');
    check('sanitised first', !/onerror|javascript:/i.test(evil) && /<a href="https:\/\/x\.com"/.test(evil), evil);
    check('same content, same answer (cached)', displayUpdateHtml('<p>https://x.com</p>') === displayUpdateHtml('<p>https://x.com</p>'));

    // autolinkBeforeCaret — typed address then a space
    const editor = document.createElement('div');
    editor.setAttribute('contenteditable', 'true');
    document.body.appendChild(editor);
    const typeInto = (text: string) => {
        editor.innerHTML = '';
        const node = document.createTextNode(text);
        editor.appendChild(node);
        const range = document.createRange();
        range.setStart(node, text.length);
        range.collapse(true);
        const sel = document.getSelection()!;
        sel.removeAllRanges();
        sel.addRange(range);
    };
    typeInto('see https://x.co/a ');
    const did = autolinkBeforeCaret(editor);
    check('typed address + space becomes a link', did && editor.innerHTML === 'see <a href="https://x.co/a" target="_blank" rel="noopener noreferrer" style="color: #0073ea; text-decoration: underline;">https://x.co/a</a> ', editor.innerHTML);
    const sel = document.getSelection()!;
    check('caret ends after the space, outside the link', sel.anchorNode?.nodeType === 3 && sel.anchorNode?.parentNode === editor && sel.anchorOffset === 1, `${sel.anchorNode?.nodeName} ${sel.anchorOffset}`);
    typeInto('(https://x.co) ');
    autolinkBeforeCaret(editor);
    check('bracketed address', editor.innerHTML.startsWith('(<a href="https://x.co"') && editor.innerHTML.endsWith('</a>) '), editor.innerHTML);
    typeInto('just words ');
    check('ordinary words are left alone', !autolinkBeforeCaret(editor) && editor.innerHTML === 'just words ');
    typeInto('https://x.co');
    check('no space yet: not yet', !autolinkBeforeCaret(editor));

    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
};

void main();
