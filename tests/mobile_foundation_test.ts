/**
 * Manual verification for the phone layout's pure helpers: the text helpers in
 * src/mobile/ui/format.ts and the URL → board resolver in src/mobile/nav/paths.ts.
 * Run with:  npx tsx tests/mobile_foundation_test.ts
 */
import { greetingFor, relativeTime, shortAge, initialsOf, colorFor } from '../src/mobile/ui/format';
import { resolveBoardPath } from '../src/mobile/nav/paths';
import { boardPathSegment } from '../src/lib/utils';
import type { Board, Workspace } from '../src/types';

let passed = 0;
let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) passed++;
    else {
        failed++;
        console.log(`FAIL ${name}${detail ? ` — ${detail}` : ''}`);
    }
};
const eq = (name: string, got: unknown, want: unknown) => check(name, got === want, `${JSON.stringify(got)} vs ${JSON.stringify(want)}`);

// ---- greetingFor ---------------------------------------------------------------
eq('morning', greetingFor(new Date(2026, 9, 15, 6)), 'Good morning');
eq('11:59 still morning', greetingFor(new Date(2026, 9, 15, 11, 59)), 'Good morning');
eq('noon is afternoon', greetingFor(new Date(2026, 9, 15, 12)), 'Good afternoon');
eq('18:00 is evening', greetingFor(new Date(2026, 9, 15, 18)), 'Good evening');
eq('midnight is morning', greetingFor(new Date(2026, 9, 15, 0)), 'Good morning');

// ---- relativeTime ---------------------------------------------------------------
const now = new Date(2026, 9, 15, 15, 0, 0); // Thu 15 Oct 2026, 15:00 local
const ago = (ms: number) => new Date(now.getTime() - ms);
const H = 3600e3, D = 24 * H;
eq('empty', relativeTime(null, now), '');
eq('bad date', relativeTime('nope', now), '');
eq('seconds', relativeTime(ago(20e3), now), 'just now');
eq('one minute', relativeTime(ago(61e3), now), '1 minute ago');
eq('minutes', relativeTime(ago(45 * 60e3), now), '45 minutes ago');
eq('earlier today', relativeTime(ago(3 * H), now), 'today');
eq('yesterday evening', relativeTime(new Date(2026, 9, 14, 23, 30), now), 'yesterday');
eq('yesterday by calendar, not 24h', relativeTime(new Date(2026, 9, 14, 16, 0), now), 'yesterday');
eq('3 days', relativeTime(ago(3 * D), now), '3 days ago');
eq('6 days', relativeTime(ago(6 * D), now), '6 days ago');
eq('7 days = last week', relativeTime(ago(7 * D), now), 'last week');
eq('13 days = last week', relativeTime(ago(13 * D), now), 'last week');
eq('15 days', relativeTime(ago(15 * D), now), '2 weeks ago');
eq('40 days', relativeTime(ago(40 * D), now), 'last month');
eq('100 days', relativeTime(ago(100 * D), now), '3 months ago');
eq('400 days', relativeTime(ago(400 * D), now), 'last year');
eq('3 years', relativeTime(ago(3 * 366 * D), now), '3 years ago');
eq('a future date reads as today', relativeTime(new Date(now.getTime() + 2 * H), now), 'just now');
eq('ISO string input', relativeTime(new Date(now.getTime() - 2 * D).toISOString(), now), '2 days ago');

// ---- shortAge -----------------------------------------------------------------------
eq('now', shortAge(ago(10e3), now), 'now');
eq('5m', shortAge(ago(5 * 60e3), now), '5m');
eq('3h', shortAge(ago(3 * H), now), '3h');
eq('2d', shortAge(ago(2 * D), now), '2d');
eq('3w', shortAge(ago(22 * D), now), '3w');
eq('5mo', shortAge(ago(160 * D), now), '5mo');
eq('3yr (like the reference)', shortAge(new Date(2023, 3, 10), now), '3yr');
eq('future clamps to now', shortAge(new Date(now.getTime() + D), now), 'now');
eq('bad', shortAge(undefined, now), '');

// ---- initials / colours ---------------------------------------------------------------
eq('two words', initialsOf('Pattaravadee Narattanapradit'), 'PN');
eq('one word', initialsOf('Kitti'), 'KI');
eq('email', initialsOf('khemmarin.k@lubd.com'), 'KK');
eq('blank', initialsOf('   '), '?');
eq('null', initialsOf(null), '?');
eq('Thai name keeps its first characters', initialsOf('สมชาย ใจดี').length, 2);
check('colour is stable', colorFor('Business Tech') === colorFor('Business Tech'));
check('colour is a hex value', /^#[0-9A-F]{6}$/i.test(colorFor('x')));
check('empty key still gets a colour', /^#/.test(colorFor(null)));

// ---- resolveBoardPath --------------------------------------------------------------------
const workspaces: Workspace[] = [
    { id: 'ws1', title: 'Business Tech', order: 0, owner_id: 'u' },
    { id: 'ws2', title: 'Marketing', order: 1, owner_id: 'u' },
];
const board = (id: string, title: string, workspaceId: string, extra: Partial<Board> = {}): Board =>
    ({ id, title, workspaceId, columns: [], groups: [], items: [], ...extra });
const boards: Board[] = [
    board('aaaaaaaa-1111', 'Tech Summary', 'ws1'),
    board('bbbbbbbb-2222', 'Tech Summary', 'ws2'),
    board('cccccccc-3333', 'Old Board', 'ws1', { is_archived: true }),
    board('dddddddd-4444', 'งานประจำเดือน', 'ws1'),
    board('eeeeeeee-5555', 'Dup', 'ws1'),
    board('ffffffff-6666', 'Dup', 'ws1'),
];
const parts = (path: string) => path.split('/').filter(Boolean);
eq('bare title in its workspace', resolveBoardPath(parts('/me/business-tech/tech-summary'), boards, workspaces)?.id, 'aaaaaaaa-1111');
eq('same title, other workspace', resolveBoardPath(parts('/me/marketing/tech-summary'), boards, workspaces)?.id, 'bbbbbbbb-2222');
eq('id suffix wins over title', resolveBoardPath(parts('/me/business-tech/anything--ffffffff'), boards, workspaces)?.id, 'ffffffff-6666');
eq('archived boards never resolve', resolveBoardPath(parts('/me/business-tech/old-board'), boards, workspaces), undefined);
eq('archived by id neither', resolveBoardPath(parts('/me/business-tech/old-board--cccccccc'), boards, workspaces), undefined);
eq('Thai title resolves by its id suffix', resolveBoardPath(parts('/me/business-tech/--dddddddd'), boards, workspaces)?.id, 'dddddddd-4444');
eq('unknown workspace', resolveBoardPath(parts('/me/nope/tech-summary'), boards, workspaces), undefined);
eq('suffix in the wrong workspace', resolveBoardPath(parts('/me/marketing/x--aaaaaaaa'), boards, workspaces), undefined);

// The phone resolves exactly the segments the URL sync writes.
for (const b of boards.filter(x => !x.is_archived)) {
    const siblings = boards.filter(x => !x.is_archived && x.workspaceId === b.workspaceId);
    const ws = workspaces.find(w => w.id === b.workspaceId)!;
    const path = `/me/${ws.title.toLowerCase().replace(/\s+/g, '-')}/${boardPathSegment(b, siblings)}`;
    eq(`round trip ${b.title} (${b.id.slice(0, 4)})`, resolveBoardPath(parts(path), boards, workspaces)?.id, b.id);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
