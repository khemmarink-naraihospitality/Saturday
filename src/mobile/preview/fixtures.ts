/**
 * Sample data for the phone-layout preview page (mobile-preview.html), shaped
 * like the reference screenshots: a "Business Tech" workspace with a "Tech
 * Summary" board, an "IT BO" board, people, updates and notifications.
 * Development only — nothing here is used by the app itself.
 */
import type { Board, Column, Comment, Group, Item, Notification, Workspace } from '../../types';

const now = Date.now();
const daysAgo = (n: number) => new Date(now - n * 86400000).toISOString();

export const ME = {
    id: 'u-me',
    name: 'Khemmarin Khuntong (UI)',
    email: 'khemmarin.k@lubd.com',
};

const person = (id: string, full_name: string, email: string) => ({ id, full_name, email, avatar_url: null as string | null });

export const PEOPLE = {
    me: person(ME.id, ME.name, ME.email),
    pat: person('u-pat', 'Pattaravadee N.', 'pattaravadee.n@naraihospitality.com'),
    kitti: person('u-kit', 'Kitti Boriphan', 'kitti.b@naraihospitality.com'),
    jirayu: person('u-jir', 'Jirayu Chaichana', 'jirayu.c@naraihospitality.com'),
    aum: person('u-aum', 'Aum Siriporn', 'aum.s@naraihospitality.com'),
    piku: person('u-pik', 'Piku Wongsa', 'piku.w@naraihospitality.com'),
};

export const boardMembers = Object.values(PEOPLE).map((p, i) => ({
    id: `bm-${p.id}`,
    user_id: p.id,
    role: i === 0 ? 'owner' : 'editor',
    profiles: p,
}));

export const workspaces: Workspace[] = [
    { id: 'ws-bt', title: 'Business Tech', order: 0, owner_id: ME.id, ownerName: ME.name },
    { id: 'ws-btd', title: 'Business Tech Department', order: 0, owner_id: ME.id, parentId: 'ws-bt' },
    { id: 'ws-main', title: 'Main workspace', order: 1, owner_id: ME.id },
    { id: 'ws-mkt', title: 'Marketing', order: 2, owner_id: 'u-pat' },
    { id: 'ws-fin', title: 'Finance', order: 3, owner_id: ME.id },
    { id: 'ws-ops', title: 'Operations', order: 4, owner_id: 'u-kit' },
];

// ── Tech Summary ───────────────────────────────────────────────────────────

const champion: Column = {
    id: 'c-champ', title: 'Champion', type: 'status', order: 1, width: 150,
    options: [
        { id: 'o-ui', label: 'IT (Ui)', color: '#037f4c' },
        { id: 'o-blank', label: '', color: '#cab641' },
        { id: 'o-nui', label: 'IT (Nui)', color: '#00c875' },
        { id: 'o-aum', label: 'IT (Aum)', color: '#9cd326' },
        { id: 'o-piku', label: 'Operation (Piku)', color: '#ff642e' },
        { id: 'o-kay', label: 'Marketing (Kay)', color: '#bb3354' },
        { id: 'o-pap', label: 'Ecommerce (Pap)', color: '#0086c0' },
    ],
};

const techColumns: Column[] = [
    { id: 'c-resp', title: 'Responsible', type: 'people', order: 0, width: 120 },
    champion,
    { id: 'c-renew', title: 'Renewal Date', type: 'date', order: 2, width: 140 },
    { id: 'c-cost', title: 'Subitems Cost', type: 'number', order: 3, width: 140, numberFormat: 'currency', currencyCode: 'THB' },
    { id: 'c-expire', title: 'Expire Date', type: 'date', order: 4, width: 140 },
    { id: 'c-file', title: 'File', type: 'files', order: 5, width: 140 },
    { id: 'c-note', title: 'Notes', type: 'text', order: 6, width: 200 },
    // Sub-item columns of the Tech Summary group
    { id: 'sc-cost', title: 'Cost', type: 'number', order: 0, scope: 'subitem', groupId: 'g-tech', numberFormat: 'currency', currencyCode: 'THB' },
    { id: 'sc-status', title: 'Status', type: 'status', order: 1, scope: 'subitem', groupId: 'g-tech', options: [
        { id: 'so-done', label: 'Done', color: '#00c875' },
        { id: 'so-wip', label: 'Working on it', color: '#fdab3d' },
        { id: 'so-stuck', label: 'Stuck', color: '#e2445c' },
    ] },
];

const drive = (id: string, name: string) => ({ id, name, url: `https://drive.google.com/file/d/${id}/view`, type: 'google-drive' as const });

