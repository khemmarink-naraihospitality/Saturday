import { createPortal } from 'react-dom';
import { Lock } from 'lucide-react';

interface PermissionDeniedModalProps {
    isOpen: boolean;
    title?: string;
    message: string;
    onClose: () => void;
}

// A small "you can't do that" popup for actions blocked by role — e.g. a
// guest trying to rename a workspace they don't own. Distinct from
// ConfirmModal (which asks the user to confirm an action they're allowed to
// take) since there's nothing to confirm here, just one way out.
export const PermissionDeniedModal = ({ isOpen, title = "Can't do that", message, onClose }: PermissionDeniedModalProps) => {
    if (!isOpen) return null;

    return createPortal(
        <div onClick={onClose} style={{
            position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000
        }}>
            <div onClick={(e) => e.stopPropagation()} style={{
                backgroundColor: 'hsl(var(--color-bg-surface))', borderRadius: '12px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.2)', width: '90%', maxWidth: '360px',
                padding: '28px 24px', textAlign: 'center'
            }}>
                <div style={{
                    width: '44px', height: '44px', borderRadius: '50%', margin: '0 auto 14px',
                    backgroundColor: 'hsl(var(--color-danger-bg))',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                    <Lock size={20} color="hsl(var(--color-danger))" />
                </div>
                <div style={{ fontWeight: 700, fontSize: '16px', marginBottom: '6px', color: 'hsl(var(--color-text-primary))' }}>
                    {title}
                </div>
                <div style={{ fontSize: '13px', color: 'hsl(var(--color-text-secondary))', lineHeight: 1.5, marginBottom: '22px' }}>
                    {message}
                </div>
                <button
                    onClick={onClose}
                    style={{
                        width: '100%', padding: '10px', borderRadius: '6px', border: 'none',
                        backgroundColor: 'hsl(var(--color-brand-primary))', color: '#ffffff',
                        fontWeight: 600, fontSize: '14px', cursor: 'pointer'
                    }}
                >
                    Got it
                </button>
            </div>
        </div>,
        document.body
    );
};
