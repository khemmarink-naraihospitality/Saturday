import { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import './screens.css';
import { useBoardStore } from '../../store/useBoardStore';
import { useAccessibleWorkspaces } from '../../hooks/useAccessibleWorkspaces';
import { Card, ScreenHeader, EmptyState } from '../ui';
import { backToHome, openWorkspace } from '../nav/navigation';
import { WorkspaceRow } from './parts';
import { liveBoards, orderedWorkspaceTree } from './data';

/** Every workspace the user can see, sub-workspaces under their parent. */
export const WorkspacesScreen = () => {
    const boards = useBoardStore(state => state.boards);
    const accessible = useAccessibleWorkspaces();
    const [query, setQuery] = useState('');

    const boardCounts = useMemo(() => {
        const counts = new Map<string, number>();
        liveBoards(boards).forEach(b => {
            if (b.workspaceId) counts.set(b.workspaceId, (counts.get(b.workspaceId) || 0) + 1);
        });
        return counts;
    }, [boards]);

    const q = query.trim().toLowerCase();
    const rows = useMemo(() => {
        const tree = orderedWorkspaceTree(accessible);
        return q ? tree.filter(({ workspace }) => workspace.title.toLowerCase().includes(q)).map(r => ({ ...r, depth: 0 })) : tree;
    }, [accessible, q]);

    return (
        <div className="m-screen" data-testid="m-workspaces">
            <ScreenHeader title="Workspaces" onBack={backToHome} />
            <div className="m-scroll" style={{ padding: '0 16px 32px' }}>
                <label className="m-field" style={{ background: 'hsl(var(--m-card))', boxShadow: 'var(--m-shadow-card)', marginBottom: 14 }}>
                    <Search size={18} />
                    <input
                        type="search"
                        placeholder="Search workspaces"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        aria-label="Search workspaces"
                    />
                    {query && (
                        <button type="button" aria-label="Clear search" onClick={() => setQuery('')} style={{ display: 'flex' }}>
                            <X size={18} />
                        </button>
                    )}
                </label>
                <Card style={{ padding: '4px 16px' }}>
                    {rows.map(({ workspace, depth }) => {
                        const count = boardCounts.get(workspace.id) || 0;
                        return (
                            <WorkspaceRow
                                key={workspace.id}
                                workspace={workspace}
                                indent={depth}
                                meta={`${count} board${count === 1 ? '' : 's'}`}
                                onOpen={() => openWorkspace(workspace.id)}
                            />
                        );
                    })}
                    {rows.length === 0 && (
                        <EmptyState>{q ? `No workspace matches “${query.trim()}”.` : 'You are not in any workspace yet.'}</EmptyState>
                    )}
                </Card>
            </div>
        </div>
    );
};
