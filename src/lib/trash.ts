import { supabase } from './supabase';
import { useBoardStore } from '../store/useBoardStore';
import type { Comment } from '../types';
export { threadOf } from './updates';

/*
 * The Trash (profile menu › Trash): everything deleted, from a folder down to
 * an update, with where it lives and who deleted it when. Reading is the
 * trash_list / trash_counts functions (supabase/migrations/20261116_trash.sql),
 * which apply the tables' own read rules; restoring is here, and puts each
 * thing back exactly where it was — bringing back first whatever it sits in
 * (its folder, board, group or parent) if that is in the Trash too, since it
 * would otherwise come back somewhere nobody can see.
 */

export type TrashKind = 'workspace' | 'board' | 'group' | 'item' | 'subitem' | 'column' | 'update';

export interface TrashEntry {
    kind: TrashKind;
    id: string;
    title: string;
    /** Folder: its boards. Board / group: their items. Item: sub-items deleted with it. Update: its replies. */
    innerCount: number | null;
    folderId: string | null;
    folderTitle: string | null;
    folderPath: string | null;
    folderTrashed: boolean;
    boardId: string | null;
    boardTitle: string | null;
    boardTrashed: boolean;
    groupId: string | null;
    groupTitle: string | null;
    groupColor: string | null;
    groupTrashed: boolean;
    parentId: string | null;
    parentTitle: string | null;
    parentTrashed: boolean;
    itemId: string | null;
    itemTitle: string | null;
    itemTrashed: boolean;
    columnScope: string | null;
    deletedAt: string | null;
    deletedBy: string | null;
    deletedByName: string | null;
}

export interface TrashQuery {
    kind?: Exclude<TrashKind, 'subitem'> | null;
    search?: string;
    mine?: boolean;
    limit?: number;
    offset?: number;
}

export const TRASH_PAGE = 50;

const mapRow = (r: any): TrashEntry => ({
    kind: r.kind,
    id: r.id,
    title: r.title ?? '',
    innerCount: r.inner_count ?? null,
    folderId: r.folder_id ?? null,
    folderTitle: r.folder_title ?? null,
    folderPath: r.folder_path ?? r.folder_title ?? null,
    folderTrashed: !!r.folder_trashed,
    boardId: r.board_id ?? null,
    boardTitle: r.board_title ?? null,
    boardTrashed: !!r.board_trashed,
    groupId: r.group_id ?? null,
    groupTitle: r.group_title ?? null,
    groupColor: r.group_color ?? null,
    groupTrashed: !!r.group_trashed,
    parentId: r.parent_id ?? null,
    parentTitle: r.parent_title ?? null,
    parentTrashed: !!r.parent_trashed,
    itemId: r.item_id ?? null,
    itemTitle: r.item_title ?? null,
    itemTrashed: !!r.item_trashed,
    columnScope: r.column_scope ?? null,
    deletedAt: r.deleted_at ?? null,
    deletedBy: r.deleted_by ?? null,
    deletedByName: r.deleted_by_name ?? null,
});

export const fetchTrash = async (q: TrashQuery): Promise<{ rows: TrashEntry[]; total: number }> => {
    const { data, error } = await supabase.rpc('trash_list', {
        p_kind: q.kind || null,
        p_search: q.search?.trim() || null,
        p_mine: !!q.mine,
        p_limit: q.limit ?? TRASH_PAGE,
        p_offset: q.offset ?? 0,
    });
    if (error) throw error;
    const rows = (data || []).map(mapRow);
    return { rows, total: data?.[0]?.total ?? 0 };
};

export const fetchTrashCounts = async (q: Pick<TrashQuery, 'search' | 'mine'>): Promise<Record<string, number>> => {
    const { data, error } = await supabase.rpc('trash_counts', { p_search: q.search?.trim() || null, p_mine: !!q.mine });
    if (error) throw error;
    const out: Record<string, number> = {};
    for (const r of data || []) out[r.kind] = Number(r.n) || 0;
    return out;
};

/* ------------------------------------------------------------------ where */

/** Folder path, board, group, parent and item, outermost first — what "where" means for an entry. */
export interface LocationPart { label: string; trashed: boolean; color?: string | null; folder?: boolean }

