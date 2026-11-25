import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

/*
 * NHG WorkSpace API, version 1: other systems read Spaces, their tasks and
 * comments with a key made in Admin › API Keys (supabase/migrations/
 * 20261125_public_api_keys.sql). Served at https://work.nhgspace.com/api/v1/…
 * (vercel.json proxies it here); deployed with Verify JWT off, since a key is
 * not a Supabase JWT.
 *
 * - Read only: GET. `Authorization: Bearer nhg_…` (or `X-API-Key: nhg_…`).
 * - A key sees the folders chosen for it with every folder under them, and the
 *   Spaces chosen for it — never a private (PIN) Space, nor anything in the
 *   Trash (a folder, Space, task group, task or column).
 * - 120 requests a minute per key; every request is logged (api_request_log).
 * - No CORS: a key belongs on a server, never in a web page.
 *
 * Words: a folder is a Space Folder (workspaces), a space a Space (boards), a
 * group a Task Group, a task a Task (items; a subtask has parent_id).
 */

const APP_URL = 'https://work.nhgspace.com';
const RATE_PER_MINUTE = 120;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const KEY_PATTERN = /^nhg_[A-Za-z0-9_-]{40}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Row = Record<string, any>;

class ApiError extends Error {
    constructor(public status: number, public code: string, message: string) {
        super(message);
    }
}

interface Key {
    id: string;
    name: string;
    workspace_ids: string[];
    board_ids: string[];
    expires_at: string | null;
    recent: number;
}

interface Folder { id: string; title: string; parent_id: string | null; is_archived: boolean }
interface Space { id: string; title: string; description: string | null; workspace_id: string; created_at: string; updated_at: string }
interface Scope {
    folders: Map<string, Folder>;
    /** Every folder (for paths), in scope or not. */
    allFolders: Map<string, Folder>;
    spaces: Map<string, Space>;
}

const respond = (status: number, body: unknown, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), {
        status,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
            ...headers,
        },
    });

const errorBody = (code: string, message: string) => ({ error: { code, message } });

const sha256 = async (text: string) => {
    const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
    return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
};

const must = <T>(result: { data: T | null; error: { message: string } | null }, what: string): T => {
    if (result.error) {
        console.error(`[api] ${what}:`, result.error.message);
        throw new ApiError(500, 'server_error', 'Something went wrong on our side. Try again in a moment.');
    }
    return (result.data ?? []) as T;
};

// ---- what a key can see ---------------------------------------------------------

const loadScope = async (db: SupabaseClient, key: Key): Promise<Scope> => {
    const all = must<Folder[]>(await db.from('workspaces').select('id, title, parent_id, is_archived').limit(10000), 'folders');
    const allFolders = new Map(all.map(f => [f.id, f]));
    // A folder is in the Trash when it, or a folder above it, is.
    const trashed = (id: string | null) => {
        const seen = new Set<string>();
        for (let f = id ? allFolders.get(id) : undefined; f && !seen.has(f.id); f = f.parent_id ? allFolders.get(f.parent_id) : undefined) {
            if (f.is_archived) return true;
            seen.add(f.id);
        }
        return false;
    };
    const children = new Map<string, Folder[]>();
    all.forEach(f => {
        if (f.parent_id) children.set(f.parent_id, [...(children.get(f.parent_id) || []), f]);
    });
    const folders = new Map<string, Folder>();
    const queue = (key.workspace_ids || []).filter(id => allFolders.has(id) && !trashed(id));
    while (queue.length) {
        const id = queue.shift()!;
        if (folders.has(id)) continue;
        const folder = allFolders.get(id)!;
        if (folder.is_archived) continue;
        folders.set(id, folder);
        (children.get(id) || []).forEach(c => queue.push(c.id));
    }

    const cols = 'id, title, description, workspace_id, created_at, updated_at, is_private, is_archived';
    const fromFolders = folders.size
        ? must<Row[]>(await db.from('boards').select(cols).in('workspace_id', [...folders.keys()]).eq('is_archived', false).limit(10000), 'spaces')
        : [];
    const named = (key.board_ids || []).length
        ? must<Row[]>(await db.from('boards').select(cols).in('id', key.board_ids).eq('is_archived', false), 'spaces')
        : [];
    const spaces = new Map<string, Space>();
    [...fromFolders, ...named].forEach(b => {
        if (b.is_private || trashed(b.workspace_id)) return;
        spaces.set(b.id, { id: b.id, title: b.title, description: b.description || null, workspace_id: b.workspace_id, created_at: b.created_at, updated_at: b.updated_at });
    });
    return { folders, allFolders, spaces };
};

