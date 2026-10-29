import { useMemo, useState } from 'react';
import { LayoutGrid, Plus, Search, UserPlus } from 'lucide-react';
import './screens.css';
import { useBoardStore } from '../../store/useBoardStore';
import { useUserStore } from '../../store/useUserStore';
import { Avatar, Card, IconButton, MiniBoardArt, PrimaryButton, BottomSheet, greetingFor, relativeTime } from '../ui';
import { openBoard, openDashboard, openTab, openWorkspace, openWorkspaces } from '../nav/navigation';
import { afterSheetClose } from '../nav/history';
import { ArrowButton, BoardRow, Dots, StarButton, WorkspaceRow, usePagedScroll } from './parts';
import { liveBoards, mergeRecents, pagesOf, readWorkspaceVisits, type RecentEntry } from './data';
import { CreateSheet, InviteSheet, SearchSheet, useCanInviteAnywhere } from './homeSheets';
import { DashboardArt } from './art';

import { useTerms } from '../../lib/terms';
/**
 * Home on a phone — reference screenshots 15 and 16: a greeting with search,
 * create and invite buttons, the favourite boards as a swipeable strip, the
 * recently visited boards and workspaces in swipeable pages of three, a way into
 * every workspace, and the workspace dashboard.
 */
export const HomeScreen = () => {
    const t = useTerms();
    const user = useUserStore(state => state.currentUser);
    const boards = useBoardStore(state => state.boards);
    const workspaces = useBoardStore(state => state.workspaces);
    const sharedBoardIds = useBoardStore(state => state.sharedBoardIds);
    const canInvite = useCanInviteAnywhere();

    const [sheet, setSheet] = useState<'search' | 'create' | 'invite' | 'recent' | null>(null);
    const closeSheet = () => setSheet(null);

    const favourites = useMemo(() => liveBoards(boards).filter(b => b.isFavorite), [boards]);
    // Workspace visits live in localStorage; re-read whenever the boards change
    // (i.e. after any navigation), which is often enough for a list of recents.
    const recents = useMemo(
        () => mergeRecents(boards, workspaces, readWorkspaceVisits(user?.id), 9),
        [boards, workspaces, user?.id]
    );

    const avatarUrl = user?.avatar && /^https?:\/\//.test(user.avatar) ? user.avatar : null;

    return (
        <div className="m-screen m-home" data-testid="m-home">
            <div className="m-scroll m-scroll--tabbar">
                <header className="m-home-header">
                    <Avatar name={user?.name || user?.email} src={avatarUrl} size={42} />
                    <div className="m-home-header__text">
                        <span className="m-home-header__greeting">{greetingFor()},</span>
                        <span className="m-home-header__name">{user?.name || user?.email}</span>
                    </div>
                    <IconButton label="Search" className="m-home-header__btn" size={40} onClick={() => setSheet('search')}>
                        <Search size={20} strokeWidth={1.9} />
                    </IconButton>
                    <IconButton label="Create" className="m-home-header__btn" size={40} onClick={() => setSheet('create')}>
                        <Plus size={22} strokeWidth={1.9} />
                    </IconButton>
                    {canInvite && (
                        <IconButton label={`Invite to ${t.workspace}`} className="m-home-header__btn" size={40} onClick={() => setSheet('invite')}>
                            <UserPlus size={20} strokeWidth={1.9} />
                        </IconButton>
                    )}
                </header>

                <div className="m-home-cards">
                    <FavoritesCard favourites={favourites} />
                    <RecentCard recents={recents} onSeeAll={() => setSheet('recent')} />

                    <Card>
                        <button type="button" className="m-ws-entry" onClick={openWorkspaces}>
                            <span className="m-ws-entry__icon"><LayoutGrid size={21} strokeWidth={2} /></span>
                            <span className="m-ws-entry__label">{t.Workspaces}</span>
                            <ArrowButton label={`All ${t.workspaces}`} onClick={openWorkspaces} />
                        </button>
                    </Card>

                    <Card className="m-glance">
                        <div className="m-glance__title">Dashboard at a glance</div>
                        <div className="m-glance__sub">A quick snapshot of your key insights</div>
                        <div className="m-glance__art"><DashboardArt /></div>
                        <PrimaryButton onClick={() => openDashboard()}>Open dashboard</PrimaryButton>
                    </Card>
                </div>
            </div>

            <SearchSheet open={sheet === 'search'} onClose={closeSheet} />
            <CreateSheet open={sheet === 'create'} onClose={closeSheet} />
            <InviteSheet open={sheet === 'invite'} onClose={closeSheet} />
            <BottomSheet open={sheet === 'recent'} onClose={closeSheet} title="Recently visited" size="tall">
                <div style={{ padding: '0 20px 24px' }}>
                    {recents.map(entry => (
                        <RecentRow key={`${entry.kind}:${entry.id}`} entry={entry} workspaces={workspaces} sharedBoardIds={sharedBoardIds} onPicked={closeSheet} viaSheet />
                    ))}
                </div>
            </BottomSheet>
        </div>
    );
};

