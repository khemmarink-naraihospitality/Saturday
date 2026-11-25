import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactElement } from 'react';
import { BookOpen, Check, ChevronDown, ChevronRight, Copy, ExternalLink, KeyRound, Lock, Plus, RefreshCw, Search, Settings2, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { ConfirmModal } from '../ui/ConfirmModal';

/*
 * Admin › API Keys: keys for the NHG WorkSpace API (supabase/functions/api),
 * which lets another system read Spaces, tasks and comments. A key reaches the
 * workspaces picked for it (and every workspace under them) and the boards
 * picked for it. Requests are checked against a hash of the key; the key itself
 * is kept encrypted in Supabase Vault so an admin can Copy it again (logged).
 * Manage changes a key's name, what it reads and its expiry, or regenerates it.
 */

const BASE_URL = 'https://work.nhgspace.com/api/v1';
/** The API's documentation (src/pages/ApiDocsPage.tsx), public. */
const DOCS_URL = 'https://work.nhgspace.com/api-docs';

interface KeyRow {
    id: string;
    name: string;
    key_prefix: string;
    workspace_ids: string[];
    board_ids: string[];
    created_by: string | null;
    created_at: string;
    expires_at: string | null;
    last_used_at: string | null;
    request_count: number;
    revoked_at: string | null;
    revoked_by: string | null;
    /** Kept in the Vault, so Copy can include it (keys made before 25-Nov-2026 aren't). */
    copyable: boolean;
}
interface FolderRow { id: string; title: string; parent_id: string | null; is_archived: boolean }
interface BoardRow { id: string; title: string; workspace_id: string; is_private: boolean; is_archived: boolean }

/** Expiry choices: 'keep' (Manage only), 'never', or a number of days from now. */
const EXPIRY: { label: string; value: string }[] = [
    { label: 'Never expires', value: 'never' },
    { label: 'Expires in 30 days', value: '30' },
    { label: 'Expires in 90 days', value: '90' },
    { label: 'Expires in 1 year', value: '365' },
];

const expiresFor = (choice: string, current: string | null): string | null =>
    choice === 'keep' ? current : choice === 'never' ? null : new Date(Date.now() + Number(choice) * 86400000).toISOString();

/** Put text on the clipboard that is still being fetched (Safari wants the write started inside the click). */
const writeClipboard = async (text: Promise<string>) => {
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
        try {
            await navigator.clipboard.write([new ClipboardItem({ 'text/plain': text.then(t => new Blob([t], { type: 'text/plain' })) })]);
            return;
        } catch { /* the plain way below */ }
    }
    await navigator.clipboard.writeText(await text);
};

const card: CSSProperties = { padding: '24px', marginBottom: '24px' };
const muted: CSSProperties = { color: '#64748b', fontSize: '13.5px' };
const label: CSSProperties = { fontSize: '13px', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '6px' };
const input: CSSProperties = {
    width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: '8px',
    fontSize: '14px', outline: 'none', boxSizing: 'border-box', backgroundColor: '#fafafa',
};
const primary: CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '9px 16px', borderRadius: '8px',
    border: 'none', backgroundColor: '#6366f1', color: 'white', fontSize: '14px', fontWeight: 600, cursor: 'pointer',
};
const secondary: CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px',
    border: '1px solid #e2e8f0', backgroundColor: 'white', color: '#334155', fontSize: '13.5px', fontWeight: 500, cursor: 'pointer',
};
const code: CSSProperties = {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '12.5px',
    backgroundColor: '#f1f5f9', color: '#0f172a', padding: '2px 6px', borderRadius: '5px',
};

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');

const statusOf = (k: KeyRow): { text: string; color: string; bg: string } =>
    k.revoked_at ? { text: 'Revoked', color: '#b91c1c', bg: '#fef2f2' }
        : k.expires_at && Date.parse(k.expires_at) <= Date.now() ? { text: 'Expired', color: '#b45309', bg: '#fffbeb' }
            : { text: 'Active', color: '#15803d', bg: '#f0fdf4' };

const CopyButton = ({ text, label: what = 'Copy' }: { text: string; label?: string }) => {
    const [done, setDone] = useState(false);
    return (
        <button
            type="button"
            style={secondary}
            onClick={async () => {
                try {
                    await navigator.clipboard.writeText(text);
                    setDone(true);
                    setTimeout(() => setDone(false), 2000);
                } catch { /* the text is on screen to copy by hand */ }
            }}
        >
            {done ? <Check size={14} /> : <Copy size={14} />} {done ? 'Copied' : what}
        </button>
    );
};