const folderPath = (scope: Scope, folderId: string | null): string[] => {
    const path: string[] = [];
    const seen = new Set<string>();
    for (let f = folderId ? scope.allFolders.get(folderId) : undefined; f && !seen.has(f.id); f = f.parent_id ? scope.allFolders.get(f.parent_id) : undefined) {
        path.unshift(f.title);
        seen.add(f.id);
    }
    return path;
};

const spaceOut = (scope: Scope, s: Space) => ({
    id: s.id,
    title: s.title,
    description: s.description,
    folder: { id: s.workspace_id, title: scope.allFolders.get(s.workspace_id)?.title ?? null },
    path: folderPath(scope, s.workspace_id),
    created_at: s.created_at,
    updated_at: s.updated_at,
    url: `${APP_URL}/?boardId=${s.id}`,
});

const spaceIn = (scope: Scope, id: string): Space => {
    const space = UUID.test(id) ? scope.spaces.get(id) : undefined;
    // The same answer for "no such Space" and "not for this key".
    if (!space) throw new ApiError(404, 'not_found', 'No Space with this id is available to this key.');
    return space;
};

// ---- values as people read them -------------------------------------------------------

interface Column { id: string; title: string; type: string; options: Row[] | null; scope: string | null; group_id: string | null; order: number }
interface Person { id: string; name: string | null; email: string | null }

const optionsOf = (c: Column): Row[] => (Array.isArray(c.options) ? c.options : []);
const listOf = (raw: unknown): string[] => (Array.isArray(raw) ? raw : raw === null || raw === undefined || raw === '' ? [] : [raw]).map(String);

const peopleIdsOf = (raw: unknown): string[] => {
    if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
    if (typeof raw === 'string' && raw) {
        if (raw.startsWith('[')) {
            try { const parsed = JSON.parse(raw); if (Array.isArray(parsed)) return parsed.map(String); } catch { /* not a list */ }
        }
        return raw.split(',').map(s => s.trim()).filter(Boolean);
    }
    return [];
};

/** A date as "YYYY-MM-DD": stored as that, an ISO time, or a spreadsheet serial number (imports). */
const dateOf = (raw: unknown): string | null => {
    if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
        return new Date(Date.UTC(1899, 11, 30) + Math.round(raw) * 86400000).toISOString().slice(0, 10);
    }
    if (typeof raw !== 'string' || !raw.trim()) return null;
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
    const t = Date.parse(raw);
    return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
};