/** "My favorites": a blue card with the favourite boards as a centred, snapping strip. */
const FavoritesCard = ({ favourites }: { favourites: ReturnType<typeof liveBoards> }) => {
    const t = useTerms();
    const workspaces = useBoardStore(state => state.workspaces);
    const { ref, page, onScroll } = usePagedScroll(favourites.length);

    return (
        <section className="m-fav" aria-label="My favorites">
            <div className="m-fav__head">
                <h2 className="m-fav__title">My favorites</h2>
                <ArrowButton label="All favorites" onClick={() => openTab('favorites')} />
            </div>
            {favourites.length === 0 ? (
                <div className="m-fav__empty">{`Star a ${t.board} and it will be pinned here.`}</div>
            ) : (
                <>
                    <div className="m-fav__track" ref={ref} onScroll={onScroll}>
                        {favourites.map(board => (
                            <div
                                key={board.id}
                                className="m-fav-card m-press"
                                role="button"
                                tabIndex={0}
                                onClick={() => openBoard(board.id)}
                                onKeyDown={(e) => { if (e.key === 'Enter') openBoard(board.id); }}
                                aria-label={`Open ${board.title}`}
                            >
                                <div className="m-fav-card__art"><MiniBoardArt width={168} /></div>
                                <div className="m-fav-card__foot">
                                    <div className="m-fav-card__text">
                                        <div className="m-fav-card__name">{board.title}</div>
                                        <div className="m-fav-card__ws">{workspaces.find(w => w.id === board.workspaceId)?.title || ''}</div>
                                    </div>
                                    <StarButton board={board} />
                                </div>
                            </div>
                        ))}
                    </div>
                    <Dots count={favourites.length} active={page} label="Favorites" />
                </>
            )}
        </section>
    );
};

/** "Recently visited": pages of three rows that snap sideways, the next page peeking in. */
const RecentCard = ({ recents, onSeeAll }: { recents: RecentEntry[]; onSeeAll: () => void }) => {
    const t = useTerms();
    const workspaces = useBoardStore(state => state.workspaces);
    const sharedBoardIds = useBoardStore(state => state.sharedBoardIds);
    const pages = useMemo(() => pagesOf(recents, 3), [recents]);
    const { ref, page, onScroll } = usePagedScroll(pages.length);

    return (
        <Card className="m-recent" testId="m-recent">
            <div className="m-recent__head">
                <h2 className="m-recent__title">Recently visited</h2>
                <ArrowButton label="All recently visited" onClick={onSeeAll} />
            </div>
            {recents.length === 0 ? (
                <div className="m-empty" style={{ padding: '24px 22px 12px' }}>{`${t.Boards} and ${t.workspaces} you open show up here.`}</div>
            ) : (
                <>
                    <div className="m-recent__pages" ref={ref} onScroll={onScroll}>
                        {pages.map((entries, index) => (
                            <div key={index} className="m-recent__page" style={pages.length === 1 ? { flexBasis: '100%' } : undefined}>
                                {entries.map(entry => (
                                    <RecentRow key={`${entry.kind}:${entry.id}`} entry={entry} workspaces={workspaces} sharedBoardIds={sharedBoardIds} />
                                ))}
                            </div>
                        ))}
                    </div>
                    <Dots count={pages.length} active={page} label="Recently visited" />
                </>
            )}
        </Card>
    );
};

const RecentRow = ({ entry, workspaces, sharedBoardIds, onPicked, viaSheet = false }: {
    entry: RecentEntry;
    workspaces: ReturnType<typeof useBoardStore.getState>['workspaces'];
    sharedBoardIds: string[];
    onPicked?: () => void;
    viaSheet?: boolean;
}) => {
    const open = (fn: () => void) => {
        if (viaSheet && onPicked) {
            onPicked();
            afterSheetClose(fn);
        } else {
            fn();
        }
    };

    if (entry.kind === 'workspace') {
        return (
            <WorkspaceRow
                workspace={entry.workspace}
                meta={`Visited ${relativeTime(entry.at)}`}
                onOpen={() => open(() => openWorkspace(entry.workspace.id))}
            />
        );
    }
    const board = entry.board;
    return (
        <BoardRow
            board={board}
            workspaces={workspaces}
            shared={sharedBoardIds.includes(board.id)}
            onOpen={() => open(() => openBoard(board.id))}
            showStar={!!board.isFavorite}
        />
    );
};
