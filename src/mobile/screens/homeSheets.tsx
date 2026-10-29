import { useEffect, useMemo, useState } from 'react';
import { Check, FolderPlus, LayoutGrid, Search, X } from 'lucide-react';
import { useBoardStore } from '../../store/useBoardStore';
import { useUserStore } from '../../store/useUserStore';
import { useAccessibleWorkspaces } from '../../hooks/useAccessibleWorkspaces';
import { BottomSheet, PrimaryButton, WorkspaceBadge, mobileToast } from '../ui';
import { openBoard, openWorkspace } from '../nav/navigation';
import { afterSheetClose } from '../nav/history';
import { ActionRow, BoardRow, WorkspaceRow } from './parts';
import { canCreateBoardIn, canInviteTo, liveBoards, workspacePath } from './data';

import { useTerms } from '../../lib/terms';
/** Search every board and workspace the user can open. Empty query: recent boards. */
export const SearchSheet = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
    const t = useTerms();
    const [query, setQuery] = useState('');
    const boards = useBoardStore(state => state.boards);
    const workspaces = useBoardStore(state => state.workspaces);
    const sharedBoardIds = useBoardStore(state => state.sharedBoardIds);
    const accessible = useAccessibleWorkspaces();

    useEffect(() => {
        if (!open) setQuery('');
    }, [open]);

    const q = query.trim().toLowerCase();
    const boardResults = useMemo(() => {
        const live = liveBoards(boards);
        if (!q) {
            return live
                .filter(b => b.lastViewedAt)
                .sort((a, b) => (b.lastViewedAt || '').localeCompare(a.lastViewedAt || ''))
                .slice(0, 12);
        }
        return live.filter(b => b.title.toLowerCase().includes(q)).slice(0, 40);
    }, [boards, q]);
    const workspaceResults = useMemo(
        () => (q ? accessible.filter(w => w.title.toLowerCase().includes(q)).slice(0, 20) : []),
        [accessible, q]
    );

    const go = (fn: () => void) => {
        onClose();
        afterSheetClose(fn);
    };

    return (
        <BottomSheet open={open} onClose={onClose} title="Search" size="tall" testId="m-search-sheet">
            <div className="m-sheet-section" style={{ paddingTop: 14 }}>
                <label className="m-field">
                    <Search size={18} />
                    <input
                        autoFocus
                        type="search"
                        enterKeyHint="search"
                        placeholder={`Search ${t.boards} and ${t.workspaces}`}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        aria-label={`Search ${t.boards} and ${t.workspaces}`}
                    />
                    {query && (
                        <button type="button" aria-label="Clear search" onClick={() => setQuery('')} style={{ display: 'flex' }}>
                            <X size={18} />
                        </button>
                    )}
                </label>
            </div>

            {workspaceResults.length > 0 && (
                <>
                    <div className="m-section-label">Workspaces</div>
                    <div style={{ padding: '0 20px' }}>
                        {workspaceResults.map(w => (
                            <WorkspaceRow
                                key={w.id}
                                workspace={w}
                                meta={w.parentId ? workspacePath(w.id, workspaces) : undefined}
                                onOpen={() => go(() => openWorkspace(w.id))}
                            />
                        ))}
                    </div>
                </>
            )}

            <div className="m-section-label">{q ? 'Boards' : 'Recently visited'}</div>
            <div style={{ padding: '0 20px 24px' }}>
                {boardResults.map(board => (
                    <BoardRow
                        key={board.id}
                        board={board}
                        workspaces={workspaces}
                        shared={sharedBoardIds.includes(board.id)}
                        onOpen={() => go(() => openBoard(board.id))}
                    />
                ))}
                {boardResults.length === 0 && workspaceResults.length === 0 && (
                    <div className="m-empty">{q ? `Nothing matches “${query.trim()}”.` : 'Boards you open show up here.'}</div>
                )}
            </div>
        </BottomSheet>
    );
};

/** A list of workspaces to choose one from, the chosen one ticked. */
const WorkspacePicker = ({ options, value, onChange }: {
    options: { id: string; title: string; path: string }[];
    value: string | null;
    onChange: (id: string) => void;
}) => {
    const t = useTerms();
    return (
    <div role="radiogroup" aria-label={t.Workspace} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {options.map(option => {
            const selected = option.id === value;
            return (
                <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => onChange(option.id)}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        minHeight: 52,
                        padding: '6px 14px',
                        borderRadius: 14,
                        textAlign: 'left',
                        background: selected ? 'hsl(var(--m-accent-soft))' : 'hsl(var(--m-chip))',
                        boxShadow: selected ? 'inset 0 0 0 2px hsl(var(--m-accent))' : undefined,
                    }}
                >
                    <WorkspaceBadge title={option.title} size={28} />
                    <span className="m-truncate" style={{ flex: 1, fontSize: 16 }}>{option.path}</span>
                    {selected && <Check size={20} color="hsl(var(--m-accent))" />}
                </button>
            );
        })}
    </div>
    );
};

