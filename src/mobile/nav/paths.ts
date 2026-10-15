import { slugify, parseBoardSlugSuffix, shortId } from '../../lib/utils';
import type { Board, Workspace } from '../../types';

/**
 * The board a /user/workspace/board path names — the same rule as MainApp's
 * deep-link resolver: an id suffix wins, else the bare title within the
 * workspace. Live boards only.
 */
export const resolveBoardPath = (parts: string[], boards: Board[], workspaces: Workspace[]): Board | undefined => {
    const [, workspaceSlug, boardSegment] = parts;
    const live = boards.filter(b => !b.is_archived);
    const inWorkspace = (b: Board) =>
        slugify(workspaces.find(w => w.id === b.workspaceId)?.title || '') === workspaceSlug;
    const suffix = parseBoardSlugSuffix(boardSegment);
    return suffix
        ? live.find(b => inWorkspace(b) && shortId(b.id) === suffix)
        : live.find(b => inWorkspace(b) && slugify(b.title) === boardSegment);
};