/** Workspaces as a folding tree with their boards: tick a workspace (with all under it) or single boards. */
const AccessPicker = ({ folders, boards, chosenFolders, chosenBoards, onFolders, onBoards, defaultOpen }: {
    folders: FolderRow[];
    boards: BoardRow[];
    chosenFolders: Set<string>;
    chosenBoards: Set<string>;
    onFolders: (next: Set<string>) => void;
    onBoards: (next: Set<string>) => void;
    /** Folders shown open at first: those holding what the key already reads. */
    defaultOpen?: Set<string>;
}) => {
    const [query, setQuery] = useState('');
    const [open, setOpen] = useState<Set<string>>(() => new Set(defaultOpen));
    const live = useMemo(() => folders.filter(f => !f.is_archived), [folders]);
    const byId = useMemo(() => new Map(live.map(f => [f.id, f])), [live]);
    const children = useMemo(() => {
        const m = new Map<string | null, FolderRow[]>();
        live.forEach(f => {
            const parent = f.parent_id && byId.has(f.parent_id) ? f.parent_id : null;
            m.set(parent, [...(m.get(parent) || []), f]);
        });
        m.forEach(list => list.sort((a, b) => a.title.localeCompare(b.title)));
        return m;
    }, [live, byId]);
    const boardsIn = useMemo(() => {
        const m = new Map<string, BoardRow[]>();
        boards.filter(b => !b.is_archived).forEach(b => m.set(b.workspace_id, [...(m.get(b.workspace_id) || []), b]));
        m.forEach(list => list.sort((a, b) => a.title.localeCompare(b.title)));
        return m;
    }, [boards]);
    // A workspace ticked covers everything under it.
    const covered = (id: string | null): boolean => {
        const seen = new Set<string>();
        for (let f = id ? byId.get(id) : undefined; f && !seen.has(f.id); f = f.parent_id ? byId.get(f.parent_id) : undefined) {
            if (chosenFolders.has(f.id)) return true;
            seen.add(f.id);
        }
        return false;
    };
    const q = query.trim().toLowerCase();
    const matches = useCallback((f: FolderRow): boolean =>
        !q || f.title.toLowerCase().includes(q)
        || (boardsIn.get(f.id) || []).some(b => b.title.toLowerCase().includes(q))
        || (children.get(f.id) || []).some(c => matches(c)), [q, boardsIn, children]);

    const toggle = (set: Set<string>, id: string) => {
        const next = new Set(set);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
    };

    const rows: ReactElement[] = [];
    const walk = (parent: string | null, depth: number) => {
        (children.get(parent) || []).filter(matches).forEach(f => {
            const isOpen = !!q || open.has(f.id);
            const inherited = covered(f.parent_id);
            const ticked = inherited || chosenFolders.has(f.id);
            rows.push(
                <div key={`f-${f.id}`} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 8px', paddingLeft: `${8 + depth * 20}px`, fontSize: '13.5px' }}>
                    <button type="button" onClick={() => setOpen(toggle(open, f.id))} aria-label={isOpen ? `Fold ${f.title}` : `Open ${f.title}`}
                        style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', color: '#94a3b8', display: 'flex' }}>
                        {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                    </button>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: inherited ? 'default' : 'pointer', fontWeight: 600, color: '#1e293b' }}>
                        <input type="checkbox" checked={ticked} disabled={inherited} onChange={() => onFolders(toggle(chosenFolders, f.id))} />
                        {f.title}
                        {chosenFolders.has(f.id) && <span style={{ fontSize: '11.5px', fontWeight: 500, color: '#6366f1' }}>with everything in it</span>}
                    </label>
                </div>
            );
            if (!isOpen) return;
            (boardsIn.get(f.id) || []).filter(b => !q || b.title.toLowerCase().includes(q) || f.title.toLowerCase().includes(q)).forEach(b => {
                const viaFolder = ticked;
                rows.push(
                    <label key={`b-${b.id}`} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 8px', paddingLeft: `${8 + depth * 20 + 41}px`, fontSize: '13.5px', color: b.is_private ? '#94a3b8' : '#334155', cursor: b.is_private || viaFolder ? 'default' : 'pointer' }}>
                        <input type="checkbox" checked={!b.is_private && (viaFolder || chosenBoards.has(b.id))} disabled={b.is_private || viaFolder} onChange={() => onBoards(toggle(chosenBoards, b.id))} />
                        {b.title}
                        {b.is_private && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '11.5px' }}><Lock size={11} /> private, never served</span>}
                    </label>
                );
            });
            walk(f.id, depth + 1);
        });
    };
    walk(null, 0);

    return (
        <div>
            <div style={{ position: 'relative', marginBottom: '8px' }}>
                <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search workspaces and boards" style={{ ...input, paddingLeft: '32px' }} aria-label="Search workspaces and boards" />
            </div>
            <div style={{ maxHeight: '320px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '4px 0', backgroundColor: 'white' }}>
                {rows.length ? rows : <p style={{ ...muted, padding: '12px' }}>Nothing matches “{query}”.</p>}
            </div>
        </div>
    );
};

type FormState = null | { mode: 'create' } | { mode: 'edit'; key: KeyRow; notice?: string };

export const ApiKeys = () => {
    const [keys, setKeys] = useState<KeyRow[]>([]);
    const [folders, setFolders] = useState<FolderRow[]>([]);
    const [boards, setBoards] = useState<BoardRow[]>([]);
    const [names, setNames] = useState<Map<string, string>>(new Map());
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    const [form, setForm] = useState<FormState>(null);
    const [name, setName] = useState('');
    const [expiry, setExpiry] = useState('never');
    const [chosenFolders, setChosenFolders] = useState<Set<string>>(new Set());
    const [chosenBoards, setChosenBoards] = useState<Set<string>>(new Set());
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [made, setMade] = useState<{ title: string; key: string; share: string } | null>(null);
    const [revoking, setRevoking] = useState<KeyRow | null>(null);
    const [rotating, setRotating] = useState<KeyRow | null>(null);
    const [copying, setCopying] = useState<{ id: string; state: 'busy' | 'done' } | null>(null);
    // What Copy put on the clipboard (shown with the key masked), or, when the
    // browser refused, the whole message to copy by hand.
    const [shared, setShared] = useState<{ title: string; text: string; key: string; ok: boolean } | null>(null);
    const [regenCopy, setRegenCopy] = useState<KeyRow | null>(null);
    const topRef = useRef<HTMLDivElement>(null);

    const load = useCallback(async () => {
        setLoadError(null);
        const [k, w, b] = await Promise.all([
            supabase.from('api_keys').select('id, name, key_prefix, workspace_ids, board_ids, created_by, created_at, expires_at, last_used_at, request_count, revoked_at, revoked_by, copyable').order('created_at', { ascending: false }),
            supabase.from('workspaces').select('id, title, parent_id, is_archived').limit(5000),
            supabase.from('boards').select('id, title, workspace_id, is_private, is_archived').limit(10000),
        ]);
        if (k.error || w.error || b.error) {
            setLoadError('Couldn’t load the API keys — check your connection and try again.');
            setLoading(false);
            return;
        }
        const rows = (k.data || []) as KeyRow[];
        setKeys(rows);
        setFolders((w.data || []) as FolderRow[]);
        setBoards((b.data || []) as BoardRow[]);
        const people = [...new Set(rows.flatMap(r => [r.created_by, r.revoked_by]).filter(Boolean) as string[])];
        if (people.length) {
            const { data } = await supabase.from('profiles').select('id, full_name, email').in('id', people);
            setNames(new Map((Array.isArray(data) ? data : []).map(p => [p.id, p.full_name || p.email || 'Someone'])));
        }
        setLoading(false);
    }, []);

    useEffect(() => { void load(); }, [load]);

    const folderTitle = useMemo(() => new Map(folders.map(f => [f.id, f.title])), [folders]);
    const boardTitle = useMemo(() => new Map(boards.map(b => [b.id, b.title])), [boards]);
    const folderParent = useMemo(() => new Map(folders.map(f => [f.id, f.parent_id])), [folders]);
    const boardFolder = useMemo(() => new Map(boards.map(b => [b.id, b.workspace_id])), [boards]);

    /** What a key reads, as the developer will read it (the API's words). */
    const readsText = (folderIds: string[], boardIds: string[]) => [
        ...folderIds.map(id => `${folderTitle.get(id) ?? 'a deleted folder'} (Space Folder, with everything in it)`),
        ...boardIds.map(id => `${boardTitle.get(id) ?? 'a deleted space'} (Space)`),
    ].join('; ');

    /** The message Copy puts on the clipboard: everything a developer needs to start. */
    const shareText = (k: Pick<KeyRow, 'name' | 'workspace_ids' | 'board_ids' | 'expires_at'>, key: string) => [
        `NHG WorkSpace API key — ${k.name}`,
        '',
        `Key: ${key}`,
        `Reads: ${readsText(k.workspace_ids, k.board_ids)}`,
        `Expires: ${k.expires_at ? new Date(k.expires_at).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : 'never'}`,
        '',
        `API documentation: ${DOCS_URL}`,
        `Base URL: ${BASE_URL}`,
        '',
        'Keep the key secret: store it on the server that calls the API, never in a web page, a repository or a shared document.',
    ].join('\n');

    const closeForm = () => {
        setForm(null);
        setName('');
        setExpiry('never');
        setChosenFolders(new Set());
        setChosenBoards(new Set());
        setFormError(null);
    };

    const openCreate = () => {
        closeForm();
        setMade(null);
        setForm({ mode: 'create' });
    };

    const openManage = (k: KeyRow, notice?: string) => {
        setMade(null);
        setForm({ mode: 'edit', key: k, notice });
        setName(k.name);
        setExpiry(k.expires_at ? 'keep' : 'never');
        setChosenFolders(new Set(k.workspace_ids));
        setChosenBoards(new Set(k.board_ids));
        setFormError(null);
        requestAnimationFrame(() => topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    };

    // Open, in Manage, the folders that hold what the key reads.
    const openFolders = useMemo(() => {
        const out = new Set<string>();
        if (form?.mode !== 'edit') return out;
        const climb = (id: string | null | undefined) => {
            const seen = new Set<string>();
            for (let f = id; f && !seen.has(f); f = folderParent.get(f) ?? null) {
                out.add(f);
                seen.add(f);
            }
        };
        form.key.board_ids.forEach(b => climb(boardFolder.get(b)));
        form.key.workspace_ids.forEach(f => climb(folderParent.get(f)));
        return out;
    }, [form, folderParent, boardFolder]);

    const check = () => {
        if (!name.trim()) { setFormError('Give the key a name — say which system will use it.'); return false; }
        if (chosenFolders.size + chosenBoards.size === 0) { setFormError('Tick at least one workspace or board the key may read.'); return false; }
        return true;
    };

    const create = async () => {
        if (!check()) return;
        setSaving(true);
        setFormError(null);
        const expiresAt = expiresFor(expiry, null);
        const { data, error } = await supabase.rpc('create_api_key', {
            p_name: name.trim(),
            p_workspace_ids: [...chosenFolders],
            p_board_ids: [...chosenBoards],
            p_expires_at: expiresAt,
        });
        setSaving(false);
        const row = Array.isArray(data) ? data[0] : null;
        if (error || !row?.api_key) {
            setFormError(error?.message || 'Couldn’t create the key. Try again.');
            return;
        }
        setMade({
            title: `“${name.trim()}” is ready.`,
            key: row.api_key,
            share: shareText({ name: name.trim(), workspace_ids: [...chosenFolders], board_ids: [...chosenBoards], expires_at: expiresAt }, row.api_key),
        });
        closeForm();
        void load();
    };

    const save = async () => {
        if (form?.mode !== 'edit' || !check()) return;
        setSaving(true);
        setFormError(null);
        const { data, error } = await supabase.rpc('update_api_key', {
            p_id: form.key.id,
            p_name: name.trim(),
            p_workspace_ids: [...chosenFolders],
            p_board_ids: [...chosenBoards],
            p_expires_at: expiresFor(expiry, form.key.expires_at),
        });
        setSaving(false);
        if (error || data !== true) {
            setFormError(error?.message || 'This key has been revoked, so it can’t be changed.');
            return;
        }
        closeForm();
        void load();
    };

    const rotate = async (k: KeyRow) => {
        setRotating(null);
        const { data, error } = await supabase.rpc('rotate_api_key', { p_id: k.id });
        if (error || typeof data !== 'string') {
            setFormError(error?.message || 'Couldn’t regenerate the key. Try again.');
            return;
        }
        setMade({ title: `A new key for “${k.name}”. The one before it has stopped working.`, key: data, share: shareText(k, data) });
        closeForm();
        void load();
    };

    /**
     * Fetch the message (the key comes from the server) and put it on the
     * clipboard; the write starts inside the click so every browser allows it.
     * Whatever happens, the Keys card then says what was copied, or shows the
     * message to copy by hand.
     */
    const copyMessage = (k: KeyRow, fetchKey: () => Promise<string>, title: (ok: boolean) => string) => {
        setCopying({ id: k.id, state: 'busy' });
        setShared(null);
        let key = '';
        const text = (async () => {
            key = await fetchKey();
            return shareText(k, key);
        })();
        void (async () => {
            let ok = true;
            try { await writeClipboard(text); } catch { ok = false; }
            try {
                const message = await text;
                setShared({ title: title(ok), text: message, key, ok });
                setCopying(ok ? { id: k.id, state: 'done' } : null);
                if (ok) setTimeout(() => setCopying(c => (c?.id === k.id ? null : c)), 2000);
            } catch (e) {
                setCopying(null);
                setLoadError(`Couldn’t copy “${k.name}”: ${(e as Error).message}`);
            }
        })();
    };

    const copyShare = (k: KeyRow) => {
        // Made before keys were kept: nothing to copy until it gets a new key.
        if (!k.copyable) { setRegenCopy(k); return; }
        copyMessage(k, async () => {
            const { data, error } = await supabase.rpc('reveal_api_key', { p_id: k.id });
            if (error || typeof data !== 'string') throw new Error(error?.message || 'the key isn’t available');
            return data;
        }, ok => (ok ? `Copied “${k.name}”` : `Copy “${k.name}” from here`));
    };

    const regenerateAndCopy = (k: KeyRow) => {
        setRegenCopy(null);
        copyMessage(k, async () => {
            const { data, error } = await supabase.rpc('rotate_api_key', { p_id: k.id });
            if (error || typeof data !== 'string') throw new Error(error?.message || 'couldn’t make a new key');
            void load();
            return data;
        }, ok => (ok ? `New key for “${k.name}” copied — the one before it has stopped working` : `New key for “${k.name}” — copy it from here; the one before it has stopped working`));
    };

    const revoke = async (k: KeyRow) => {
        setRevoking(null);
        const { error } = await supabase.rpc('revoke_api_key', { p_id: k.id });
        if (error) setLoadError(`Couldn’t revoke “${k.name}”: ${error.message}`);
        if (form?.mode === 'edit' && form.key.id === k.id) closeForm();
        void load();
    };

    const access = (k: KeyRow) => {
        const parts = [
            ...k.workspace_ids.map(id => folderTitle.get(id) ? `${folderTitle.get(id)} (workspace)` : 'A deleted workspace'),
            ...k.board_ids.map(id => boardTitle.get(id) ?? 'A deleted board'),
        ];
        const summary = [
            k.workspace_ids.length ? `${k.workspace_ids.length} workspace${k.workspace_ids.length === 1 ? '' : 's'}` : '',
            k.board_ids.length ? `${k.board_ids.length} board${k.board_ids.length === 1 ? '' : 's'}` : '',
        ].filter(Boolean).join(' · ');
        return { summary, detail: parts.join(', ') };
    };

    const curl = `curl -H "Authorization: Bearer nhg_…" ${BASE_URL}/spaces`;
    const editing = form?.mode === 'edit' ? form.key : null;
    const expiredKeep = !!editing?.expires_at && Date.parse(editing.expires_at) <= Date.now();

    return (
        <div style={{ maxWidth: '1000px' }}>
            <div ref={topRef} className="card-surface" style={{ ...card, scrollMarginTop: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
                    <div style={{ flex: '1 1 420px' }}>
                        <h2 style={{ fontSize: '18px', fontWeight: 600, margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <KeyRound size={20} /> NHG WorkSpace API
                        </h2>
                        <p style={{ ...muted, margin: 0, lineHeight: 1.55 }}>
                            Lets another system read boards, their items with every column’s value, and the updates on them, as JSON. A key only reads — it can’t change anything —
                            and only what you pick for it. Private (PIN) boards and anything in the Trash are never served. Each key may make 120 requests a minute, and every request is logged.
                        </p>
                    </div>
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        <a href={DOCS_URL} target="_blank" rel="noopener noreferrer" style={{ ...secondary, textDecoration: 'none' }}>
                            <BookOpen size={15} /> API documentation <ExternalLink size={13} />
                        </a>
                        {!form && (
                            <button type="button" style={primary} onClick={openCreate}>
                                <Plus size={16} /> Create API key
                            </button>
                        )}
                    </div>
                </div>

                {made && (
                    <div style={{ marginTop: '20px', padding: '16px', borderRadius: '10px', border: '1px solid #bbf7d0', backgroundColor: '#f0fdf4' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '10px' }}>
                            <strong style={{ fontSize: '14px', color: '#166534' }}>{made.title}</strong>
                            <button type="button" onClick={() => setMade(null)} aria-label="Done" style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#166534', display: 'flex' }}><X size={16} /></button>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                            <code style={{ ...code, flex: '1 1 380px', padding: '10px 12px', fontSize: '13.5px', backgroundColor: 'white', border: '1px solid #bbf7d0', wordBreak: 'break-all' }}>{made.key}</code>
                            <CopyButton text={made.key} label="Copy key" />
                            <CopyButton text={made.share} label="Copy name, key and documentation" />
                        </div>
                        <p style={{ ...muted, margin: '10px 0 0', fontSize: '12.5px' }}>
                            Send it to the system’s developer privately. They keep it on that system’s server (an environment variable or a secret store), never in a web page or a shared document.
                            You can copy it again later with <strong>Copy</strong> in the list; if it leaks, revoke it there or regenerate it under <strong>Manage</strong>.
                        </p>
                    </div>
                )}

                {form && (
                    <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid #e2e8f0', display: 'grid', gap: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                            <h3 style={{ fontSize: '15px', fontWeight: 600, margin: 0 }}>
                                {editing ? <>Manage “{editing.name}” <code style={{ ...code, marginLeft: '6px', fontWeight: 400 }}>{editing.key_prefix}…</code></> : 'New API key'}
                            </h3>
                            {editing && <span style={{ ...muted, fontSize: '12.5px' }}>Changes apply to the next request the system makes.</span>}
                        </div>
                        {form.mode === 'edit' && form.notice && (
                            <p style={{ margin: 0, padding: '10px 14px', borderRadius: '8px', backgroundColor: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', fontSize: '13px', lineHeight: 1.5 }}>{form.notice}</p>
                        )}
                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: '12px' }}>
                            <div>
                                <label style={label} htmlFor="api-key-name">Name</label>
                                <input id="api-key-name" value={name} onChange={e => setName(e.target.value)} maxLength={80} placeholder="e.g. Power Automate — IT requests" style={input} />
                            </div>
                            <div>
                                <label style={label} htmlFor="api-key-expiry">Expiry</label>
                                <select id="api-key-expiry" value={expiry} onChange={e => setExpiry(e.target.value)} style={input}>
                                    {editing?.expires_at && (
                                        <option value="keep">{`${expiredKeep ? 'Expired on' : 'Keep: until'} ${new Date(editing.expires_at).toLocaleDateString()}`}</option>
                                    )}
                                    {EXPIRY.map(o => <option key={o.value} value={o.value}>{editing && o.value !== 'never' ? `${o.label} from today` : o.label}</option>)}
                                </select>
                            </div>
                        </div>
                        <div>
                            <span style={label}>What it may read</span>
                            <p style={{ ...muted, margin: '0 0 8px', fontSize: '12.5px' }}>
                                Tick a workspace to include every board in it and in the workspaces under it, now and later; or tick single boards.
                            </p>
                            <AccessPicker
                                key={editing?.id ?? 'new'}
                                folders={folders}
                                boards={boards}
                                chosenFolders={chosenFolders}
                                chosenBoards={chosenBoards}
                                onFolders={setChosenFolders}
                                onBoards={setChosenBoards}
                                defaultOpen={openFolders}
                            />
                        </div>
                        {formError && <p style={{ margin: 0, color: '#b91c1c', fontSize: '13px' }}>{formError}</p>}
                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                            {editing && (
                                <button type="button" style={{ ...secondary, marginRight: 'auto', color: '#b45309', borderColor: '#fde68a' }} onClick={() => setRotating(editing)} title="A new key in place of this one; the system using it needs the new one">
                                    <RefreshCw size={14} /> Regenerate key
                                </button>
                            )}
                            <button type="button" style={secondary} onClick={closeForm}>Cancel</button>
                            <button type="button" style={{ ...primary, opacity: saving ? 0.7 : 1 }} onClick={editing ? save : create} disabled={saving}>
                                {editing
                                    ? <><Check size={15} /> {saving ? 'Saving…' : 'Save changes'}</>
                                    : <><KeyRound size={15} /> {saving ? 'Creating…' : 'Create key'}</>}
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <div className="card-surface" style={{ ...card, padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '16px 24px', borderBottom: '1px solid #e2e8f0', fontWeight: 600, fontSize: '15px' }}>Keys</div>
                {loadError && <p style={{ margin: 0, padding: '12px 24px', color: '#b91c1c', fontSize: '13px' }}>{loadError}</p>}
                {shared && (
                    <div role="status" style={{ margin: '16px 24px 4px', padding: '14px 16px', borderRadius: '10px', border: `1px solid ${shared.ok ? '#bbf7d0' : '#fde68a'}`, backgroundColor: shared.ok ? '#f0fdf4' : '#fffbeb' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                            <strong style={{ fontSize: '14px', color: shared.ok ? '#166534' : '#92400e', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                {shared.ok && <Check size={16} />} {shared.title}
                            </strong>
                            <button type="button" onClick={() => setShared(null)} aria-label="Close" style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#64748b', display: 'flex' }}><X size={16} /></button>
                        </div>
                        <p style={{ ...muted, margin: '6px 0 10px', fontSize: '12.5px' }}>
                            {shared.ok
                                ? 'The name, the key, what it reads and the documentation link are on your clipboard. Paste them into a private message to the system’s developer.'
                                : 'Your browser didn’t allow copying. Select the message below and copy it, or use the button.'}
                        </p>
                        <pre style={{ ...code, display: 'block', margin: 0, padding: '10px 12px', whiteSpace: 'pre-wrap', wordBreak: 'break-word', backgroundColor: 'white', border: '1px solid #e2e8f0', fontSize: '12px', lineHeight: 1.55, userSelect: 'all' }}>
                            {shared.ok && shared.key ? shared.text.replace(shared.key, `${shared.key.slice(0, 12)}${'•'.repeat(16)}`) : shared.text}
                        </pre>
                        <div style={{ marginTop: '10px' }}>
                            <CopyButton text={shared.text} label={shared.ok ? 'Copy again' : 'Copy message'} />
                        </div>
                    </div>
                )}
                {loading ? (
                    <p style={{ ...muted, padding: '24px', margin: 0 }}>Loading…</p>
                ) : keys.length === 0 ? (
                    <p style={{ ...muted, padding: '24px', margin: 0 }}>No API keys yet. Create one for each system that needs to read from NHG WorkSpace.</p>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px' }}>
                            <thead>
                                <tr style={{ textAlign: 'left', color: '#64748b', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                    {['Name', 'Reads', 'Last used', 'Status', ''].map(h => <th key={h} style={{ padding: '10px 16px', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>)}
                                </tr>
                            </thead>
                            <tbody>
                                {keys.map(k => {
                                    const s = statusOf(k);
                                    const a = access(k);
                                    const copyState = copying?.id === k.id ? copying.state : null;
                                    return (
                                        <tr key={k.id} style={{ borderTop: '1px solid #f1f5f9', opacity: k.revoked_at ? 0.65 : 1, backgroundColor: editing?.id === k.id ? '#f5f3ff' : undefined }}>
                                            <td style={{ padding: '12px 16px', minWidth: '220px' }}>
                                                <div style={{ fontWeight: 600, color: '#0f172a' }}>{k.name}</div>
                                                <div style={{ marginTop: '4px', fontSize: '12px', color: '#94a3b8', lineHeight: 1.6 }}>
                                                    <code style={{ ...code, fontSize: '11.5px', marginRight: '6px' }}>{k.key_prefix}…</code>
                                                    {`Created ${new Date(k.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}${k.created_by && names.get(k.created_by) ? ` by ${names.get(k.created_by)}` : ''}${k.expires_at ? ` · until ${new Date(k.expires_at).toLocaleDateString()}` : ''}`}
                                                </div>
                                            </td>
                                            <td style={{ padding: '12px 16px', color: '#334155', whiteSpace: 'nowrap' }} title={a.detail}>{a.summary}</td>
                                            <td style={{ padding: '12px 16px', color: '#475569', whiteSpace: 'nowrap' }}>
                                                {k.last_used_at ? when(k.last_used_at) : 'Never'}
                                                <div style={{ fontSize: '12px', color: '#94a3b8' }}>{`${Number(k.request_count).toLocaleString()} request${Number(k.request_count) === 1 ? '' : 's'}`}</div>
                                            </td>
                                            <td style={{ padding: '12px 16px' }}>
                                                <span style={{ fontSize: '12px', fontWeight: 600, padding: '3px 10px', borderRadius: '999px', color: s.color, backgroundColor: s.bg }} title={k.revoked_at ? `Revoked ${when(k.revoked_at)}${k.revoked_by && names.get(k.revoked_by) ? ` by ${names.get(k.revoked_by)}` : ''}` : undefined}>{s.text}</span>
                                            </td>
                                            <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                                                {!k.revoked_at && (
                                                    <div style={{ display: 'inline-flex', gap: '6px' }}>
                                                        <button
                                                            type="button"
                                                            onClick={() => copyShare(k)}
                                                            disabled={copyState === 'busy'}
                                                            style={{ ...secondary, color: '#4338ca', borderColor: '#c7d2fe', whiteSpace: 'nowrap' }}
                                                            title={k.copyable ? 'Copy the name, key and API documentation link, to send to the system’s developer' : 'This key isn’t kept: Copy regenerates it first'}
                                                        >
                                                            {copyState === 'done' ? <Check size={14} /> : <Copy size={14} />}
                                                            {copyState === 'busy' ? 'Copying…' : copyState === 'done' ? 'Copied' : 'Copy'}
                                                        </button>
                                                        <button type="button" onClick={() => openManage(k)} style={{ ...secondary, whiteSpace: 'nowrap' }}>
                                                            <Settings2 size={14} /> Manage
                                                        </button>
                                                        <button type="button" onClick={() => setRevoking(k)} style={{ ...secondary, color: '#b91c1c', borderColor: '#fecaca' }}>Revoke</button>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <div className="card-surface" style={card}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap', marginBottom: '14px' }}>
                    <div>
                        <h3 style={{ fontSize: '15px', fontWeight: 600, margin: '0 0 4px' }}>How another system gets access</h3>
                        <p style={{ ...muted, margin: 0 }}>Every system gets a key of its own, so each can be limited, followed and revoked on its own.</p>
                    </div>
                    <a href={DOCS_URL} target="_blank" rel="noopener noreferrer" style={{ ...primary, textDecoration: 'none' }}>
                        <BookOpen size={15} /> Open the API documentation <ExternalLink size={13} />
                    </a>
                </div>
                <ol style={{ margin: '0 0 16px', padding: 0, listStyle: 'none', display: 'grid', gap: '12px' }}>
                    {[
                        ['Create a key here for that system', 'Name it after the system, and tick only the workspaces and boards it needs. A ticked workspace includes everything under it, and boards added to it later. Private (PIN) boards and the Trash are never included. Manage changes that later.'],
                        ['Send it to its developer, privately', 'Copy puts the key’s name, the key and the documentation link in one message. They keep the key on that system’s server; browsers can’t call the API, so it can’t end up in a web page.'],
                        ['The system reads with it', `It sends the key in the Authorization header of a GET request to ${BASE_URL}. It can read, never change; at most 120 requests a minute. Each request shows up in this key’s Last used.`],
                        ['Revoke it when it’s no longer needed', 'Revoke stops the key at once. A system that still uses it gets 401 until it is given a new key.'],
                    ].map(([title, text], i) => (
                        <li key={title} style={{ display: 'grid', gridTemplateColumns: '28px minmax(0, 1fr)', gap: '12px', alignItems: 'start' }}>
                            <span style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: '#eef2ff', color: '#4f46e5', display: 'grid', placeItems: 'center', fontSize: '13px', fontWeight: 700 }}>{i + 1}</span>
                            <div>
                                <div style={{ fontSize: '14px', fontWeight: 600, color: '#0f172a', marginBottom: '2px' }}>{title}</div>
                                <div style={{ fontSize: '13.5px', color: '#64748b', lineHeight: 1.55 }}>{text}</div>
                            </div>
                        </li>
                    ))}
                </ol>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <code style={{ ...code, flex: '1 1 420px', padding: '10px 12px', wordBreak: 'break-all' }}>{curl}</code>
                    <CopyButton text={curl} />
                </div>
            </div>

            <ConfirmModal
                isOpen={!!revoking}
                title="Revoke this API key?"
                message={revoking ? `“${revoking.name}” stops working at once, for good. Any system still using it gets “401 unauthorized” until it is given a new key.` : ''}
                confirmText="Revoke key"
                variant="danger"
                onConfirm={() => revoking && revoke(revoking)}
                onCancel={() => setRevoking(null)}
            />
            <ConfirmModal
                isOpen={!!regenCopy}
                title="Regenerate this key to copy it?"
                message={regenCopy ? `“${regenCopy.name}” was made before keys could be copied again, so its key isn’t kept anywhere. Regenerating gives it a new key and copies it with the documentation link; the key it has now stops working at once${regenCopy.request_count > 0 ? `, and the system using it (${Number(regenCopy.request_count).toLocaleString()} requests so far) will need the new one` : ' (it has never been used)'}.` : ''}
                confirmText="Regenerate and copy"
                onConfirm={() => regenCopy && regenerateAndCopy(regenCopy)}
                onCancel={() => setRegenCopy(null)}
            />
            <ConfirmModal
                isOpen={!!rotating}
                title="Regenerate this API key?"
                message={rotating ? `“${rotating.name}” gets a new key, and the one it has now stops working at once. The system using it needs the new key — you can copy it straight after.` : ''}
                confirmText="Regenerate key"
                variant="danger"
                onConfirm={() => rotating && rotate(rotating)}
                onCancel={() => setRotating(null)}
            />
        </div>
    );
};