type Row = [title: string, subitems: number, updates: number, responsible: string[], championId: string, renew: string, cost: number, expire: string, files: number];
const techRows: Row[] = [
    ['Google Workspace license', 8, 1, ['u-pat', ME.id], 'o-ui', '', 849750, '', 1],
    ['Microsoft Office license', 2, 1, ['u-pat', 'u-kit', 'u-jir'], 'o-ui', '2025-02-09', 174400, '2025-02-08', 1],
    ['Domain', 5, 1, [ME.id], 'o-ui', '', 3437.15, '', 0],
    ['Anti-virus', 2, 4, ['u-pat'], 'o-nui', '2023-05-08', 47092.5, '2024-05-07', 3],
    ['Monday', 3, 6, ['u-pat', ME.id], 'o-aum', '2023-04-28', 1068678, '2024-04-27', 3],
    ['Mews (PMS-Room)', 10, 2, [ME.id, 'u-pat'], 'o-aum', '2026-01-15', 2350000, '2027-01-14', 2],
    ['Infrasys (POS)', 8, 0, [ME.id], 'o-ui', '2026-03-01', 980000, '', 1],
    ['POS', 2, 0, [ME.id], 'o-ui', '', 125000, '', 0],
    ['AdriaScan', 5, 1, [ME.id], 'o-ui', '2026-06-30', 89000, '', 1],
    ['Mustard Music', 4, 0, ['u-jir'], 'o-ui', '', 36000, '', 0],
    ['GuestRevu', 10, 1, ['u-jir'], 'o-ui', '2026-08-01', 412000, '', 2],
    ['DocuSign', 3, 1, [ME.id, 'u-jir'], 'o-ui', '2026-11-20', 96000, '', 1],
    ['Food Story', 2, 1, [ME.id, 'u-jir'], 'o-ui', '', 54000, '', 0],
    ['AutoCad Development team', 3, 0, ['u-pik', ME.id], 'o-piku', '', 158000, '', 0],
    ['Ragnar', 2, 5, [ME.id, 'u-pat'], 'o-pap', '2026-10-30', 72000, '', 1],
];

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const ragnarUpdates: Comment[] = [
    {
        id: 'up-r1', author: ME.name, userId: ME.id, createdAt: '2023-04-03T09:12:00Z', contentType: 'Update',
        content: '<p><span data-id="u-pat" contenteditable="false" style="color:#1d4ed8;background-color:#dbeafe;padding:2px 6px;border-radius:12px;font-weight:500;display:inline-block">@Pattaravadee N.</span>&nbsp;Can you attached the final contract</p>',
        likedBy: [],
    },
    { id: 'up-r1a', author: 'Pattaravadee N.', userId: 'u-pat', createdAt: '2023-04-04T02:00:00Z', parentId: 'up-r1', contentType: 'Reply', content: '<p>Attached in Files ✅</p>' },
    { id: 'up-r1b', author: ME.name, userId: ME.id, createdAt: '2023-04-04T03:00:00Z', parentId: 'up-r1', contentType: 'Reply', content: '<p>Thank you!</p>' },
    {
        id: 'up-r2', author: 'Pattaravadee N.', userId: 'u-pat', createdAt: '2023-04-10T08:30:00Z', contentType: 'Update',
        content: '<p>Update 10 Apr 2023</p><p><br></p><p>Progress</p><p><br></p><p>* Already done PR Process<br>Next Step</p><p><br></p><p>* -</p>',
        likedBy: ['u-me'],
    },
    { id: 'up-r3', author: ME.name, userId: ME.id, createdAt: '2023-03-20T08:30:00Z', contentType: 'Update', content: '<p>Kick-off with the vendor booked for next week.</p>' },
];

const techItems: Item[] = [];
techRows.forEach(([title, subitems, updates, responsible, championId, renew, cost, expire, files], index) => {
    const id = `i-${slug(title)}`;
    techItems.push({
        id,
        title,
        groupId: 'g-tech',
        boardId: 'b-tech',
        order: index,
        values: {
            'c-resp': responsible,
            'c-champ': championId,
            'c-renew': renew || undefined,
            'c-cost': cost,
            'c-expire': expire || undefined,
            'c-file': Array.from({ length: files }, (_, f) => drive(`${id}-f${f}`, `${title} contract ${f + 1}.pdf`)),
        },
        updates: title === 'Ragnar' ? ragnarUpdates : [],
        updatesCount: updates,
        updatesLoaded: title === 'Ragnar',
        lastUpdateAt: updates ? daysAgo(10 + index) : undefined,
        createdAt: daysAgo(400 - index),
        files: title === 'Ragnar' ? [drive('ragnar-contract', 'Ragnar final contract.pdf'), drive('ragnar-quote', 'Quotation 2023.xlsx')] : [],
    });
    for (let s = 0; s < subitems; s++) {
        techItems.push({
            id: `${id}-s${s}`,
            title: `${title} — seat ${s + 1}`,
            groupId: 'g-tech',
            boardId: 'b-tech',
            parentId: id,
            order: s,
            values: { 'sc-cost': Math.round(cost / Math.max(1, subitems)), 'sc-status': ['so-done', 'so-wip', 'so-stuck'][s % 3] },
            updates: [],
            updatesCount: 0,
            updatesLoaded: true,
        });
    }
});