const fieldOf = (c: Column, raw: unknown, people: Map<string, Person>): { value: unknown; text: string | null } => {
    switch (c.type) {
        case 'text':
        case 'long_text': {
            const s = raw === null || raw === undefined ? '' : typeof raw === 'string' ? raw : JSON.stringify(raw);
            return s.trim() ? { value: s, text: s } : { value: null, text: null };
        }
        case 'number': {
            const n = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw.replace(/,/g, '')) : NaN;
            return Number.isFinite(n) ? { value: n, text: String(n) } : { value: null, text: null };
        }
        case 'priority': {
            const n = typeof raw === 'number' ? raw : Number(raw);
            return Number.isFinite(n) && n > 0 ? { value: n, text: `${n}/5` } : { value: null, text: null };
        }
        case 'status': {
            if (raw === null || raw === undefined || raw === '') return { value: null, text: null };
            const o = optionsOf(c).find(x => x.id === raw || x.label === raw);
            return o ? { value: { id: o.id, label: o.label, color: o.color ?? null }, text: o.label } : { value: null, text: null };
        }
        case 'dropdown': {
            const labels = listOf(raw).map(v => optionsOf(c).find(o => o.id === v || o.label === v)?.label ?? v).filter(Boolean);
            return { value: labels, text: labels.length ? labels.join(', ') : null };
        }
        case 'date':
        case 'due_date': {
            const d = dateOf(raw);
            return { value: d, text: d };
        }
        case 'timeline': {
            const v = (raw && typeof raw === 'object' ? raw : {}) as Row;
            const start = dateOf(v.from);
            const end = dateOf(v.to);
            if (!start && !end) return { value: null, text: null };
            return { value: { start, end }, text: start && end && start !== end ? `${start} – ${end}` : (start || end) };
        }
        case 'people': {
            const list = peopleIdsOf(raw).map(id => people.get(id) ?? { id, name: null, email: null });
            return { value: list, text: list.length ? list.map(p => p.name || p.email || p.id).join(', ') : null };
        }
        case 'checkbox':
            return { value: raw === true || raw === 'true', text: raw === true || raw === 'true' ? 'Yes' : 'No' };
        case 'link': {
            if (raw && typeof raw === 'object') {
                const v = raw as Row;
                if (!v.url) return { value: null, text: null };
                return { value: { url: String(v.url), label: v.label ? String(v.label) : null }, text: v.label ? String(v.label) : String(v.url) };
            }
            return typeof raw === 'string' && raw.trim() ? { value: { url: raw.trim(), label: null }, text: raw.trim() } : { value: null, text: null };
        }
        case 'files': {
            const files = Array.isArray(raw)
                ? raw.filter(f => f && typeof f === 'object' && f.url).map((f: Row) => ({ name: f.name ?? null, url: String(f.url), type: f.type ?? null }))
                : typeof raw === 'string' && raw.trim()
                    ? raw.split(/,\s+(?=https?:\/\/)/).map(u => ({ name: null, url: u.trim(), type: 'link' }))
                    : [];
            return { value: files, text: files.length ? files.map(f => f.name || f.url).join(', ') : null };
        }
        case 'formula':
            // Worked out in the app from the row's other columns; not served yet.
            return { value: null, text: null };
        default:
            return { value: raw ?? null, text: raw === null || raw === undefined ? null : String(raw) };
    }
};

/** Column titles as keys: a second "Status" is "Status (2)", as formulas name it. */
const titleKeys = (columns: Column[]) => {
    const count = new Map<string, number>();
    return new Map(columns.map(c => {
        const n = (count.get(c.title) || 0) + 1;
        count.set(c.title, n);
        return [c.id, n === 1 ? c.title : `${c.title} (${n})`];
    }));
};

// ---- comments ---------------------------------------------------------------------------

const ENTITIES: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'" };

const htmlToText = (html: unknown): string => String(html ?? '')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/(div|p|li|h[1-6]|blockquote)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z0-9]+);/gi, (m, e: string) => {
        const lower = e.toLowerCase();
        if (lower.startsWith('#x')) return String.fromCodePoint(parseInt(lower.slice(2), 16));
        if (lower.startsWith('#') && lower !== '#39') return String.fromCodePoint(parseInt(lower.slice(1), 10));
        return ENTITIES[lower] ?? m;
    })
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const commentOut = (u: Row, people: Map<string, Person>) => ({
    id: u.id,
    author: {
        id: u.userId ?? null,
        name: (u.userId && people.get(u.userId)?.name) || u.author || null,
        email: (u.userId && people.get(u.userId)?.email) || null,
    },
    text: htmlToText(u.content),
    // As written in the app's editor; untrusted, so sanitize before showing it anywhere.
    html: u.content ?? '',
    created_at: u.createdAt ?? null,
    files: Array.isArray(u.files) ? u.files.filter((f: Row) => f?.url).map((f: Row) => ({ name: f.name ?? null, url: String(f.url), type: f.type ?? null })) : [],
    likes: Array.isArray(u.likedBy) ? u.likedBy.length : 0,
});

