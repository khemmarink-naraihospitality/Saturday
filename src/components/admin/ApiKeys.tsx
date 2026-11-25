import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactElement } from 'react';
import { Check, ChevronDown, ChevronRight, Copy, KeyRound, Lock, Plus, Search, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { ConfirmModal } from '../ui/ConfirmModal';

/*
 * Admin › API Keys: keys for the NHG WorkSpace API (supabase/functions/api),
 * which lets another system read Spaces, tasks and comments. A key reaches the
 * workspaces picked for it (and every workspace under them) and the boards
 * picked for it; it is shown once, when made, since only its hash is kept.
 */

const BASE_URL = 'https://work.nhgspace.com/api/v1';

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
}
interface FolderRow { id: string; title: string; parent_id: string | null; is_archived: boolean }
interface BoardRow { id: string; title: string; workspace_id: string; is_private: boolean; is_archived: boolean }

const EXPIRY: { label: string; days: number | null }[] = [
    { label: 'Never expires', days: null },
    { label: 'Expires in 30 days', days: 30 },
    { label: 'Expires in 90 days', days: 90 },
    { label: 'Expires in 1 year', days: 365 },
];

const ENDPOINTS: [string, string][] = [
    ['GET /api/v1', 'What this key can reach'],
    ['GET /api/v1/folders', 'Workspaces (folders) the key reaches'],
    ['GET /api/v1/spaces', 'Boards (spaces); ?folder_id= for one folder'],
    ['GET /api/v1/spaces/{id}', 'A board with its groups and columns'],
    ['GET /api/v1/spaces/{id}/tasks', 'Its items with values and sub-items, 50 a page: ?cursor=, ?limit= (up to 200), ?updated_since=, ?group_id=, ?include=comments'],
    ['GET /api/v1/tasks/{id}', 'One item (?include=comments)'],
    ['GET /api/v1/tasks/{id}/comments', 'Its updates with their replies'],
];

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
const AccessPicker = ({ folders, boards, chosenFolders, chosenBoards, onFolders, onBoards }: {
    folders: FolderRow[];
    boards: BoardRow[];
    chosenFolders: Set<string>;
    chosenBoards: Set<string>;
    onFolders: (next: Set<string>) => void;
    onBoards: (next: Set<string>) => void;
}) => {
    const [query, setQuery] = useState('');
    const [open, setOpen] = useState<Set<string>>(new Set());
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

export const ApiKeys = () => {
    const [keys, setKeys] = useState<KeyRow[]>([]);
    const [folders, setFolders] = useState<FolderRow[]>([]);
    const [boards, setBoards] = useState<BoardRow[]>([]);
    const [names, setNames] = useState<Map<string, string>>(new Map());
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    const [formOpen, setFormOpen] = useState(false);
    const [name, setName] = useState('');
    const [expiry, setExpiry] = useState<number | null>(null);
    const [chosenFolders, setChosenFolders] = useState<Set<string>>(new Set());
    const [chosenBoards, setChosenBoards] = useState<Set<string>>(new Set());
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [made, setMade] = useState<{ name: string; key: string } | null>(null);
    const [revoking, setRevoking] = useState<KeyRow | null>(null);

    const load = useCallback(async () => {
        setLoadError(null);
        const [k, w, b] = await Promise.all([
            supabase.from('api_keys').select('id, name, key_prefix, workspace_ids, board_ids, created_by, created_at, expires_at, last_used_at, request_count, revoked_at, revoked_by').order('created_at', { ascending: false }),
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

    const resetForm = () => {
        setFormOpen(false);
        setName('');
        setExpiry(null);
        setChosenFolders(new Set());
        setChosenBoards(new Set());
        setFormError(null);
    };

    const create = async () => {
        if (!name.trim()) { setFormError('Give the key a name — say which system will use it.'); return; }
        if (chosenFolders.size + chosenBoards.size === 0) { setFormError('Tick at least one workspace or board the key may read.'); return; }
        setSaving(true);
        setFormError(null);
        const { data, error } = await supabase.rpc('create_api_key', {
            p_name: name.trim(),
            p_workspace_ids: [...chosenFolders],
            p_board_ids: [...chosenBoards],
            p_expires_at: expiry ? new Date(Date.now() + expiry * 86400000).toISOString() : null,
        });
        setSaving(false);
        const row = Array.isArray(data) ? data[0] : null;
        if (error || !row?.api_key) {
            setFormError(error?.message || 'Couldn’t create the key. Try again.');
            return;
        }
        setMade({ name: name.trim(), key: row.api_key });
        resetForm();
        void load();
    };

    const revoke = async (k: KeyRow) => {
        setRevoking(null);
        const { error } = await supabase.rpc('revoke_api_key', { p_id: k.id });
        if (error) setLoadError(`Couldn’t revoke “${k.name}”: ${error.message}`);
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

    return (
        <div style={{ maxWidth: '1000px' }}>
            <div className="card-surface" style={card}>
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
                    {!formOpen && (
                        <button type="button" style={primary} onClick={() => { setMade(null); setFormOpen(true); }}>
                            <Plus size={16} /> Create API key
                        </button>
                    )}
                </div>

                {made && (
                    <div style={{ marginTop: '20px', padding: '16px', borderRadius: '10px', border: '1px solid #bbf7d0', backgroundColor: '#f0fdf4' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '10px' }}>
                            <strong style={{ fontSize: '14px', color: '#166534' }}>{`“${made.name}” is ready. Copy its key now — it won’t be shown again.`}</strong>
                            <button type="button" onClick={() => setMade(null)} aria-label="Done" style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#166534', display: 'flex' }}><X size={16} /></button>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                            <code style={{ ...code, flex: '1 1 380px', padding: '10px 12px', fontSize: '13.5px', backgroundColor: 'white', border: '1px solid #bbf7d0', wordBreak: 'break-all' }}>{made.key}</code>
                            <CopyButton text={made.key} label="Copy key" />
                        </div>
                        <p style={{ ...muted, margin: '10px 0 0', fontSize: '12.5px' }}>
                            Keep it on the server of the system that uses it (an environment variable or a secret store), never in a web page or a shared document. If it leaks, revoke it below and create a new one.
                        </p>
                    </div>
                )}

                {formOpen && (
                    <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid #e2e8f0', display: 'grid', gap: '16px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: '12px' }}>
                            <div>
                                <label style={label} htmlFor="api-key-name">Name</label>
                                <input id="api-key-name" value={name} onChange={e => setName(e.target.value)} maxLength={80} placeholder="e.g. Power Automate — IT requests" style={input} />
                            </div>
                            <div>
                                <label style={label} htmlFor="api-key-expiry">Expiry</label>
                                <select id="api-key-expiry" value={expiry ?? ''} onChange={e => setExpiry(e.target.value ? Number(e.target.value) : null)} style={input}>
                                    {EXPIRY.map(o => <option key={o.label} value={o.days ?? ''}>{o.label}</option>)}
                                </select>
                            </div>
                        </div>
                        <div>
                            <span style={label}>What it may read</span>
                            <p style={{ ...muted, margin: '0 0 8px', fontSize: '12.5px' }}>
                                Tick a workspace to include every board in it and in the workspaces under it, now and later; or tick single boards.
                            </p>
                            <AccessPicker
                                folders={folders}
                                boards={boards}
                                chosenFolders={chosenFolders}
                                chosenBoards={chosenBoards}
                                onFolders={setChosenFolders}
                                onBoards={setChosenBoards}
                            />
                        </div>
                        {formError && <p style={{ margin: 0, color: '#b91c1c', fontSize: '13px' }}>{formError}</p>}
                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                            <button type="button" style={secondary} onClick={resetForm}>Cancel</button>
                            <button type="button" style={{ ...primary, opacity: saving ? 0.7 : 1 }} onClick={create} disabled={saving}>
                                <KeyRound size={15} /> {saving ? 'Creating…' : 'Create key'}
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <div className="card-surface" style={{ ...card, padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '16px 24px', borderBottom: '1px solid #e2e8f0', fontWeight: 600, fontSize: '15px' }}>Keys</div>
                {loadError && <p style={{ margin: 0, padding: '12px 24px', color: '#b91c1c', fontSize: '13px' }}>{loadError}</p>}
                {loading ? (
                    <p style={{ ...muted, padding: '24px', margin: 0 }}>Loading…</p>
                ) : keys.length === 0 ? (
                    <p style={{ ...muted, padding: '24px', margin: 0 }}>No API keys yet. Create one for each system that needs to read from NHG WorkSpace.</p>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px' }}>
                            <thead>
                                <tr style={{ textAlign: 'left', color: '#64748b', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                    {['Name', 'Key', 'Reads', 'Created', 'Last used', 'Status', ''].map(h => <th key={h} style={{ padding: '10px 16px', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>)}
                                </tr>
                            </thead>
                            <tbody>
                                {keys.map(k => {
                                    const s = statusOf(k);
                                    const a = access(k);
                                    return (
                                        <tr key={k.id} style={{ borderTop: '1px solid #f1f5f9', opacity: k.revoked_at ? 0.65 : 1 }}>
                                            <td style={{ padding: '12px 16px', fontWeight: 600, color: '#0f172a' }}>{k.name}</td>
                                            <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}><code style={code}>{k.key_prefix}…</code></td>
                                            <td style={{ padding: '12px 16px', color: '#334155' }} title={a.detail}>{a.summary}</td>
                                            <td style={{ padding: '12px 16px', color: '#475569', whiteSpace: 'nowrap' }}>
                                                {when(k.created_at)}
                                                <div style={{ fontSize: '12px', color: '#94a3b8' }}>{(k.created_by && names.get(k.created_by)) || '—'}{k.expires_at ? ` · until ${new Date(k.expires_at).toLocaleDateString()}` : ''}</div>
                                            </td>
                                            <td style={{ padding: '12px 16px', color: '#475569', whiteSpace: 'nowrap' }}>
                                                {k.last_used_at ? when(k.last_used_at) : 'Never'}
                                                <div style={{ fontSize: '12px', color: '#94a3b8' }}>{`${Number(k.request_count).toLocaleString()} request${Number(k.request_count) === 1 ? '' : 's'}`}</div>
                                            </td>
                                            <td style={{ padding: '12px 16px' }}>
                                                <span style={{ fontSize: '12px', fontWeight: 600, padding: '3px 10px', borderRadius: '999px', color: s.color, backgroundColor: s.bg }} title={k.revoked_at ? `Revoked ${when(k.revoked_at)}${k.revoked_by && names.get(k.revoked_by) ? ` by ${names.get(k.revoked_by)}` : ''}` : undefined}>{s.text}</span>
                                            </td>
                                            <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                                                {!k.revoked_at && (
                                                    <button type="button" onClick={() => setRevoking(k)} style={{ ...secondary, color: '#b91c1c', borderColor: '#fecaca' }}>Revoke</button>
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
                <h3 style={{ fontSize: '15px', fontWeight: 600, margin: '0 0 8px' }}>How another system uses it</h3>
                <p style={{ ...muted, margin: '0 0 12px', lineHeight: 1.55 }}>
                    Send the key in the <code style={code}>Authorization</code> header of a GET request. Answers are JSON. In the API’s words a workspace is a <em>folder</em>, a board a <em>space</em>, a group a <em>group</em>, an item a <em>task</em> (a sub-item is a task with a <code style={code}>parent_id</code>) and an update a <em>comment</em>.
                </p>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '16px' }}>
                    <code style={{ ...code, flex: '1 1 420px', padding: '10px 12px', wordBreak: 'break-all' }}>{curl}</code>
                    <CopyButton text={curl} />
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <tbody>
                        {ENDPOINTS.map(([route, what]) => (
                            <tr key={route} style={{ borderTop: '1px solid #f1f5f9' }}>
                                <td style={{ padding: '8px 12px 8px 0', whiteSpace: 'nowrap', verticalAlign: 'top' }}><code style={code}>{route}</code></td>
                                <td style={{ padding: '8px 0', color: '#475569' }}>{what}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                <p style={{ ...muted, margin: '14px 0 0', fontSize: '12.5px', lineHeight: 1.55 }}>
                    Each task has <code style={code}>values</code> (column title → value, a status as its label, people by name) and <code style={code}>fields</code> (every column with its id, type, full value and text).
                    To keep another system in step, ask for <code style={code}>?updated_since=</code> the time of the last pull — a new update on an item counts as a change. Formula columns’ results aren’t in the API yet.
                    The full reference is <code style={code}>docs/api.md</code> in the repository.
                </p>
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
        </div>
    );
};
