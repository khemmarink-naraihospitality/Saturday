import { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface AdminDeleteWorkspaceModalProps {
    workspaceTitle: string;
    onCancel: () => void;
    onConfirm: () => Promise<void>;
}

export const AdminDeleteWorkspaceModal = ({ workspaceTitle, onCancel, onConfirm }: AdminDeleteWorkspaceModalProps) => {
    const [confirmText, setConfirmText] = useState('');
    const [deleting, setDeleting] = useState(false);
    const matches = confirmText === workspaceTitle;

    const handleConfirm = async () => {
        if (!matches) return;
        setDeleting(true);
        await onConfirm();
    };

    return (
        <>
            <div onClick={deleting ? undefined : onCancel} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 9998 }} />
            <div style={{
                position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                backgroundColor: 'white', borderRadius: '10px', boxShadow: '0 12px 32px rgba(0,0,0,0.25)',
                width: '440px', maxWidth: '92vw', zIndex: 9999, overflow: 'hidden'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <AlertTriangle size={20} color="#dc2626" />
                        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#0f172a' }}>Delete workspace</h3>
                    </div>
                    <button onClick={onCancel} disabled={deleting} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748b', display: 'flex' }}>
                        <X size={18} />
                    </button>
                </div>

                <div style={{ padding: '20px' }}>
                    <p style={{ margin: '0 0 12px', fontSize: '13px', color: '#334155', lineHeight: 1.5 }}>
                        This will <strong>permanently delete "{workspaceTitle}"</strong> and everything inside it —
                        all its boards, groups, items, and members. This action cannot be undone and does not go to Trash.
                    </p>
                    <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '6px' }}>
                        Type <strong>{workspaceTitle}</strong> to confirm:
                    </label>
                    <input
                        type="text"
                        value={confirmText}
                        onChange={(e) => setConfirmText(e.target.value)}
                        disabled={deleting}
                        autoFocus
                        style={{
                            width: '100%',
                            padding: '8px 12px',
                            border: '1px solid #cbd5e1',
                            borderRadius: '6px',
                            fontSize: '14px',
                            outline: 'none',
                            boxSizing: 'border-box'
                        }}
                    />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', padding: '14px 20px', borderTop: '1px solid #e2e8f0' }}>
                    <button
                        onClick={onCancel}
                        disabled={deleting}
                        style={{
                            padding: '8px 16px', borderRadius: '6px', border: '1px solid #e2e8f0',
                            background: 'white', cursor: deleting ? 'not-allowed' : 'pointer', fontSize: '13px', color: '#0f172a'
                        }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={!matches || deleting}
                        style={{
                            padding: '8px 16px', borderRadius: '6px', border: 'none',
                            backgroundColor: matches ? '#dc2626' : '#fca5a5', color: 'white',
                            fontSize: '13px', fontWeight: 600,
                            cursor: (!matches || deleting) ? 'not-allowed' : 'pointer'
                        }}
                    >
                        {deleting ? 'Deleting...' : 'Delete permanently'}
                    </button>
                </div>
            </div>
        </>
    );
};