export const locationParts = (e: TrashEntry): LocationPart[] => {
    const parts: LocationPart[] = [];
    if (e.folderPath) {
        // One step per folder; "in Trash" goes on the innermost, which is what is hidden
        const folders = e.folderPath.split(' › ');
        folders.forEach((label, i) => parts.push({ label, trashed: e.folderTrashed && i === folders.length - 1, folder: true }));
    }
    if (e.kind === 'workspace') return parts;
    if (e.kind !== 'board' && e.boardTitle) parts.push({ label: e.boardTitle, trashed: e.boardTrashed });
    if (e.kind !== 'group' && e.groupTitle) parts.push({ label: e.groupTitle, trashed: e.groupTrashed, color: e.groupColor });
    if (e.parentTitle) parts.push({ label: e.parentTitle, trashed: e.parentTrashed });
    if (e.kind === 'update' && e.itemTitle) parts.push({ label: e.itemTitle, trashed: e.itemTrashed });
    return parts;
};

/* --------------------------------------------------------------- restore */

export interface Restored {
    /** What came back with it because it sat inside them, e.g. `Group “Q4”`. */
    alsoRestored: { kind: TrashKind; id: string; title: string }[];
    /** For an update: its id, so Open can take you to it. */
    updateId?: string;
}

class RestoreError extends Error {}

/** Un-archive one row; a row the caller may not write comes back empty rather than as an error. */
const unarchive = async (table: 'boards' | 'groups' | 'items' | 'columns', id: string, what: string) => {
    const { data, error } = await supabase.from(table).update({ is_archived: false }).eq('id', id).select('id');
    if (error) throw new RestoreError(`Could not restore ${what}: ${error.message}`);
    if (!data || data.length === 0) throw new RestoreError(`You don't have the rights to restore ${what}.`);
};

/** The folder and every folder above it that is in the Trash, brought back from the top down. */
const restoreFolderChain = async (folderId: string | null, also: Restored['alsoRestored']) => {
    if (!folderId) return;
    const chain: { id: string; title: string; is_archived: boolean }[] = [];
    let id: string | null = folderId;
    for (let depth = 0; id && depth < 20; depth++) {
        const res: { data: any } = await supabase.from('workspaces').select('id, title, parent_id, is_archived').eq('id', id).maybeSingle();
        const row: any = res.data;
        if (!row) break;
        chain.push(row);
        id = row.parent_id;
    }
    for (const w of chain.reverse()) {
        if (!w.is_archived) continue;
        const { data, error } = await supabase.rpc('restore_workspace', { p_id: w.id });
        if (error || data !== true) {
            throw new RestoreError(`“${w.title}” is in the Trash, and only its owner or an admin can bring it back.`);
        }
        also.push({ kind: 'workspace', id: w.id, title: w.title });
    }
    // A folder above that the caller cannot even see may still be in the Trash
    const { data: stillTrashed } = await supabase.rpc('workspace_is_trashed', { p_id: folderId });
    if (stillTrashed === true) {
        throw new RestoreError('A folder it sits in is in the Trash, and only that folder’s owner or an admin can bring it back.');
    }
};

const restoreBoardChain = async (e: TrashEntry, also: Restored['alsoRestored']) => {
    if (e.folderTrashed) await restoreFolderChain(e.folderId, also);
    if (e.boardTrashed && e.boardId) {
        await unarchive('boards', e.boardId, `the board “${e.boardTitle}”`);
        also.push({ kind: 'board', id: e.boardId, title: e.boardTitle || '' });
    }
};

const byNewest = (a: Comment, b: Comment) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0);

