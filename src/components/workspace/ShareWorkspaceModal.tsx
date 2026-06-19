import { X, AlertTriangle } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useBoardStore } from '../../store/useBoardStore';
import { InviteMemberForm } from './InviteMemberForm';
import { MembersList } from './MembersList';
import { useAuth } from '../../contexts/AuthContext';
import { showToast } from '../../utils/toast';

interface ShareWorkspaceModalProps {
    workspaceId: string;
    onClose: () => void;
}

export const ShareWorkspaceModal = ({ workspaceId, onClose }: ShareWorkspaceModalProps) => {
    const { user } = useAuth();
    const {
        workspaces,
        inviteToWorkspace,
        getWorkspaceMembers,
        updateMemberRole,
        removeMember,
        transferWorkspaceOwnership
    } = useBoardStore();

    const [members, setMembers] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [pendingTransfer, setPendingTransfer] = useState<{ memberId: string; userId: string; name: string } | null>(null);
    const [isTransferring, setIsTransferring] = useState(false);

    const workspace = workspaces.find(w => w.id === workspaceId);
    const isOwner = workspace?.owner_id === user?.id;

    // Get current user's role
    const currentUserMember = members.find(m => m.user_id === user?.id);
    const currentUserRole = isOwner ? 'owner' : (currentUserMember?.role || 'viewer');

    useEffect(() => {
        loadMembers();
    }, [workspaceId]);

    const loadMembers = async () => {
        setIsLoading(true);
        const data = await getWorkspaceMembers(workspaceId);
        setMembers(data);
        setIsLoading(false);
    };

    const handleInvite = async (email: string, role: string) => {
        await inviteToWorkspace(workspaceId, email, role);
        await loadMembers();
        alert('Invitation sent!');
    };

    const handleRoleChange = async (memberId: string, newRole: string) => {
        if (newRole === 'owner') {
            const target = members.find(m => m.id === memberId);
            if (!target) return;
            const targetProfile = Array.isArray(target.profiles) ? target.profiles[0] : target.profiles;
            const targetName = targetProfile?.full_name || targetProfile?.email || 'this member';
            // Stage the transfer — actually changing the owner happens from the confirm panel below,
            // not immediately, so a misclick on the dropdown can't transfer ownership by itself.
            setPendingTransfer({ memberId, userId: target.user_id, name: targetName });
            return;
        }
        await updateMemberRole(memberId, newRole, 'workspace');
        await loadMembers();
    };

    const confirmTransfer = async () => {
        if (!pendingTransfer) return;
        setIsTransferring(true);
        try {
            await transferWorkspaceOwnership(workspaceId, pendingTransfer.userId);
            showToast(`Ownership transferred to ${pendingTransfer.name}`, 'success');
        } catch (err: any) {
            showToast(err?.message || 'Failed to transfer ownership', 'error');
        } finally {
            setIsTransferring(false);
            setPendingTransfer(null);
            await loadMembers();
        }
    };

    const handleRemove = async (memberId: string) => {
        if (confirm('Are you sure you want to remove this member?')) {
            await removeMember(memberId, 'workspace');
            await loadMembers();
        }
    };

    return (
        <>
            {/* Backdrop */}
            <div
                onClick={onClose}
                style={{
                    position: 'fixed',
                    inset: 0,
                    backgroundColor: 'rgba(0,0,0,0.5)',
                    zIndex: 9998
                }}
            />

            {/* Modal */}
            <div style={{
                position: 'fixed',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                backgroundColor: 'white',
                borderRadius: '8px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
                width: '90%',
                maxWidth: '600px',
                maxHeight: '80vh',
                display: 'flex',
                flexDirection: 'column',
                zIndex: 9999,
                overflow: 'hidden'
            }}>
                {/* Header */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '20px 24px',
                    borderBottom: '1px solid hsl(var(--color-border))'
                }}>
                    <div>
                        <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '4px' }}>
                            Share Workspace
                        </h2>
                        <p style={{ fontSize: '13px', color: 'hsl(var(--color-text-tertiary))' }}>
                            {workspace?.title}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            padding: '8px',
                            border: 'none',
                            backgroundColor: 'transparent',
                            cursor: 'pointer',
                            borderRadius: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-hover))'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Transfer Ownership confirm panel */}
                {pendingTransfer && (
                    <div style={{
                        margin: '16px 24px 0',
                        padding: '14px 16px',
                        backgroundColor: '#fff8e1',
                        border: '1px solid #f0c040',
                        borderRadius: '8px',
                        display: 'flex',
                        gap: '12px'
                    }}>
                        <AlertTriangle size={18} style={{ color: '#b45309', flexShrink: 0, marginTop: '2px' }} />
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '4px' }}>
                                Transfer ownership to {pendingTransfer.name}?
                            </div>
                            <div style={{ fontSize: '13px', color: 'hsl(var(--color-text-secondary))', marginBottom: '12px' }}>
                                You will become a Workspace - Member and lose owner permissions for "{workspace?.title}".
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button
                                    onClick={confirmTransfer}
                                    disabled={isTransferring}
                                    style={{
                                        padding: '7px 14px', borderRadius: '6px', border: 'none',
                                        backgroundColor: '#b45309', color: 'white', fontSize: '13px', fontWeight: 600,
                                        cursor: isTransferring ? 'not-allowed' : 'pointer', opacity: isTransferring ? 0.6 : 1
                                    }}
                                >
                                    {isTransferring ? 'Transferring…' : 'Confirm Transfer'}
                                </button>
                                <button
                                    onClick={() => setPendingTransfer(null)}
                                    disabled={isTransferring}
                                    style={{
                                        padding: '7px 14px', borderRadius: '6px',
                                        border: '1px solid hsl(var(--color-border))', backgroundColor: 'white',
                                        fontSize: '13px', fontWeight: 500, cursor: isTransferring ? 'not-allowed' : 'pointer'
                                    }}
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Invite Form */}
                {(isOwner || currentUserRole === 'admin') && (
                    <InviteMemberForm onInvite={handleInvite} type="workspace" />
                )}

                {/* Members List */}
                <div style={{
                    flex: 1,
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column'
                }}>
                    <div style={{
                        padding: '16px 24px',
                        fontWeight: 600,
                        fontSize: '14px',
                        borderBottom: '1px solid hsl(var(--color-border))'
                    }}>
                        Members ({members.length})
                    </div>

                    {isLoading ? (
                        <div style={{
                            padding: '32px',
                            textAlign: 'center',
                            color: 'hsl(var(--color-text-tertiary))'
                        }}>
                            Loading members...
                        </div>
                    ) : (
                        <MembersList
                            members={members}
                            ownerId={workspace?.owner_id}
                            currentUserRole={currentUserRole}
                            onRoleChange={handleRoleChange}
                            onRemove={handleRemove}
                            type="workspace"
                        />
                    )}
                </div>
                
                {/* Footer */}
                <div style={{
                    padding: '16px 24px',
                    borderTop: '1px solid hsl(var(--color-border))',
                    display: 'flex',
                    justifyContent: 'flex-end',
                    backgroundColor: 'white',
                    marginTop: 'auto'
                }}>
                    <button
                        onClick={onClose}
                        style={{
                            padding: '8px 24px',
                            backgroundColor: '#4f46e5',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            transition: 'opacity 0.2s',
                            fontSize: '14px'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.opacity = '0.9'}
                        onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
                    >
                        Done
                    </button>
                </div>
            </div>
        </>
    );
};