/** A task's comments as threads: newest first, each with its replies oldest first. */
const threadsOf = (updates: Row[], people: Map<string, Person>) => {
    const list = (Array.isArray(updates) ? updates : []).filter(u => u && u.id);
    const byKey = new Map<string, Row>();
    list.forEach(u => {
        byKey.set(u.id, u);
        if (u.postId) byKey.set(u.postId, u);
    });
    const rootOf = (u: Row): Row => {
        const seen = new Set<string>();
        let cur = u;
        while (cur.parentId && byKey.has(cur.parentId) && !seen.has(cur.id)) {
            seen.add(cur.id);
            cur = byKey.get(cur.parentId)!;
        }
        return cur;
    };
    const roots: Row[] = [];
    const replies = new Map<string, Row[]>();
    list.forEach(u => {
        const root = rootOf(u);
        if (root === u) roots.push(u);
        else replies.set(root.id, [...(replies.get(root.id) || []), u]);
    });
    const time = (u: Row) => Date.parse(u.createdAt ?? '') || 0;
    return roots
        .sort((a, b) => time(b) - time(a))
        .map(r => ({ ...commentOut(r, people), replies: (replies.get(r.id) || []).sort((a, b) => time(a) - time(b)).map(x => commentOut(x, people)) }));
};

// ---- tasks ---------------------------------------------------------------------------------

interface Board {
    space: Space;
    groups: Map<string, Row>;
    columns: Column[];
}

const loadBoard = async (db: SupabaseClient, space: Space): Promise<Board> => {
    const [groups, columns] = await Promise.all([
        db.from('groups').select('id, title, color, order').eq('board_id', space.id).eq('is_archived', false).order('order'),
        db.from('columns').select('id, title, type, options, scope, group_id, order').eq('board_id', space.id).eq('is_archived', false).order('order'),
    ]);
    return {
        space,
        groups: new Map(must<Row[]>(groups, 'groups').map(g => [g.id, g])),
        columns: must<Column[]>(columns, 'columns'),
    };
};

const taskColumns = (board: Board) => board.columns.filter(c => c.scope !== 'subitem');
const subtaskColumns = (board: Board, groupId: string) => board.columns.filter(c => c.scope === 'subitem' && c.group_id === groupId);

const loadPeople = async (db: SupabaseClient, ids: Set<string>): Promise<Map<string, Person>> => {
    const list = [...ids].filter(id => UUID.test(id));
    if (list.length === 0) return new Map();
    const rows = must<Row[]>(await db.from('profiles').select('id, full_name, email').in('id', list), 'people');
    return new Map(rows.map(p => [p.id, { id: p.id, name: p.full_name || null, email: p.email || null }]));
};

const peopleIn = (board: Board, items: Row[], withComments: boolean) => {
    const ids = new Set<string>();
    const peopleCols = new Set(board.columns.filter(c => c.type === 'people').map(c => c.id));
    items.forEach(i => {
        Object.entries(i.values || {}).forEach(([k, v]) => { if (peopleCols.has(k)) peopleIdsOf(v).forEach(id => ids.add(id)); });
        if (withComments) (Array.isArray(i.updates) ? i.updates : []).forEach((u: Row) => u?.userId && ids.add(u.userId));
    });
    return ids;
};

const taskOut = (board: Board, item: Row, groupId: string, people: Map<string, Person>, withComments: boolean) => {
    const columns = item.parent_id ? subtaskColumns(board, groupId) : taskColumns(board);
    const keys = titleKeys(columns);
    const values: Record<string, unknown> = {};
    const fields = columns.map(c => {
        const { value, text } = fieldOf(c, item.values?.[c.id], people);
        values[keys.get(c.id)!] = c.type === 'status' ? text
            : c.type === 'people' ? (value as Person[]).map(p => p.name || p.email || p.id)
                : value;
        return { column_id: c.id, title: c.title, type: c.type, value, text };
    });
    const group = board.groups.get(groupId);
    const out: Row = {
        id: item.id,
        title: item.title ?? '',
        space_id: board.space.id,
        group: group ? { id: group.id, title: group.title } : null,
        parent_id: item.parent_id ?? null,
        position: item.order ?? null,
        hidden: !!item.is_hidden,
        created_at: item.created_at,
        updated_at: item.updated_at,
        url: `${APP_URL}/?boardId=${board.space.id}&itemId=${item.id}`,
        values,
        fields,
        comment_count: Array.isArray(item.updates) ? item.updates.length : 0,
    };
    if (withComments) out.comments = threadsOf(item.updates, people);
    return out;
};