type CreateStep = 'menu' | 'board' | 'workspace';

/**
 * The Home "+" button: a new board (in a workspace the user may add boards to)
 * or a new workspace. `initialWorkspaceId` preselects a workspace and skips the
 * menu (the workspace screen's own "+").
 */
export const CreateSheet = ({ open, onClose, initialWorkspaceId }: {
    open: boolean;
    onClose: () => void;
    initialWorkspaceId?: string;
}) => {
    const t = useTerms();
    const workspaces = useBoardStore(state => state.workspaces);
    const userWorkspaceRoles = useBoardStore(state => state.userWorkspaceRoles);
    const activeWorkspaceId = useBoardStore(state => state.activeWorkspaceId);
    const addBoard = useBoardStore(state => state.addBoard);
    const addWorkspace = useBoardStore(state => state.addWorkspace);
    const setActiveWorkspace = useBoardStore(state => state.setActiveWorkspace);
    const user = useUserStore(state => state.currentUser);
    const accessible = useAccessibleWorkspaces();

    const [step, setStep] = useState<CreateStep>(initialWorkspaceId ? 'board' : 'menu');
    const [name, setName] = useState('');
    const [workspaceId, setWorkspaceId] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const boardTargets = useMemo(() => accessible
        .filter(w => canCreateBoardIn({ workspace: w, userId: user?.id, userWorkspaceRoles, systemRole: user?.system_role }))
        .map(w => ({ id: w.id, title: w.title, path: workspacePath(w.id, workspaces) })),
    [accessible, user?.id, user?.system_role, userWorkspaceRoles, workspaces]);

    useEffect(() => {
        if (!open) return;
        setStep(initialWorkspaceId ? 'board' : 'menu');
        setName('');
        setBusy(false);
        const preferred = [initialWorkspaceId, activeWorkspaceId].find(id => id && boardTargets.some(t => t.id === id));
        setWorkspaceId(preferred || boardTargets[0]?.id || null);
        // Only when it opens; the targets list refreshing must not reset a choice.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, initialWorkspaceId]);

    const create = async () => {
        const title = name.trim();
        if (!title || busy) return;
        setBusy(true);
        try {
            if (step === 'board' && workspaceId) {
                setActiveWorkspace(workspaceId);
                await addBoard(title);
                const newBoardId = useBoardStore.getState().activeBoardId;
                onClose();
                if (newBoardId) afterSheetClose(() => openBoard(newBoardId));
            } else if (step === 'workspace') {
                await addWorkspace(title);
                const newWorkspaceId = useBoardStore.getState().activeWorkspaceId;
                onClose();
                if (newWorkspaceId) afterSheetClose(() => openWorkspace(newWorkspaceId));
            }
        } catch (err) {
            console.error('[Mobile] create failed', err);
            mobileToast('That could not be created. Please try again.', 'error');
            setBusy(false);
        }
    };

    const title = step === 'menu' ? 'Create' : step === 'board' ? `New ${t.board}` : `New ${t.workspace}`;
    const canSubmit = !!name.trim() && !busy && (step === 'workspace' || !!workspaceId);

    return (
        <BottomSheet
            open={open}
            onClose={onClose}
            title={title}
            headerRight={step === 'menu' ? undefined : (
                <PrimaryButton onClick={create} disabled={!canSubmit} style={{ minHeight: 38, padding: '0 16px', fontSize: 15 }}>
                    {busy ? 'Creating…' : 'Create'}
                </PrimaryButton>
            )}
        >
            {step === 'menu' ? (
                <div style={{ padding: '8px 0 16px' }}>
                    <ActionRow
                        icon={<LayoutGrid size={20} />}
                        label={`New ${t.board}`}
                        disabled={boardTargets.length === 0}
                        onClick={() => setStep('board')}
                    />
                    <ActionRow icon={<FolderPlus size={20} />} label={`New ${t.workspace}`} onClick={() => setStep('workspace')} />
                    {boardTargets.length === 0 && (
                        <div style={{ padding: '4px 20px 0', fontSize: 13, color: 'hsl(var(--m-text-3))' }}>
                            {`You can't add ${t.boards} to any of your ${t.workspaces}.`}
                        </div>
                    )}
                </div>
            ) : (
                <div className="m-sheet-section" style={{ paddingTop: 16, paddingBottom: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <label className="m-field">
                        <input
                            autoFocus
                            type="text"
                            enterKeyHint="done"
                            placeholder={step === 'board' ? `${t.Board} name` : `${t.Workspace} name`}
                            value={name}
                            maxLength={120}
                            onChange={(e) => setName(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') void create(); }}
                            aria-label={step === 'board' ? `${t.Board} name` : `${t.Workspace} name`}
                        />
                    </label>
                    {step === 'board' && (
                        <>
                            <div style={{ fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'hsl(var(--m-text-3))' }}>
                                {t.Workspace}
                            </div>
                            <WorkspacePicker options={boardTargets} value={workspaceId} onChange={setWorkspaceId} />
                        </>
                    )}
                </div>
            )}
        </BottomSheet>
    );
};

/** Invite someone to a workspace the user owns or administers. */
export const InviteSheet = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
    const t = useTerms();
    const workspaces = useBoardStore(state => state.workspaces);
    const userWorkspaceRoles = useBoardStore(state => state.userWorkspaceRoles);
    const activeWorkspaceId = useBoardStore(state => state.activeWorkspaceId);
    const inviteToWorkspace = useBoardStore(state => state.inviteToWorkspace);
    const user = useUserStore(state => state.currentUser);
    const accessible = useAccessibleWorkspaces();

    const targets = useMemo(() => accessible
        .filter(w => canInviteTo({ workspace: w, userId: user?.id, userWorkspaceRoles, systemRole: user?.system_role }))
        .map(w => ({ id: w.id, title: w.title, path: workspacePath(w.id, workspaces) })),
    [accessible, user?.id, user?.system_role, userWorkspaceRoles, workspaces]);

    const [workspaceId, setWorkspaceId] = useState<string | null>(null);
    const [email, setEmail] = useState('');
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (!open) return;
        setEmail('');
        setBusy(false);
        setWorkspaceId(targets.some(t => t.id === activeWorkspaceId) ? activeWorkspaceId : targets[0]?.id || null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

    const invite = async () => {
        if (!valid || !workspaceId || busy) return;
        setBusy(true);
        try {
            // Workspaces only take members (RoleSelector offers nothing else for them).
            await inviteToWorkspace(workspaceId, email.trim().toLowerCase(), 'member');
            mobileToast(`Invitation sent to ${email.trim()}`, 'success');
            onClose();
        } catch (err) {
            console.error('[Mobile] invite failed', err);
            mobileToast('The invitation could not be sent.', 'error');
            setBusy(false);
        }
    };

    return (
        <BottomSheet
            open={open}
            onClose={onClose}
            title={`Invite to ${t.workspace}`}
            headerRight={(
                <PrimaryButton onClick={invite} disabled={!valid || !workspaceId || busy} style={{ minHeight: 38, padding: '0 16px', fontSize: 15 }}>
                    {busy ? 'Sending…' : 'Invite'}
                </PrimaryButton>
            )}
        >
            <div className="m-sheet-section" style={{ paddingTop: 16, paddingBottom: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
                <label className="m-field">
                    <input
                        autoFocus
                        type="email"
                        inputMode="email"
                        autoCapitalize="none"
                        autoCorrect="off"
                        enterKeyHint="send"
                        placeholder="name@company.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') void invite(); }}
                        aria-label="Email address"
                    />
                </label>
                <div style={{ fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'hsl(var(--m-text-3))' }}>
                    {t.Workspace}
                </div>
                <WorkspacePicker options={targets} value={workspaceId} onChange={setWorkspaceId} />
            </div>
        </BottomSheet>
    );
};

/** Whether the current user may invite anyone anywhere (the Home button hides otherwise). */
export const useCanInviteAnywhere = () => {
    const userWorkspaceRoles = useBoardStore(state => state.userWorkspaceRoles);
    const user = useUserStore(state => state.currentUser);
    const accessible = useAccessibleWorkspaces();
    return useMemo(
        () => accessible.some(w => canInviteTo({ workspace: w, userId: user?.id, userWorkspaceRoles, systemRole: user?.system_role })),
        [accessible, user?.id, user?.system_role, userWorkspaceRoles]
    );
};