const withGroups = (board: Omit<Board, 'groups'> & { groupDefs: Omit<Group, 'items'>[] }): Board => {
    const { groupDefs, ...rest } = board;
    return {
        ...rest,
        groups: groupDefs.map(g => ({ ...g, items: rest.items.filter(i => i.groupId === g.id) })),
    };
};

export const techSummary = withGroups({
    id: 'b-tech',
    workspaceId: 'ws-btd',
    title: 'Tech Summary',
    isFavorite: true,
    lastViewedAt: daysAgo(6),
    columns: techColumns,
    items: techItems,
    groupDefs: [{ id: 'g-tech', title: 'Tech Summary', color: '#a25ddc', order: 0 }],
    isDataLoaded: true,
    itemColumnTitle: 'Item',
    activeViewId: 'main_table',
    collapsedGroups: [],
    expandedItemIds: [],
});

// ── IT BO ─────────────────────────────────────────────────────────────────

const itBoColumns: Column[] = [
    { id: 'bo-files', title: 'Files', type: 'files', order: 0 },
    { id: 'bo-tl', title: 'Timeline', type: 'timeline', order: 1 },
    { id: 'bo-status', title: 'Status', type: 'status', order: 2, options: [
        { id: 'bs-done', label: 'Done', color: '#00c875' },
        { id: 'bs-wip', label: 'Working on it', color: '#fdab3d' },
        { id: 'bs-stuck', label: 'Stuck', color: '#e2445c' },
    ] },
    { id: 'bo-owner', title: 'Owner', type: 'people', order: 3 },
];

const itBoItems: Item[] = [
    { id: 'bo-1', title: 'New employee', groupId: 'g-overall', boardId: 'b-it-bo', order: 0, values: { 'bo-files': [drive('bo1a', 'Offer letter.pdf'), drive('bo1b', 'Checklist.xlsx')], 'bo-status': 'bs-wip', 'bo-owner': [ME.id] }, updatesCount: 0, updatesLoaded: true, updates: [] },
    { id: 'bo-2', title: 'New employee', groupId: 'g-overall', boardId: 'b-it-bo', order: 1, values: { 'bo-status': 'bs-stuck' }, updatesCount: 0, updatesLoaded: true, updates: [] },
    { id: 'bo-3', title: 'Overview', groupId: 'g-overall', boardId: 'b-it-bo', order: 2, values: { 'bo-tl': { from: '2025-11-01', to: '2026-01-31' }, 'bo-status': 'bs-done' }, updatesCount: 2, updatesLoaded: true, updates: [] },
    { id: 'bo-4', title: 'Laptop setup', groupId: 'g-tech', boardId: 'b-it-bo', order: 0, values: { 'bo-tl': { from: '2026-10-01', to: '2026-10-20' }, 'bo-status': 'bs-wip', 'bo-owner': ['u-kit'] }, updatesCount: 1, updatesLoaded: true, updates: [] },
    { id: 'bo-5', title: 'Email & accounts', groupId: 'g-tech', boardId: 'b-it-bo', order: 1, values: { 'bo-status': 'bs-done', 'bo-owner': ['u-jir', ME.id] }, updatesCount: 0, updatesLoaded: true, updates: [] },
];

export const itBo = withGroups({
    id: 'b-it-bo',
    workspaceId: 'ws-btd',
    title: 'IT BO',
    isFavorite: true,
    lastViewedAt: daysAgo(2),
    columns: itBoColumns,
    items: itBoItems,
    groupDefs: [
        { id: 'g-overall', title: 'Overall', color: '#808080', order: 0 },
        { id: 'g-tech', title: 'Tech', color: '#a25ddc', order: 1 },
    ],
    isDataLoaded: true,
    itemColumnTitle: 'Employee',
    activeViewId: 'main_table',
    collapsedGroups: [],
    expandedItemIds: [],
});