const ITEM_COLS = 'id, title, board_id, group_id, parent_id, values, order, is_hidden, created_at, updated_at, updates';

const parseLimit = (raw: string | null) => {
    if (raw === null) return DEFAULT_LIMIT;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1 || n > MAX_LIMIT) throw new ApiError(400, 'bad_request', `limit must be a whole number from 1 to ${MAX_LIMIT}.`);
    return n;
};

const parseCursor = (raw: string | null) => {
    if (raw === null || raw === '') return 0;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 0) throw new ApiError(400, 'bad_request', 'cursor is not one this API gave out.');
    return n;
};

const parseSince = (raw: string | null) => {
    if (raw === null || raw === '') return null;
    const t = Date.parse(raw);
    if (Number.isNaN(t)) throw new ApiError(400, 'bad_request', 'updated_since must be a date or time, e.g. 2026-11-01 or 2026-11-01T09:00:00Z.');
    return new Date(t).toISOString();
};

const wantsComments = (url: URL) => (url.searchParams.get('include') || '').split(',').map(s => s.trim()).includes('comments');

/** GET /v1/spaces/:id/tasks — top-level tasks, each with its subtasks, a page at a time. */
const listTasks = async (db: SupabaseClient, scope: Scope, spaceId: string, url: URL) => {
    const space = spaceIn(scope, spaceId);
    const board = await loadBoard(db, space);
    const limit = parseLimit(url.searchParams.get('limit'));
    const offset = parseCursor(url.searchParams.get('cursor'));
    const since = parseSince(url.searchParams.get('updated_since'));
    const groupId = url.searchParams.get('group_id');
    const subtasks = url.searchParams.get('subtasks') !== 'false';
    const withComments = wantsComments(url);
    if (groupId && !board.groups.has(groupId)) throw new ApiError(404, 'not_found', 'No task group with this id in this Space.');
    const liveGroups = [...board.groups.keys()];
    if (liveGroups.length === 0) return { data: [], total: 0, next_cursor: null };

    let query = db.from('items').select(ITEM_COLS, { count: 'exact' })
        .eq('board_id', space.id).eq('is_archived', false).is('parent_id', null)
        .in('group_id', groupId ? [groupId] : liveGroups);
    if (since) {
        // A task counts as changed when one of its subtasks did.
        const changedSubs = must<Row[]>(await db.from('items').select('parent_id').eq('board_id', space.id).eq('is_archived', false)
            .not('parent_id', 'is', null).gte('updated_at', since).limit(1000), 'changed subtasks');
        const parents = [...new Set(changedSubs.map(r => r.parent_id))].slice(0, 300);
        query = parents.length ? query.or(`updated_at.gte.${since},id.in.(${parents.join(',')})`) : query.gte('updated_at', since);
    }
    const result = await query.order('order', { ascending: true }).order('id', { ascending: true }).range(offset, offset + limit - 1);
    const items = must<Row[]>(result, 'tasks');
    const total = result.count ?? items.length;

    const subs = subtasks && items.length
        ? must<Row[]>(await db.from('items').select(ITEM_COLS).eq('is_archived', false).in('parent_id', items.map(i => i.id))
            .order('order', { ascending: true }).limit(10000), 'subtasks')
        : [];
    const people = await loadPeople(db, peopleIn(board, [...items, ...subs], withComments));
    const subsOf = new Map<string, Row[]>();
    subs.forEach(s => subsOf.set(s.parent_id, [...(subsOf.get(s.parent_id) || []), s]));

    return {
        data: items.map(item => {
            const task = taskOut(board, item, item.group_id, people, withComments);
            // A subtask belongs to its parent's group, whatever its own says.
            if (subtasks) task.subtasks = (subsOf.get(item.id) || []).map(s => taskOut(board, s, item.group_id, people, withComments));
            return task;
        }),
        total,
        next_cursor: offset + items.length < total ? String(offset + items.length) : null,
    };
};

