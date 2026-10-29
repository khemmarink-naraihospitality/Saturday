import { useEffect, useMemo, useState } from 'react';
import { Link2, MoreHorizontal, PencilLine, PieChart, Plus } from 'lucide-react';
import './screens.css';
import { useBoardStore } from '../../store/useBoardStore';
import { useUserStore } from '../../store/useUserStore';
import { slugify } from '../../lib/utils';
import { AvatarStack, Avatar, BottomSheet, Card, DashboardGlyph, IconButton, PrimaryButton, ScreenHeader, EmptyState, mobileToast, personFromMember, type PersonInfo } from '../ui';
import { backToHome, openBoard, openDashboard } from '../nav/navigation';
import { afterSheetClose } from '../nav/history';
import { ActionRow, BoardRow } from './parts';
import { canCreateBoardIn, liveBoards, recordWorkspaceVisit, workspaceFamily, workspaceRole } from './data';
import { CreateSheet } from './homeSheets';

import { useTerms } from '../../lib/terms';
const FIRST_PAGE = 6;

/**
 * A workspace's own screen — reference screenshot 17: its boards (and those of
 * its sub-workspaces) under "Content", its dashboard, and who is in it.
 */
export const WorkspaceScreen = () => {
    const t = useTerms();
    const workspaceId = useBoardStore(state => state.activeWorkspaceId);
    const workspace = useBoardStore(state => state.workspaces.find(w => w.id === state.activeWorkspaceId));
    const workspaces = useBoardStore(state => state.workspaces);
    const boards = useBoardStore(state => state.boards);
    const sharedBoardIds = useBoardStore(state => state.sharedBoardIds);
    const userWorkspaceRoles = useBoardStore(state => state.userWorkspaceRoles);
    const getWorkspaceMembers = useBoardStore(state => state.getWorkspaceMembers);
    const renameWorkspace = useBoardStore(state => state.renameWorkspace);
    const user = useUserStore(state => state.currentUser);

    const [showAll, setShowAll] = useState(false);
    const [members, setMembers] = useState<(PersonInfo & { role: string })[] | null>(null);
    const [sheet, setSheet] = useState<'create' | 'actions' | 'members' | 'rename' | null>(null);
    const [newTitle, setNewTitle] = useState('');

    useEffect(() => {
        if (workspaceId) recordWorkspaceVisit(user?.id, workspaceId);
        setShowAll(false);
    }, [workspaceId, user?.id]);

    useEffect(() => {
        if (!workspaceId) return;
        let cancelled = false;
        setMembers(null);
        getWorkspaceMembers(workspaceId)
            .then(rows => {
                if (cancelled) return;
                const people: (PersonInfo & { role: string })[] = [];
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                rows.forEach((row: any) => {
                    const person = personFromMember(row);
                    if (person && !people.some(p => p.id === person.id)) people.push({ ...person, role: row.role || 'member' });
                });
                setMembers(people);
            })
            .catch(err => {
                console.error('[Mobile] workspace members failed', err);
                if (!cancelled) setMembers([]);
            });
        return () => { cancelled = true; };
    }, [workspaceId, getWorkspaceMembers]);

    const contentBoards = useMemo(() => {
        if (!workspaceId) return [];
        const family = workspaceFamily(workspaceId, workspaces);
        return liveBoards(boards).filter(b => b.workspaceId && family.has(b.workspaceId));
    }, [boards, workspaces, workspaceId]);

    const roleInput = { workspace, userId: user?.id, userWorkspaceRoles, systemRole: user?.system_role };
    const canAddBoard = canCreateBoardIn(roleInput);
    const role = workspaceRole(roleInput);
    const canRename = role === 'owner' || role === 'admin' || user?.system_role === 'super_admin' || user?.system_role === 'it_admin';

    if (!workspace) {
        return (
            <div className="m-screen" data-testid="m-workspace">
                <ScreenHeader title={t.Workspace} onBack={backToHome} />
                <EmptyState title={`${t.Workspace} not found`}>It may have been deleted, or you no longer have access.</EmptyState>
            </div>
        );
    }

    const shown = showAll ? contentBoards : contentBoards.slice(0, FIRST_PAGE);
    const workspaceLink = `${window.location.origin}/${slugify(user?.name || 'u')}/${slugify(workspace.title)}`;

    const copyLink = async () => {
        try {
            await navigator.clipboard.writeText(workspaceLink);
            mobileToast('Link copied');
        } catch {
            mobileToast(workspaceLink);
        }
    };

    const saveRename = async () => {
        const title = newTitle.trim();
        if (!title || title === workspace.title) {
            setSheet(null);
            return;
        }
        try {
            await renameWorkspace(workspace.id, title);
            setSheet(null);
        } catch (err) {
            console.error('[Mobile] rename workspace failed', err);
            mobileToast(`The ${t.workspace} could not be renamed.`, 'error');
        }
    };

    return (
        <div className="m-screen" data-testid="m-workspace">
            <ScreenHeader
                title={workspace.title}
                onBack={backToHome}
                actions={(
                    <>
                        {canAddBoard && (
                            <IconButton label={`New ${t.board}`} size={40} onClick={() => setSheet('create')}>
                                <Plus size={22} strokeWidth={1.9} />
                            </IconButton>
                        )}
                        <IconButton label={`${t.Workspace} actions`} size={40} onClick={() => setSheet('actions')}>
                            <MoreHorizontal size={22} strokeWidth={1.9} />
                        </IconButton>
                    </>
                )}
            />

            <div className="m-scroll">
                <div className="m-ws-cards">
                    <Card className="m-ws-content" testId="m-ws-content">
                        <div className="m-ws-content__head">
                            <h2 className="m-ws-content__title">Content</h2>
                            {contentBoards.length > FIRST_PAGE && (
                                <button type="button" className="m-text-btn" onClick={() => setShowAll(v => !v)}>
                                    {showAll ? 'Show less' : 'See all'}
                                </button>
                            )}
                        </div>

                        {shown.map(board => (
                            <BoardRow
                                key={board.id}
                                board={board}
                                workspaces={workspaces}
                                shared={sharedBoardIds.includes(board.id)}
                                onOpen={() => openBoard(board.id)}
                            />
                        ))}

                        <div className="m-row" role="button" tabIndex={0} onClick={() => openDashboard(workspace.id)} onKeyDown={(e) => { if (e.key === 'Enter') openDashboard(workspace.id); }}>
                            <span className="m-row__tile"><DashboardGlyph size={30} /></span>
                            <span className="m-row__body">
                                <span className="m-row__title">{workspace.title} Dashboard</span>
                                <span className="m-row__meta">{`Every ${t.board} in this ${t.workspace} at a glance`}</span>
                            </span>
                        </div>

                        {contentBoards.length === 0 && (
                            <EmptyState title={`No ${t.boards} yet`}>
                                {canAddBoard ? `Tap + to add the first ${t.board}.` : `${t.Boards} shared with you will show up here.`}
                            </EmptyState>
                        )}
                    </Card>

                    <Card>
                        <button type="button" className="m-collab" onClick={() => setSheet('members')} aria-label="Collaborators">
                            <span className="m-collab__title">Collaborators</span>
                            {members && members.length > 0 && <AvatarStack people={members} max={5} size={34} />}
                        </button>
                    </Card>
                </div>
            </div>

            <CreateSheet open={sheet === 'create'} onClose={() => setSheet(null)} initialWorkspaceId={workspace.id} />

            <BottomSheet open={sheet === 'actions'} onClose={() => setSheet(null)} title={workspace.title}>
                <div style={{ padding: '8px 0 16px' }}>
                    <ActionRow icon={<PieChart size={20} />} label="Open dashboard" onClick={() => { setSheet(null); afterSheetClose(() => openDashboard(workspace.id)); }} />
                    {canRename && (
                        <ActionRow icon={<PencilLine size={20} />} label={`Rename ${t.workspace}`} onClick={() => { setNewTitle(workspace.title); setSheet('rename'); }} />
                    )}
                    <ActionRow icon={<Link2 size={20} />} label="Copy link" onClick={() => { setSheet(null); void copyLink(); }} />
                </div>
            </BottomSheet>

            <BottomSheet
                open={sheet === 'rename'}
                onClose={() => setSheet(null)}
                title={`Rename ${t.workspace}`}
                headerRight={(
                    <PrimaryButton onClick={saveRename} disabled={!newTitle.trim()} style={{ minHeight: 38, padding: '0 16px', fontSize: 15 }}>Save</PrimaryButton>
                )}
            >
                <div className="m-sheet-section" style={{ padding: '16px 20px 24px' }}>
                    <label className="m-field">
                        <input
                            autoFocus
                            type="text"
                            value={newTitle}
                            maxLength={120}
                            enterKeyHint="done"
                            onChange={(e) => setNewTitle(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') void saveRename(); }}
                            aria-label={`${t.Workspace} name`}
                        />
                    </label>
                </div>
            </BottomSheet>

            <BottomSheet open={sheet === 'members'} onClose={() => setSheet(null)} title="Collaborators" size={members && members.length > 6 ? 'tall' : 'auto'}>
                <div style={{ padding: '4px 20px 24px' }}>
                    {members === null && <div className="m-empty">Loading…</div>}
                    {members?.length === 0 && <div className="m-empty">{`No one has been added to this ${t.workspace} yet.`}</div>}
                    {members?.map(person => (
                        <div key={person.id} className="m-row" style={{ minHeight: 64 }}>
                            <Avatar name={person.name} src={person.avatarUrl} size={40} />
                            <span className="m-row__body">
                                <span className="m-row__title">{person.name}</span>
                                {person.email && <span className="m-row__meta">{person.email}</span>}
                            </span>
                            <span style={{ fontSize: 13, color: 'hsl(var(--m-text-3))', textTransform: 'capitalize' }}>{person.role}</span>
                        </div>
                    ))}
                </div>
            </BottomSheet>
        </div>
    );
};
