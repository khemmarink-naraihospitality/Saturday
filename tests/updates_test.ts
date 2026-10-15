/**
 * Manual verification for src/lib/updates.ts — how an item's updates are
 * listed on desktop (TaskDetail) and on the phone: duplicates from re-imports
 * collapse to the most complete copy, replies find their post by id or by the
 * imported postId, and an orphaned reply stays visible as a post.
 * Run with:  npx tsx tests/updates_test.ts
 */
import { getDedupedUpdates, hasHtmlContent, previewText, repliesTo, splitThreads } from '../src/lib/updates';

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

const u = (id: string, extra: Record<string, unknown> = {}) => ({
    id, author: 'Ann', createdAt: '2026-01-01T10:00:00Z', content: `<p>${id}</p>`, ...extra,
});

// getDedupedUpdates
eq('not an array', getDedupedUpdates(null), []);
eq('drops entries without an id', getDedupedUpdates([u('a'), { content: 'x' }, null, 'junk']).map(x => x.id), ['a']);
const dupes = [
    u('short', { content: '<p>Contract attached</p>' }),
    u('other', { content: '<p>Something else</p>' }),
    u('long', { content: '<p>Contract attached, please review by Friday</p>', createdAt: '2026-01-01T10:00:40Z' }),
];
// Same author, same minute, same first 50 chars? "contract attached" vs "contract attached, please…" differ
// within 50 chars, so these are NOT duplicates.
eq('different text is kept', getDedupedUpdates(dupes).map(x => x.id), ['short', 'other', 'long']);
const realDupes = [
    u('first', { content: '<p>' + 'x'.repeat(60) + '</p>' }),
    u('second', { content: '<p>' + 'x'.repeat(60) + ' and more</p>', createdAt: '2026-01-01T10:00:59Z' }),
];
eq('a re-imported copy collapses to the longest, in the first copy\'s place',
    getDedupedUpdates(realDupes).map(x => x.id), ['second']);
eq('another author is not a duplicate',
    getDedupedUpdates([realDupes[0], { ...realDupes[1], author: 'Bob' }]).map(x => x.id), ['first', 'second']);

// hasHtmlContent
check('text counts', hasHtmlContent('<p>hi</p>'));
check('empty markup does not', !hasHtmlContent('<p><br></p>'));
check('nbsp only does not', !hasHtmlContent('<p>&nbsp;&nbsp;</p>'));
check('an image counts', hasHtmlContent('<img src="x.gif">'));
check('empty string does not', !hasHtmlContent(''));

// previewText
eq('keeps case, drops tags, decodes entities, one line', previewText('<p>Hello&nbsp;<b>Ann</b></p><p>A &amp; B &lt;3</p>'), 'Hello Ann A & B <3');
eq('empty', previewText(''), '');
eq('an escaped entity is decoded once', previewText('&amp;lt;b&amp;gt;'), '&lt;b&gt;');

// splitThreads / repliesTo
const thread = [
    u('p1'),
    u('r1', { parentId: 'p1', contentType: 'Reply' }),
    u('p2', { postId: 'monday-77' }),
    u('r2', { parentId: 'monday-77', contentType: 'Reply' }),
    u('orphan', { parentId: 'gone', contentType: 'Reply' }),
];
const { topLevel, replies } = splitThreads(thread);
eq('posts, including an orphaned reply', topLevel.map(x => x.id), ['p1', 'p2', 'orphan']);
eq('replies', replies.map(x => x.id), ['r1', 'r2']);
eq('reply found by id', repliesTo(replies, thread[0]).map(x => x.id), ['r1']);
eq('reply found by imported postId', repliesTo(replies, thread[2]).map(x => x.id), ['r2']);
eq('a post without replies', repliesTo(replies, thread[4]), []);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