/** The task (or subtask) if this key may see it: its Space, group and parent all live. */
const findTask = async (db: SupabaseClient, scope: Scope, taskId: string) => {
    const notFound = new ApiError(404, 'not_found', 'No task with this id is available to this key.');
    if (!UUID.test(taskId)) throw notFound;
    const rows = must<Row[]>(await db.from('items').select(ITEM_COLS + ', is_archived').eq('id', taskId).limit(1), 'task');
    const item = rows[0];
    if (!item || item.is_archived || !scope.spaces.has(item.board_id)) throw notFound;
    const board = await loadBoard(db, scope.spaces.get(item.board_id)!);
    let groupId = item.group_id;
    if (item.parent_id) {
        const parents = must<Row[]>(await db.from('items').select('id, group_id, is_archived').eq('id', item.parent_id).limit(1), 'parent');
        if (!parents[0] || parents[0].is_archived) throw notFound;
        groupId = parents[0].group_id;
    }
    if (!board.groups.has(groupId)) throw notFound;
    return { item, board, groupId };
};

const getTask = async (db: SupabaseClient, scope: Scope, taskId: string, url: URL) => {
    const { item, board, groupId } = await findTask(db, scope, taskId);
    const withComments = wantsComments(url);
    const subs = item.parent_id ? [] : must<Row[]>(await db.from('items').select(ITEM_COLS).eq('is_archived', false).eq('parent_id', item.id).order('order', { ascending: true }).limit(10000), 'subtasks');
    const people = await loadPeople(db, peopleIn(board, [item, ...subs], withComments));
    const task = taskOut(board, item, groupId, people, withComments);
    if (!item.parent_id) task.subtasks = subs.map(s => taskOut(board, s, groupId, people, withComments));
    return { data: task };
};

const getComments = async (db: SupabaseClient, scope: Scope, taskId: string) => {
    const { item, board } = await findTask(db, scope, taskId);
    const people = await loadPeople(db, peopleIn(board, [item], true));
    return { data: threadsOf(item.updates, people) };
};

const getSpace = async (db: SupabaseClient, scope: Scope, spaceId: string) => {
    const board = await loadBoard(db, spaceIn(scope, spaceId));
    return {
        data: {
            ...spaceOut(scope, board.space),
            groups: [...board.groups.values()].map(g => ({ id: g.id, title: g.title, color: g.color ?? null, position: g.order ?? null })),
            columns: board.columns.map(c => ({
                id: c.id,
                title: c.title,
                type: c.type,
                for: c.scope === 'subitem' ? 'subtask' : 'task',
                group_id: c.scope === 'subitem' ? c.group_id : null,
                options: ['status', 'dropdown'].includes(c.type) ? optionsOf(c).map(o => ({ id: o.id, label: o.label, color: o.color ?? null })) : undefined,
            })),
        },
    };
};

// ---- the routes ----------------------------------------------------------------------------

const ENDPOINTS = [
    'GET /api/v1',
    'GET /api/v1/folders',
    'GET /api/v1/spaces?folder_id=',
    'GET /api/v1/spaces/{space_id}',
    'GET /api/v1/spaces/{space_id}/tasks?group_id=&updated_since=&subtasks=false&include=comments&limit=&cursor=',
    'GET /api/v1/tasks/{task_id}?include=comments',
    'GET /api/v1/tasks/{task_id}/comments',
];

