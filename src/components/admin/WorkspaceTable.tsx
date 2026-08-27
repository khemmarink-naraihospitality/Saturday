import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Search, RefreshCw, ExternalLink, Users, Trash2 } from 'lucide-react';
import { useUserStore } from '../../store/useUserStore';
import { useBoardStore } from '../../store/useBoardStore';
import { slugify } from '../../lib/utils';
import { AdminWorkspaceMembersModal } from './AdminWorkspaceMembersModal';
import { AdminDeleteWorkspaceModal } from './AdminDeleteWorkspaceModal';

interface WorkspaceMemberSummary {
    id: string;
    full_name: string | null;
    email: string | null;
    avatar_url: string | null;
}

interface WorkspaceRow {
    id: string;
    title: string;
    created_at: string;
    owner_id: string;
    owner_name: string;
    owner_email: string;
    members: WorkspaceMemberSummary[];
}

export const WorkspaceTable = () => {
    const { currentUser } = useUserStore();
    const canDelete = currentUser.system_role === 'super_admin';
    const [workspaces, setWorkspaces] = useState<WorkspaceRow[]>([]);
    const [filteredWorkspaces, setFilteredWorkspaces] = useState<WorkspaceRow[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [managingWorkspace, setManagingWorkspace] = useState<{ id: string; title: string; ownerId: string } | null>(null);
    const [deletingWorkspace, setDeletingWorkspace] = useState<{ id: string; title: string } | null>(null);

    const fetchWorkspaces = async () => {
        setLoading(true);
        setError(null);
        try {
            // Fetch workspaces with owner info
            const { data, error: fetchError } = await supabase
                .from('workspaces')
                .select(`
                    id,
                    title,
                    created_at,
                    owner_id,
                    profiles!workspaces_owner_id_fkey (
                        full_name,
                        email
                    )
                `)
                .order('created_at', { ascending: false });

            if (fetchError) throw fetchError;

            const workspaceIds = (data || []).map((ws: any) => ws.id);
            const membersByWorkspace: Record<string, WorkspaceMemberSummary[]> = {};
            if (workspaceIds.length > 0) {
                const { data: memberRows } = await supabase
                    .from('workspace_members')
                    .select('workspace_id, profiles(id, full_name, email, avatar_url)')
                    .in('workspace_id', workspaceIds);

                (memberRows || []).forEach((row: any) => {
                    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
                    if (!profile) return;
                    if (!membersByWorkspace[row.workspace_id]) membersByWorkspace[row.workspace_id] = [];
                    membersByWorkspace[row.workspace_id].push(profile);
                });
            }

            const mapped: WorkspaceRow[] = (data || []).map((ws: any) => {
                let members = membersByWorkspace[ws.id] || [];
                // The owner doesn't always have a workspace_members row — surface them
                // in the summary too so the count/avatars match the manage-members modal.
                if (ws.owner_id && !members.some(m => m.id === ws.owner_id)) {
                    members = [{
                        id: ws.owner_id,
                        full_name: ws.profiles?.full_name || null,
                        email: ws.profiles?.email || null,
                        avatar_url: null
                    }, ...members];
                }
                return {
                    id: ws.id,
                    title: ws.title,
                    created_at: ws.created_at,
                    owner_id: ws.owner_id,
                    owner_name: ws.profiles?.full_name || 'Unknown',
                    owner_email: ws.profiles?.email || 'N/A',
                    members
                };
            });

            setWorkspaces(mapped);
            setFilteredWorkspaces(mapped);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleConfirmDelete = async () => {
        if (!deletingWorkspace) return;
        const { id, title } = deletingWorkspace;
        await supabase.from('workspaces').delete().eq('id', id);
        await useBoardStore.getState().logActivity('workspace_deleted', 'workspace', id, { workspace_title: title });
        setWorkspaces(prev => prev.filter(w => w.id !== id));
        setFilteredWorkspaces(prev => prev.filter(w => w.id !== id));
        setDeletingWorkspace(null);
    };

    useEffect(() => {
        fetchWorkspaces();
    }, []);

    useEffect(() => {
        if (!searchQuery.trim()) {
            setFilteredWorkspaces(workspaces);
        } else {
            const query = searchQuery.toLowerCase();
            setFilteredWorkspaces(
                workspaces.filter(ws =>
                    ws.title.toLowerCase().includes(query) ||
                    ws.owner_name.toLowerCase().includes(query) ||
                    ws.owner_email.toLowerCase().includes(query)
                )
            );
        }
    }, [searchQuery, workspaces]);

    return (
        <div style={{ backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                    <Search size={18} color="#64748b" />
                    <input
                        type="text"
                        placeholder="Search workspaces..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={{
                            border: 'none',
                            outline: 'none',
                            fontSize: '14px',
                            flex: 1,
                            color: '#0f172a'
                        }}
                    />
                </div>
                <button
                    onClick={fetchWorkspaces}
                    style={{
                        padding: '6px 12px',
                        backgroundColor: '#f1f5f9',
                        border: '1px solid #e2e8f0',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '13px',
                        color: '#475569'
                    }}
                >
                    <RefreshCw size={14} />
                    Refresh
                </button>
            </div>

            {/* Table */}
            {loading ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>Loading workspaces...</div>
            ) : error ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#ef4444' }}>Error: {error}</div>
            ) : (
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                <th style={{ padding: '12px 20px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Workspace</th>
                                <th style={{ padding: '12px 20px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Owner</th>
                                <th style={{ padding: '12px 20px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Members</th>
                                <th style={{ padding: '12px 20px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Created</th>
                                <th style={{ padding: '12px 20px', textAlign: 'right', fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredWorkspaces.length === 0 ? (
                                <tr>
                                    <td colSpan={5} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                                        No workspaces found
                                    </td>
                                </tr>
                            ) : (
                                filteredWorkspaces.map((ws) => (
                                    <tr key={ws.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                        <td style={{ padding: '16px 20px' }}>
                                            <div style={{ fontWeight: 500, color: '#0f172a', fontSize: '14px' }}>{ws.title}</div>
                                        </td>
                                        <td style={{ padding: '16px 20px' }}>
                                            <div style={{ fontSize: '14px', color: '#0f172a' }}>{ws.owner_name}</div>
                                            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{ws.owner_email}</div>
                                        </td>
                                        <td style={{ padding: '16px 20px' }}>
                                            <button
                                                onClick={() => setManagingWorkspace({ id: ws.id, title: ws.title, ownerId: ws.owner_id })}
                                                title="Manage members"
                                                style={{
                                                    background: 'none',
                                                    border: 'none',
                                                    padding: 0,
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '8px'
                                                }}
                                            >
                                                {ws.members.length === 0 ? (
                                                    <span style={{
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '6px',
                                                        fontSize: '13px',
                                                        color: '#94a3b8'
                                                    }}>
                                                        <Users size={14} />
                                                        No members
                                                    </span>
                                                ) : (
                                                    <>
                                                        <div style={{ display: 'flex' }}>
                                                            {ws.members.slice(0, 4).map((member, idx) => (
                                                                <div
                                                                    key={member.id}
                                                                    title={member.full_name || member.email || ''}
                                                                    style={{
                                                                        width: '26px',
                                                                        height: '26px',
                                                                        borderRadius: '50%',
                                                                        backgroundColor: member.avatar_url ? 'transparent' : '#6366f1',
                                                                        color: 'white',
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        justifyContent: 'center',
                                                                        fontSize: '11px',
                                                                        fontWeight: 600,
                                                                        overflow: 'hidden',
                                                                        border: '2px solid white',
                                                                        marginLeft: idx === 0 ? 0 : '-8px',
                                                                        flexShrink: 0
                                                                    }}
                                                                >
                                                                    {member.avatar_url ? (
                                                                        <img
                                                                            src={member.avatar_url}
                                                                            alt=""
                                                                            referrerPolicy="no-referrer"
                                                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                                        />
                                                                    ) : (
                                                                        (member.full_name?.[0] || member.email?.[0] || '?').toUpperCase()
                                                                    )}
                                                                </div>
                                                            ))}
                                                        </div>
                                                        {ws.members.length > 4 && (
                                                            <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 500 }}>
                                                                +{ws.members.length - 4}
                                                            </span>
                                                        )}
                                                        <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                                                            ({ws.members.length})
                                                        </span>
                                                    </>
                                                )}
                                            </button>
                                        </td>
                                        <td style={{ padding: '16px 20px', fontSize: '14px', color: '#64748b' }}>
                                            {new Date(ws.created_at).toLocaleDateString()}
                                        </td>
                                        <td style={{ padding: '16px 20px', textAlign: 'right' }}>
                                            <button
                                                onClick={() => {
                                                    const username = slugify(currentUser.name || 'u');
                                                    const wsName = slugify(ws.title);
                                                    const url = `/${username}/${wsName}`;
                                                    window.open(url, '_blank');
                                                }}
                                                style={{
                                                    padding: '6px 12px',
                                                    backgroundColor: '#f1f5f9',
                                                    border: '1px solid #cbd5e1',
                                                    borderRadius: '6px',
                                                    cursor: 'pointer',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '6px',
                                                    fontSize: '13px',
                                                    fontWeight: 500,
                                                    color: '#334155',
                                                    transition: 'all 0.2s'
                                                }}
                                                onMouseEnter={(e) => {
                                                    e.currentTarget.style.backgroundColor = '#e2e8f0';
                                                    e.currentTarget.style.color = '#0f172a';
                                                }}
                                                onMouseLeave={(e) => {
                                                    e.currentTarget.style.backgroundColor = '#f1f5f9';
                                                    e.currentTarget.style.color = '#334155';
                                                }}
                                            >
                                                <ExternalLink size={14} />
                                                Access
                                            </button>
                                            <button
                                                onClick={() => canDelete && setDeletingWorkspace({ id: ws.id, title: ws.title })}
                                                disabled={!canDelete}
                                                title={canDelete ? 'Delete workspace' : 'Only Super Admin can delete'}
                                                style={{
                                                    marginLeft: '8px',
                                                    padding: '6px 12px',
                                                    backgroundColor: canDelete ? '#fef2f2' : '#f8fafc',
                                                    border: canDelete ? '1px solid #fecaca' : '1px solid #e2e8f0',
                                                    borderRadius: '6px',
                                                    cursor: canDelete ? 'pointer' : 'not-allowed',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '6px',
                                                    fontSize: '13px',
                                                    fontWeight: 500,
                                                    color: canDelete ? '#dc2626' : '#94a3b8',
                                                    transition: 'all 0.2s'
                                                }}
                                                onMouseEnter={(e) => {
                                                    if (!canDelete) return;
                                                    e.currentTarget.style.backgroundColor = '#fee2e2';
                                                }}
                                                onMouseLeave={(e) => {
                                                    if (!canDelete) return;
                                                    e.currentTarget.style.backgroundColor = '#fef2f2';
                                                }}
                                            >
                                                <Trash2 size={14} />
                                                Delete
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {managingWorkspace && (
                <AdminWorkspaceMembersModal
                    workspaceId={managingWorkspace.id}
                    workspaceTitle={managingWorkspace.title}
                    ownerId={managingWorkspace.ownerId}
                    onClose={() => setManagingWorkspace(null)}
                    onMembersChanged={fetchWorkspaces}
                />
            )}

            {deletingWorkspace && (
                <AdminDeleteWorkspaceModal
                    workspaceTitle={deletingWorkspace.title}
                    onCancel={() => setDeletingWorkspace(null)}
                    onConfirm={handleConfirmDelete}
                />
            )}
        </div>
    );
};
