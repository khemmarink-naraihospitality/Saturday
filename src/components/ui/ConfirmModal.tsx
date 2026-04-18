
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface ConfirmModalProps {
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    onCancel: () => void;
    confirmText?: string;
    cancelText?: string;
}

export const ConfirmModal = ({
    isOpen,
    title,
    message,
    onConfirm,
    onCancel,
    confirmText = "Confirm",
    cancelText = "Cancel"
}: ConfirmModalProps) => {
    if (!isOpen) return null;

    return createPortal(
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999
        }}>
            <div style={{
                backgroundColor: 'hsl(var(--color-bg-surface))',
                borderRadius: '8px',
                padding: '24px',
                width: '400px',
                maxWidth: '90vw',
                boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                border: '1px solid hsl(var(--color-border))'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>{title}</h3>
                    <button onClick={onCancel} className="icon-btn">
                        <X size={20} />
                    </button>
                </div>

                <p style={{ marginBottom: '24px', color: 'hsl(var(--color-text-secondary))', lineHeight: '1.5' }}>
                    {message}
                </p>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                    <button
                        onClick={onCancel}
                        style={{
                            padding: '8px 16px',
                            borderRadius: '4px',
                            border: '1px solid hsl(var(--color-border))',
                            background: 'transparent',
                            cursor: 'pointer',
                            color: 'hsl(var(--color-text-primary))'
                        }}
                    >
                        {cancelText}
                    </button>
                    <button
                        className="confirm-btn-primary"
                        onClick={onConfirm}
                        style={{
                            padding: '8px 16px',
                            borderRadius: '4px',
                            backgroundColor: '#9159FF',
                            color: '#ffffff',
                            border: 'none',
                            cursor: 'pointer',
                            fontWeight: 500,
                            boxShadow: '0 2px 4px rgba(145, 89, 255, 0.3)'
                        }}
                    >
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};
