/**
 * Manual verification for the phone layout's screen data helpers
 * (src/mobile/screens/data.ts): breadcrumbs, workspace families, recents,
 * paging and who may add boards / invite.
 * Run with:  npx tsx tests/mobile_screens_test.ts
 */
import {
    workspacePath, workspaceFamily, mergeRecents, pagesOf, canCreateBoardIn, canInviteTo, workspaceRole, orderedWorkspaceTree
} from '../src/mobile/screens/data';
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
const eq = (name: string, got: unknown, want: unknown) =>
    check(name, JSON.stringify(got) === JSON.stringify(want), `${JSON.stringify(got)} vs ${JSON.stringify(want)}`);

const ws = (id: string, title: string, extra: Partial<Workspace> = {}): Workspace => ({ id, title, order: 0, owner_id: 'owner', ...extra });
const workspaces: Workspace[] = [
    ws('bt', 'Business Tech', { order: 1 }),
    ws('btd', 'Business Tech Department', { parentId: 'bt' }),
    ws('btd2', 'Infra', { parentId: 'btd' }),
    ws('mkt', 'Marketing', { order: 0 }),
    ws('orphan', 'Orphan', { parentId: 'gone' }),
];
const board = (id: string, workspaceId: string, extra: Partial<Board> = {}): Board =>
    ({ id, title: id, workspaceId, columns: [], groups: [], items: [], ...extra });

// workspacePath
eq('top-level path', workspacePath('bt', workspaces), 'Business Tech');
eq('sub-workspace path', workspacePath('btd', workspaces), 'Business Tech > Business Tech Department');
eq('unknown workspace', workspacePath('nope', workspaces), '');
eq('missing parent shows itself', workspacePath('orphan', workspaces), 'Orphan');

// workspaceFamily
eq('family includes nested sub-workspaces', [...workspaceFamily('bt', workspaces)].sort(), ['bt', 'btd', 'btd2']);
eq('leaf family is itself', [...workspaceFamily('mkt', workspaces)], ['mkt']);

// mergeRecents
const boards: Board[] = [
    board('b1', 'bt', { lastViewedAt: '2026-10-10T10:00:00Z' }),
    board('b2', 'btd', { lastViewedAt: '2026-10-14T10:00:00Z' }),
    board('b3', 'btd', { lastViewedAt: '2026-10-12T10:00:00Z', is_archived: true }),
    board('b4', 'mkt'),
    board('b5', 'mkt', { lastViewedAt: 'not a date' }),
];
const recents = mergeRecents(boards, workspaces, [{ id: 'mkt', at: '2026-10-13T00:00:00Z' }, { id: 'deleted', at: '2026-10-15T00:00:00Z' }]);
eq('newest first, archived / never-visited / deleted left out', recents.map(r => `${r.kind}:${r.id}`), ['board:b2', 'workspace:mkt', 'board:b1']);
eq('limit', mergeRecents(boards, workspaces, [], 1).map(r => r.id), ['b2']);

// pagesOf
eq('pages of three', pagesOf([1, 2, 3, 4, 5, 6, 7], 3), [[1, 2, 3], [4, 5, 6], [7]]);
eq('no pages', pagesOf([], 3), []);

// roles / permissions
const base = { userWorkspaceRoles: { bt: 'member', btd: 'admin', mkt: 'viewer' } as Record<string, string> };
eq('owner role', workspaceRole({ ...base, workspace: ws('x', 'X', { owner_id: 'me' }), userId: 'me' }), 'owner');
eq('member role', workspaceRole({ ...base, workspace: workspaces[0], userId: 'me' }), 'member');
eq('no role', workspaceRole({ ...base, workspace: workspaces[4], userId: 'me' }), null);
check('member can add boards (sidebar rule)', canCreateBoardIn({ ...base, workspace: workspaces[0], userId: 'me' }));
check('viewer cannot add boards', !canCreateBoardIn({ ...base, workspace: workspaces[3], userId: 'me' }));
check('system admin can add boards anywhere', canCreateBoardIn({ ...base, workspace: workspaces[3], userId: 'me', systemRole: 'it_admin' }));
check('member cannot invite', !canInviteTo({ ...base, workspace: workspaces[0], userId: 'me' }));
check('admin can invite', canInviteTo({ ...base, workspace: workspaces[1], userId: 'me' }));
check('owner can invite', canInviteTo({ ...base, workspace: ws('x', 'X', { owner_id: 'me' }), userId: 'me' }));
check('no workspace, no rights', !canCreateBoardIn({ ...base, workspace: undefined, userId: 'me', systemRole: 'super_admin' }));

// orderedWorkspaceTree
// Marketing and the orphan share order 0 (then by title); Business Tech is order 1.
eq('tree order: top-level by order then title, children under parents, orphan treated as top-level',
    orderedWorkspaceTree(workspaces).map(r => `${'-'.repeat(r.depth)}${r.workspace.id}`),
    ['mkt', 'orphan', 'bt', '-btd', '--btd2']);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
