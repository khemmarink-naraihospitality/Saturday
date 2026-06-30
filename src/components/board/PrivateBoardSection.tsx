import { useState, useEffect } from 'react';
import { Lock } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useBoardStore } from '../../store/useBoardStore';
import type { ToastType } from '../ui/Toast';
import { PinDigitInput } from './PinDigitInput';

interface PrivateBoardSectionProps {
    boardId: string;
    isPrivate: boolean;
    showToast: (message: string, type?: ToastType) => void;
}

export const PrivateBoardSection = ({ boardId, isPrivate, showToast }: PrivateBoardSectionProps) => {
    const [pendingPrivate, setPendingPrivate] = useState(isPrivate);
    const [pin, setPin] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [pinFocusKey, setPinFocusKey] = useState(0);

    // Stay in sync with the saved value — after a successful save, after the
    // modal is reopened for a different board, or if it's force-disabled
    // elsewhere while open.
    useEffect(() => {
        setPendingPrivate(isPrivate);
        setPin('');
    }, [isPrivate, boardId]);

    const setBoardIsPrivateLocally = (value: boolean) => {
        useBoardStore.setState(state => ({
            boards: state.boards.map(b => b.id === boardId ? { ...b, is_private: value } : b)
        }));
    };

    const handleToggle = () => {
        if (isSaving) return;
        setPendingPrivate(v => {
            const next = !v;
            if (next) {
                setPin('');
                setPinFocusKey(k => k + 1);
            }
            return next;
        });
    };

    const handleSave = async () => {
        if (!pendingPrivate) {
            // Turning off — no PIN needed to confirm.
            setIsSaving(true);
            const { data, error } = await supabase.functions.invoke('board-pin', {
                body: { action: 'set_pin', boardId, enable: false }
            });
            setIsSaving(false);
            if (error || data?.error) {
                showToast(data?.error || error?.message || 'Failed to disable Private Board.', 'error');
                return;
            }
            setBoardIsPrivateLocally(false);
            showToast('Private Board disabled.', 'success');
            return;
        }

        // Turning on (or changing the PIN while already on) requires a full PIN.
        if (pin.length !== 6) return;
        setIsSaving(true);
        const { data, error } = await supabase.functions.invoke('board-pin', {
            body: { action: 'set_pin', boardId, enable: true, pin }
        });
        setIsSaving(false);
        if (error || data?.error) {
            showToast(data?.error || error?.message || 'Failed to save the PIN.', 'error');
            return;
        }
        setBoardIsPrivateLocally(true);
        setPin('');
        showToast('PIN saved. This board is now private.', 'success');
    };

    const showPinForm = pendingPrivate;
    const isNewlyEnabling = pendingPrivate && !isPrivate;
    // Nothing to save when off->off, or on->on with no new PIN typed.
    const canSave = pendingPrivate ? pin.length === 6 : pendingPrivate !== isPrivate;

    return (
        <div style={{ padding: '14px 20px', borderBottom: '1px solid hsl(var(--color-border))', backgroundColor: 'hsl(var(--color-bg-hover))' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                    <div style={{ fontWeight: 600, fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Lock size={14} color="hsl(var(--color-text-secondary))" />
                        Private Board
                        <span style={{ fontSize: '11px', backgroundColor: 'hsl(var(--color-brand-light))', color: 'hsl(var(--color-brand-primary))', padding: '2px 6px', borderRadius: '10px' }}>
                            Owner only
                        </span>
                    </div>
                    <div style={{ fontSize: '12px', color: 'hsl(var(--color-text-tertiary))', marginTop: '2px' }}>
                        Requires a 6-digit PIN before anyone (including you) can open this board, once per login session.
                    </div>
                </div>
                <button
                    role="switch"
                    aria-checked={pendingPrivate}
                    onClick={handleToggle}
                    disabled={isSaving}
                    style={{
                        width: '40px', height: '22px', borderRadius: '12px', border: 'none', position: 'relative',
                        backgroundColor: pendingPrivate ? 'hsl(var(--color-brand-primary))' : 'hsl(var(--color-border))',
                        cursor: isSaving ? 'not-allowed' : 'pointer', flexShrink: 0, padding: 0
                    }}
                >
                    <span style={{
                        position: 'absolute', top: '2px', left: pendingPrivate ? '20px' : '2px',
                        width: '18px', height: '18px', borderRadius: '50%', backgroundColor: 'white',
                        transition: 'left 0.15s'
                    }} />
                </button>
            </div>

            {showPinForm && (
                <div style={{ marginTop: '12px', padding: '12px', backgroundColor: 'hsl(var(--color-bg-surface))', border: '1px solid hsl(var(--color-border))', borderRadius: '6px' }}>
                    <div style={{ fontSize: '12px', color: 'hsl(var(--color-text-secondary))', marginBottom: '8px', textAlign: 'left' }}>
                        {isNewlyEnabling ? 'Set a 6-digit PIN to enable' : 'Enter a new 6-digit PIN to change it (optional)'}
                    </div>
                    <PinDigitInput key={pinFocusKey} value={pin} onChange={setPin} disabled={isSaving} autoFocus={pinFocusKey > 0} />
                </div>
            )}

            {(showPinForm || pendingPrivate !== isPrivate) && (
                <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                        onClick={handleSave}
                        disabled={isSaving || !canSave}
                        style={{
                            padding: '8px 20px', borderRadius: '6px', border: 'none',
                            backgroundColor: '#4f46e5', color: 'white', fontWeight: 600, fontSize: '14px',
                            cursor: (isSaving || !canSave) ? 'not-allowed' : 'pointer',
                            opacity: (isSaving || !canSave) ? 0.6 : 1
                        }}
                    >
                        {isSaving ? 'Saving...' : 'Save'}
                    </button>
                </div>
            )}
        </div>
    );
};
