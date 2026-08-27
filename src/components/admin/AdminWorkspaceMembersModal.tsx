import { X } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useBoardStore } from '../../store/useBoardStore';
import { MembersList } from '../workspace/MembersList';
import { AdminAddMemberForm } from './AdminAddMemberForm';

interface AdminWorkspaceMembersModalProps {
    workspaceId: string;
    workspaceTitle: string;
    ownerId: string;
    onClose: () => void;
    onMembersChanged: () => void;
}

export const AdminWorkspaceMembersModal = ({ workspaceId, workspaceTitle, ownerId, onClose, onMembersChanged }: AdminWorkspaceMembersModalProps) => {
    const { getWorkspaceMembers, updateMemberRole, removeMember, adminAddWorkspaceMember } = useBoardStore();

    const [members, setMembers] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        loadMembers();
    }, [workspaceId]);

    const loadMembers = async () => {
        setIsLoading(true);
        const data = await getWorkspaceMembers(workspaceId);
        setMembers(data);
        setIsLoading(false);
    };

    const handleAdd = async (userId: string, role: string) => {
        await adminAddWorkspaceMember(workspaceId, userId, role);
        await loadMembers();
        onMembersChanged();
    };

    const handleRoleChange = async (memberId: string, newRole: string) => {
        await updateMemberRole(memberId, newRole, 'workspace');
        await loadMembers();
    };

    const handleRemove = async (memberId: string) => {
        await removeMember(memberId, 'workspace');
        await loadMembers();
        onMembersChanged();
    };

    return (
        <>
            <div
                onClick={onClose}
                style={{
                    position: 'fixed',
                    inset: 0,
                    backgroundColor: 'rgba(0,0,0,0.5)',
                    zIndex: 9998
                }}
            />

            <div style={{
                position: 'fixed',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                backgroundColor: 'white',
                borderRadius: '8px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
                width: '90%',
                maxWidth: '700px',
                maxHeight: '80vh',
                display: 'flex',
                flexDirection: 'column',
                zIndex: 9999,
                overflow: 'hidden'
            }}>
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '16px 20px',
                    borderBottom: '1px solid hsl(var(--color-border))'
                }}>
                    <div>
                        <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '4px' }}>
                            Manage Members
                        </h2>
                        <p style={{ fontSize: '13px', color: 'hsl(var(--color-text-tertiary))' }}>
                            {workspaceTitle}
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

                <AdminAddMemberForm onAdd={handleAdd} type="workspace" allowedRoles={['member']} />

                <div style={{
                    flex: 1,
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column'
                }}>
                    <div style={{
                        padding: '12px 20px',
                        fontWeight: 600,
                        fontSize: '14px',
                        borderBottom: '1px solid hsl(var(--color-border))'
                    }}>
                        Workspace Members ({members.length})
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
                            ownerId={ownerId}
                            currentUserRole="owner"
                            onRoleChange={handleRoleChange}
                            onRemove={handleRemove}
                            type="workspace"
                        />
                    )}
                </div>
            </div>
        </>
    );
};