const restoreUpdate = async (e: TrashEntry): Promise<string> => {
    const { data: row, error } = await supabase.from('trashed_updates')
        .select('id, item_id, board_id, update_id, thread, deleted_at, deleted_by').eq('id', e.id).maybeSingle();
    if (error || !row) throw new RestoreError('This update is no longer in the Trash.');
    const thread: Comment[] = Array.isArray(row.thread) ? row.thread : [];

    // Out of the Trash first: only whoever deleted it (or an admin) may, and
    // doing it first means nobody else can put a second copy back.
    const { data: taken, error: takeError } = await supabase.from('trashed_updates').delete().eq('id', row.id).select('id');
    if (takeError || !taken?.length) throw new RestoreError('Only the person who deleted this update, or an admin, can restore it.');

    const putBackInTrash = () => supabase.from('trashed_updates').insert(row);
    const { data: item, error: readError } = await supabase.from('items').select('updates').eq('id', row.item_id).single();
    if (readError || !item) {
        await putBackInTrash();
        throw new RestoreError('Could not read the item the update belongs to.');
    }
    const current: Comment[] = Array.isArray(item.updates) ? item.updates : [];
    const have = new Set(current.map(u => u.id));
    // Stored newest first, as addUpdate prepends
    const next = [...current, ...thread.filter(u => !have.has(u.id))].sort(byNewest);

    const { error: writeError } = await supabase.from('items').update({ updates: next }).eq('id', row.item_id);
    if (writeError) {
        await putBackInTrash();
        throw new RestoreError(`Could not restore the update: ${writeError.message}`);
    }
    return row.update_id;
};

export const restoreTrashEntry = async (e: TrashEntry): Promise<Restored> => {
    const store = useBoardStore.getState();
    const also: Restored['alsoRestored'] = [];
    let updateId: string | undefined;

    switch (e.kind) {
        case 'workspace': {
            // Its own parent folders first, then itself
            const { data, error } = await supabase.from('workspaces').select('parent_id').eq('id', e.id).maybeSingle();
            if (error) throw new RestoreError(`Could not restore “${e.title}”: ${error.message}`);
            if (data?.parent_id && e.folderTrashed) await restoreFolderChain(data.parent_id, also);
            const { data: ok, error: rpcError } = await supabase.rpc('restore_workspace', { p_id: e.id });
            if (rpcError || ok !== true) throw new RestoreError('Only the owner of this folder or an admin can restore it.');
            store.logActivity('workspace_restored', 'workspace', e.id, { workspace_title: e.title });
            break;
        }
        case 'board': {
            if (e.folderTrashed) await restoreFolderChain(e.folderId, also);
            await unarchive('boards', e.id, `“${e.title}”`);
            if (e.folderId) store.logActivity('board_restored', 'workspace', e.folderId, { workspace_id: e.folderId, board_title: e.title });
            break;
        }
        case 'group': {
            await restoreBoardChain(e, also);
            await unarchive('groups', e.id, `“${e.title}”`);
            if (e.boardId) store.logActivity('group_restored', 'board', e.boardId, { board_id: e.boardId, group_title: e.title });
            break;
        }
        case 'item':
        case 'subitem': {
            await restoreBoardChain(e, also);
            if (e.groupTrashed && e.groupId) {
                await unarchive('groups', e.groupId, `“${e.groupTitle}”`);
                also.push({ kind: 'group', id: e.groupId, title: e.groupTitle || '' });
            }
            if (e.parentTrashed && e.parentId) {
                await unarchive('items', e.parentId, `“${e.parentTitle}”`);
                also.push({ kind: 'item', id: e.parentId, title: e.parentTitle || '' });
            }
            await unarchive('items', e.id, `“${e.title}”`);
            // Its sub-items that went to the Trash with it (not ones deleted on their own before)
            let children = supabase.from('items').update({ is_archived: false }).eq('parent_id', e.id).eq('is_archived', true);
            if (e.deletedAt) {
                const at = Date.parse(e.deletedAt);
                children = children
                    .gte('archived_at', new Date(at - 60_000).toISOString())
                    .lte('archived_at', new Date(at + 60_000).toISOString());
            }
            await children;
            if (e.boardId) store.logActivity('item_restored', 'board', e.boardId, { board_id: e.boardId, item_title: e.title });
            break;
        }
        case 'column': {
            await restoreBoardChain(e, also);
            if (e.columnScope === 'subitem' && e.groupTrashed && e.groupId) {
                await unarchive('groups', e.groupId, `“${e.groupTitle}”`);
                also.push({ kind: 'group', id: e.groupId, title: e.groupTitle || '' });
            }
            await unarchive('columns', e.id, `the column “${e.title}”`);
            if (e.boardId) store.logActivity('column_restored', 'board', e.boardId, { board_id: e.boardId, column_title: e.title });
            break;
        }
        case 'update': {
            await restoreBoardChain(e, also);
            if (e.groupTrashed && e.groupId) {
                await unarchive('groups', e.groupId, `“${e.groupTitle}”`);
                also.push({ kind: 'group', id: e.groupId, title: e.groupTitle || '' });
            }
            if (e.parentTrashed && e.parentId) {
                await unarchive('items', e.parentId, `“${e.parentTitle}”`);
                also.push({ kind: 'item', id: e.parentId, title: e.parentTitle || '' });
            }
            if (e.itemTrashed && e.itemId) {
                await unarchive('items', e.itemId, `“${e.itemTitle}”`);
                also.push({ kind: 'item', id: e.itemId, title: e.itemTitle || '' });
            }
            updateId = await restoreUpdate(e);
            if (e.boardId) store.logActivity('update_restored', 'board', e.boardId, { board_id: e.boardId, item_title: e.itemTitle || '' });
            break;
        }
    }

    await refreshAfterRestore(e, also);
    return { alsoRestored: also, updateId };
};

