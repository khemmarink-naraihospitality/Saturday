/**
 * Manual verification for sanitizeHtml: what an update/reply body may keep, and
 * what has to go.
 * Needs a DOM:  npm install --no-save jsdom
 * Run with:     npx tsx tests/sanitize_html_test.ts
 */
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
(globalThis as any).window = dom.window;
(globalThis as any).document = dom.window.document;

let passed = 0;
let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) passed++;
    else {
        failed++;
        console.log(`FAIL ${name}${detail ? ` — ${detail}` : ''}`);
    }
};

const main = async () => {
    const { sanitizeHtml } = await import('../src/lib/sanitizeHtml');
    const parse = (html: string) => {
        const d = new JSDOM(`<body>${html}</body>`).window.document;
        return d.body;
    };

    // --- attacks ---------------------------------------------------------
    const bad: [string, string][] = [
        ['script tag', '<p>hi</p><script>alert(1)</script>'],
        ['img onerror', '<img src="x" onerror="alert(1)">'],
        ['svg onload', '<svg onload="alert(1)"></svg>'],
        ['javascript: link', '<a href="javascript:alert(1)">x</a>'],
        ['iframe', '<iframe src="https://evil.example"></iframe>'],
        ['onclick on span', '<span onclick="alert(1)">x</span>'],
        ['form + button', '<form action="https://evil.example"><button>go</button></form>'],
        ['style tag', '<style>body{display:none}</style>x'],
        ['text input', '<input type="text" value="password">'],
        ['file input', '<input type="file">'],
        ['meta refresh', '<meta http-equiv="refresh" content="0;url=https://evil.example">'],
        ['mutation-xss noscript', '<noscript><p title="</noscript><img src=x onerror=alert(1)>">'],
    ];
    for (const [name, html] of bad) {
        const out = sanitizeHtml(html);
        const body = parse(out);
        const dangerous =
            body.querySelector('script, iframe, form, button, style, meta, svg[onload], input:not([type="checkbox"])') ||
            [...body.querySelectorAll('*')].some(el =>
                [...el.attributes].some(a => /^on/i.test(a.name) || /^\s*javascript:/i.test(a.value)),
            );
        check(`strips: ${name}`, !dangerous, out);
    }

    // --- what the editor makes must survive -------------------------------
    const keep = (name: string, html: string, test: (b: HTMLElement) => boolean) =>
        check(`keeps: ${name}`, test(parse(sanitizeHtml(html))), sanitizeHtml(html));

    keep('bold/italic/underline', '<p><b>a</b><i>b</i><u>c</u><s>d</s></p>', b => !!b.querySelector('b') && !!b.querySelector('i') && !!b.querySelector('u') && !!b.querySelector('s'));
    keep('lists', '<ul><li>a</li></ul><ol><li>b</li></ol>', b => !!b.querySelector('ul li') && !!b.querySelector('ol li'));
    keep('colour span style', '<span style="color: rgb(1, 2, 3); background-color: #ff0;">x</span>', b => /color/.test(b.querySelector('span')?.getAttribute('style') || ''));
    keep('font tag', '<font color="#ff0000" size="5">x</font>', b => !!b.querySelector('font[color]'));
    keep('link with target', '<a href="https://example.com" target="_blank" rel="noopener noreferrer" style="color: #0073ea;">x</a>', b => {
        const a = b.querySelector('a');
        return a?.getAttribute('href') === 'https://example.com' && a?.getAttribute('target') === '_blank' && /noopener/.test(a?.getAttribute('rel') || '');
    });
    keep('target gets noopener even if missing', '<a href="https://example.com" target="_blank">x</a>', b => /noopener/.test(b.querySelector('a')?.getAttribute('rel') || ''));
    keep('mailto link', '<a href="mailto:a@b.com">x</a>', b => b.querySelector('a')?.getAttribute('href') === 'mailto:a@b.com');
    keep('gif img', '<img src="https://media.giphy.com/x.gif" alt="GIF" style="max-width:100%;">', b => b.querySelector('img')?.getAttribute('src') === 'https://media.giphy.com/x.gif');
    keep('mention chip', '<span data-id="3767ab16-0000-0000-0000-000000000000" contenteditable="false" style="color:#1d4ed8">@Name</span>', b => {
        const s = b.querySelector('span');
        return s?.getAttribute('data-id') === '3767ab16-0000-0000-0000-000000000000' && s?.getAttribute('contenteditable') === 'false';
    });
    keep('checklist row', '<div class="editor-checklist-item" style="display:flex"><div contenteditable="false"><input type="checkbox" style="width:16px" /></div><div style="flex:1" data-checklist-new="1">t</div></div>', b =>
        !!b.querySelector('.editor-checklist-item input[type="checkbox"]') && b.querySelector('[data-checklist-new]')?.getAttribute('data-checklist-new') === '1');
    keep('checked checkbox', '<input type="checkbox" checked>', b => (b.querySelector('input') as HTMLInputElement | null)?.hasAttribute('checked') === true);
    keep('table', '<table style="width:100%"><tbody><tr><th>a</th><td>b</td></tr></tbody></table>', b => !!b.querySelector('table tbody tr th') && !!b.querySelector('table td'));
    keep('headings, quote, code', '<h2>a</h2><blockquote>b</blockquote><pre><code>c</code></pre>', b => !!b.querySelector('h2') && !!b.querySelector('blockquote') && !!b.querySelector('pre code'));
    keep('line breaks and nbsp', 'a<br>b&nbsp;c', b => !!b.querySelector('br') && /b c/.test(b.textContent || ''));

    // --- edges -------------------------------------------------------------
    check('empty string', sanitizeHtml('') === '');
    check('null', sanitizeHtml(null) === '');
    check('undefined', sanitizeHtml(undefined) === '');
    check('plain text untouched', sanitizeHtml('hello world') === 'hello world');
    const once = sanitizeHtml('<p><b>a</b> <a href="https://x.y" target="_blank">l</a></p>');
    check('idempotent', sanitizeHtml(once) === once, once);

    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
};

main();