// ── Other boards (metadata only, as loadUserData leaves them) ─────────────

const stub = (id: string, title: string, workspaceId: string, extra: Partial<Board> = {}): Board => ({
    id, title, workspaceId, columns: [], groups: [], items: [], isDataLoaded: false, ...extra,
});

export const boards: Board[] = [
    itBo,
    stub('b-it-narai', 'IT Narai Mai Khao', 'ws-bt', { isFavorite: true, lastViewedAt: daysAgo(3) }),
    techSummary,
    stub('b-nmk', 'Narai Mai Khao Projects', 'ws-btd', { is_private: true, lastViewedAt: daysAgo(20) }),
    stub('b-bt-projects', 'Business Tech Projects', 'ws-btd', { isFavorite: true, is_private: true }),
    stub('b-mkt-cal', 'Marketing Calendar', 'ws-mkt', { lastViewedAt: daysAgo(9) }),
    stub('b-fin', 'Finance x BusinessTech', 'ws-fin', { lastViewedAt: daysAgo(1), isFavorite: true }),
    stub('b-ops', 'Ops Requests', 'ws-ops', { lastViewedAt: daysAgo(30) }),
    stub('b-main', 'My first board', 'ws-main', { lastViewedAt: daysAgo(700) }),
];

export const notifications: Notification[] = [
    { id: 'n1', type: 'mention', title: 'Pattaravadee N. mentioned you', message: 'in Ragnar: "Contract attached, please review"', data: { board_id: 'b-tech', item_id: 'i-ragnar' }, is_read: false, created_at: daysAgo(0.1), user_id: ME.id, actor_id: 'u-pat', content: 'Pattaravadee N. mentioned you in Ragnar' },
    { id: 'n2', type: 'assignment', title: 'You were assigned', message: 'Kitti Boriphan assigned you to Laptop setup', data: { board_id: 'b-it-bo', item_id: 'bo-4' }, is_read: false, created_at: daysAgo(0.6), user_id: ME.id, actor_id: 'u-kit', content: 'Kitti Boriphan assigned you to Laptop setup' },
    { id: 'n3', type: 'comment', title: 'New update', message: 'Jirayu Chaichana replied on DocuSign', data: { board_id: 'b-tech', item_id: 'i-docusign' }, is_read: true, created_at: daysAgo(2), user_id: ME.id, actor_id: 'u-jir', content: 'Jirayu Chaichana replied on DocuSign' },
    { id: 'n4', type: 'due_date_reminder', title: 'Due soon', message: 'Ragnar is due on Oct 30', data: { board_id: 'b-tech', item_id: 'i-ragnar' }, is_read: true, created_at: daysAgo(4), user_id: ME.id, content: 'Ragnar is due on Oct 30' },
];

export const workspaceMembers: Record<string, unknown[]> = {
    'ws-bt': [{ id: 'wm1', user_id: ME.id, role: 'owner', profiles: PEOPLE.me }],
    'ws-btd': [
        { id: 'wm2', user_id: ME.id, role: 'owner', profiles: PEOPLE.me },
        { id: 'wm3', user_id: 'u-pat', role: 'member', profiles: PEOPLE.pat },
        { id: 'wm4', user_id: 'u-jir', role: 'member', profiles: PEOPLE.jirayu },
    ],
};

// ── A big board, for checking speed (?screen=board-large) ─────────────────

/** 12 groups × 400 items over the Tech Summary columns; built only when asked for. */
export const buildLargeBoard = (): Board => {
    const colors = ['#a25ddc', '#579bfc', '#00c875', '#fdab3d', '#e2445c', '#037f4c', '#ff158a', '#784bd1', '#66ccff', '#bb3354', '#cab641', '#808080'];
    const groupDefs = colors.map((color, g) => ({ id: `lg-${g}`, title: `Group ${g + 1}`, color, order: g }));
    const items: Item[] = [];
    groupDefs.forEach((group, g) => {
        for (let i = 0; i < 400; i++) {
            const base = techItems[(g * 400 + i) % techItems.length];
            items.push({
                ...base,
                id: `lg-${g}-${i}`,
                title: `${base.title} #${g * 400 + i + 1}`,
                groupId: group.id,
                boardId: 'b-large',
                parentId: undefined,
                order: i,
            });
        }
    });
    return withGroups({
        id: 'b-large',
        workspaceId: 'ws-btd',
        title: 'Large board',
        columns: techColumns,
        items,
        groupDefs,
        isDataLoaded: true,
        itemColumnTitle: 'Item',
        activeViewId: 'main_table',
        collapsedGroups: [],
        expandedItemIds: [],
    });
};