/** Bring the app's own copy up to date with what came back. */
const refreshAfterRestore = async (e: TrashEntry, also: Restored['alsoRestored']) => {
    const store = useBoardStore.getState();
    const listsChanged = e.kind === 'workspace' || e.kind === 'board' || also.some(a => a.kind === 'workspace' || a.kind === 'board');
    if (listsChanged) await store.loadUserData(true);
    const boardId = e.kind === 'board' ? e.id : e.boardId;
    if (!boardId || e.kind === 'workspace') return;
    useBoardStore.setState(state => ({
        boards: state.boards.map(b => (b.id === boardId ? { ...b, isDataLoaded: false } : b)),
    }));
    if (useBoardStore.getState().activeBoardId === boardId) await useBoardStore.getState().loadBoardData(boardId, false, true);
};

/** Take the person to where the entry now is. */
export const openRestored = (e: TrashEntry, restored: Restored | undefined) => {
    const store = useBoardStore.getState();
    if (e.kind === 'workspace') {
        store.setActiveWorkspace(e.id);
        store.navigateTo('dashboard');
        return;
    }
    const boardId = e.kind === 'board' ? e.id : e.boardId;
    if (!boardId) return;
    store.setActiveBoard(boardId);
    if (e.kind === 'item' || e.kind === 'subitem') store.setActiveItem(e.id);
    if (e.kind === 'update' && e.itemId) {
        store.setActiveItem(e.itemId);
        store.setHighlightedUpdate(restored?.updateId || null);
    }
};

export const isRestoreError = (err: unknown): err is Error => err instanceof RestoreError;

/**
 * The rows on screen after a restore: the restored entry and whatever came back
 * with it no longer say "in Trash", and an entry that came back alongside is
 * shown as restored itself.
 */
export const afterRestore = (rows: TrashEntry[], e: TrashEntry, r: Restored): { rows: TrashEntry[]; alsoDone: string[] } => {
    const back = [{ kind: e.kind === 'subitem' ? 'item' : e.kind, id: e.id }, ...r.alsoRestored.map(a => ({ kind: a.kind, id: a.id }))];
    const has = (kind: string, id: string | null) => !!id && back.some(b => b.kind === kind && b.id === id);
    const alsoDone = rows
        .filter(x => x !== e && has(x.kind === 'subitem' ? 'item' : x.kind, x.id))
        .map(x => `${x.kind}:${x.id}`);
    return {
        alsoDone,
        rows: rows.map(x => ({
            ...x,
            folderTrashed: x.folderTrashed && !has('workspace', x.folderId),
            boardTrashed: x.boardTrashed && !has('board', x.boardId),
            groupTrashed: x.groupTrashed && !has('group', x.groupId),
            parentTrashed: x.parentTrashed && !has('item', x.parentId),
            itemTrashed: x.itemTrashed && !has('item', x.itemId),
        })),
    };
};