const route = async (db: SupabaseClient, key: Key, path: string, url: URL) => {
    const parts = path.split('/').filter(Boolean);
    if (parts[0] !== 'v1') throw new ApiError(404, 'not_found', 'Use /api/v1/… — see GET /api/v1 for what is there.');
    const scope = await loadScope(db, key);
    const [, a, id, b, ...rest] = parts;
    if (rest.length) throw new ApiError(404, 'not_found', 'There is nothing at this address. See GET /api/v1.');

    if (!a) {
        return {
            api: 'NHG WorkSpace API',
            version: 1,
            key: { name: key.name, folders: scope.folders.size, spaces: scope.spaces.size, expires_at: key.expires_at },
            endpoints: ENDPOINTS,
        };
    }
    if (a === 'folders' && !id) {
        return {
            data: [...scope.folders.values()]
                .map(f => ({
                    id: f.id,
                    title: f.title,
                    parent_id: f.parent_id,
                    path: folderPath(scope, f.id),
                    space_count: [...scope.spaces.values()].filter(s => s.workspace_id === f.id).length,
                }))
                .sort((x, y) => x.path.join(' / ').localeCompare(y.path.join(' / '))),
        };
    }
    if (a === 'spaces' && !id) {
        const folderId = url.searchParams.get('folder_id');
        return {
            data: [...scope.spaces.values()]
                .filter(s => !folderId || s.workspace_id === folderId)
                .map(s => spaceOut(scope, s))
                .sort((x, y) => [...x.path, x.title].join(' / ').localeCompare([...y.path, y.title].join(' / '))),
        };
    }
    if (a === 'spaces' && id && !b) return getSpace(db, scope, id);
    if (a === 'spaces' && id && b === 'tasks') return listTasks(db, scope, id, url);
    if (a === 'tasks' && id && !b) return getTask(db, scope, id, url);
    if (a === 'tasks' && id && b === 'comments') return getComments(db, scope, id);
    throw new ApiError(404, 'not_found', 'There is nothing at this address. See GET /api/v1.');
};

Deno.serve(async (req: Request) => {
    const started = Date.now();
    const url = new URL(req.url);
    // Reached as /api/v1/… (here, or through work.nhgspace.com).
    const path = url.pathname.replace(/^\/functions\/v1/, '').replace(/^\/api(?=\/|$)/, '') || '/';

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: { Allow: 'GET' } });
    if (req.method !== 'GET') return respond(405, errorBody('method_not_allowed', 'This API only reads: use GET.'), { Allow: 'GET' });

    const supplied = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim() || (req.headers.get('x-api-key') || '').trim();
    if (!supplied) return respond(401, errorBody('unauthorized', 'Send your API key: Authorization: Bearer nhg_…'), { 'WWW-Authenticate': 'Bearer' });
    if (!KEY_PATTERN.test(supplied)) return respond(401, errorBody('unauthorized', 'This is not a valid API key.'), { 'WWW-Authenticate': 'Bearer' });

    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
        auth: { persistSession: false, autoRefreshToken: false },
    });

    const found = await db.rpc('api_authenticate', { p_hash: await sha256(supplied) });
    if (found.error) {
        console.error('[api] authenticate:', found.error.message);
        return respond(500, errorBody('server_error', 'Something went wrong on our side. Try again in a moment.'));
    }
    const key = (found.data as Key[] | null)?.[0];
    if (!key) return respond(401, errorBody('unauthorized', 'This API key is not valid or has been revoked.'), { 'WWW-Authenticate': 'Bearer' });

    const record = (status: number) => {
        const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || null;
        const done = db.rpc('api_record_request', {
            p_key_id: key.id, p_method: req.method, p_path: path + url.search, p_status: status, p_ms: Date.now() - started, p_ip: ip,
        }).then(({ error }) => { if (error) console.error('[api] record:', error.message); });
        // @ts-ignore EdgeRuntime is the Supabase runtime's global
        if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(done);
    };

    if (key.expires_at && Date.parse(key.expires_at) <= Date.now()) {
        record(401);
        return respond(401, errorBody('key_expired', 'This API key has expired. Ask an admin for a new one.'), { 'WWW-Authenticate': 'Bearer' });
    }
    const limits = { 'X-RateLimit-Limit': String(RATE_PER_MINUTE), 'X-RateLimit-Remaining': String(Math.max(0, RATE_PER_MINUTE - key.recent - 1)) };
    if (key.recent >= RATE_PER_MINUTE) {
        record(429);
        return respond(429, errorBody('rate_limited', `At most ${RATE_PER_MINUTE} requests a minute per key. Try again shortly.`), { ...limits, 'Retry-After': '60' });
    }

    try {
        const body = await route(db, key, path, url);
        record(200);
        return respond(200, body, limits);
    } catch (e) {
        const err = e instanceof ApiError ? e : new ApiError(500, 'server_error', 'Something went wrong on our side. Try again in a moment.');
        if (!(e instanceof ApiError)) console.error('[api] unexpected:', e);
        record(err.status);
        return respond(err.status, errorBody(err.code, err.message), limits);
    }
});
