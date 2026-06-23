import { useEffect, useState } from 'react';
import { Lock } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { usePermission } from '../../hooks/usePermission';
import { PinDigitInput } from './PinDigitInput';
import { PinResetModal } from './PinResetModal';
import { markBoardUnlocked } from '../../lib/boardPinUnlock';

interface PinLockScreenProps {
    boardId: string;
    boardTitle: string;
    onUnlocked: () => void;
}

export const PinLockScreen = ({ boardId, boardTitle, onUnlocked }: PinLockScreenProps) => {
    const { user } = useAuth();
    const { role } = usePermission();
    const isOwner = role === 'owner';

    const [pin, setPin] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lockedUntilMs, setLockedUntilMs] = useState<number | null>(null);
    const [remainingSeconds, setRemainingSeconds] = useState(0);
    const [showResetModal, setShowResetModal] = useState(false);

    useEffect(() => {
        if (!lockedUntilMs) return;
        const tick = () => {
            const secs = Math.max(0, Math.ceil((lockedUntilMs - Date.now()) / 1000));
            setRemainingSeconds(secs);
            if (secs === 0) setLockedUntilMs(null);
        };
        tick();
        const interval = setInterval(tick, 1000);
        return () => clearInterval(interval);
    }, [lockedUntilMs]);

    const submitPin = async (candidate: string) => {
        if (isSubmitting || lockedUntilMs) return;
        setIsSubmitting(true);
        setError(null);

        const { data, error: fnError } = await supabase.functions.invoke('board-pin', {
            body: { action: 'verify_pin', boardId, pin: candidate }
        });

        setIsSubmitting(false);

        if (fnError || !data) {
            setError('Something went wrong. Please try again.');
            return;
        }
        if (data.success) {
            markBoardUnlocked(boardId);
            onUnlocked();
            return;
        }
        if (data.locked) {
            setLockedUntilMs(Date.now() + (data.remainingSeconds || 0) * 1000);
            setPin('');
            return;
        }
        setError(
            typeof data.remainingAttempts === 'number'
                ? `Incorrect PIN. ${data.remainingAttempts} attempt${data.remainingAttempts === 1 ? '' : 's'} left.`
                : (data.error || 'Incorrect PIN.')
        );
        setPin('');
    };

    return (
        <div style={{
            position: 'absolute', inset: 0, zIndex: 50,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            backgroundColor: 'hsl(var(--color-bg-canvas))'
        }}>
            <div style={{
                width: '90%', maxWidth: '340px',
                backgroundColor: 'hsl(var(--color-bg-surface))',
                borderRadius: '12px',
                boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
                padding: '28px 24px',
                textAlign: 'center'
            }}>
                <Lock size={28} style={{ marginBottom: '8px', color: 'hsl(var(--color-text-secondary))' }} />
                <div style={{ fontWeight: 700, fontSize: '16px', marginBottom: '4px' }}>{boardTitle}</div>
                <div style={{ fontSize: '13px', color: 'hsl(var(--color-text-secondary))', marginBottom: '20px' }}>
                    This board is private. Enter the 6-digit PIN to continue.
                </div>

                <PinDigitInput
                    value={pin}
                    onChange={setPin}
                    onComplete={submitPin}
                    autoFocus
                    disabled={isSubmitting || !!lockedUntilMs}
                    error={!!error}
                />

                <div style={{ fontSize: '12px', color: '#e11d48', minHeight: '16px', margin: '10px 0' }}>
                    {lockedUntilMs
                        ? `Too many attempts. Try again in ${Math.floor(remainingSeconds / 60)}:${String(remainingSeconds % 60).padStart(2, '0')}.`
                        : error}
                </div>

                <button
                    onClick={() => submitPin(pin)}
                    disabled={isSubmitting || !!lockedUntilMs || pin.length !== 6}
                    className="btn-primary"
                    style={{
                        width: '100%', padding: '10px', borderRadius: '6px',
                        cursor: (isSubmitting || !!lockedUntilMs || pin.length !== 6) ? 'not-allowed' : 'pointer',
                        opacity: (isSubmitting || !!lockedUntilMs || pin.length !== 6) ? 0.7 : 1
                    }}
                >
                    {isSubmitting ? 'Checking...' : 'Unlock'}
                </button>

                {isOwner && (
                    <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid hsl(var(--color-border))' }}>
                        <button
                            onClick={() => setShowResetModal(true)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'hsl(var(--color-brand-primary))', fontSize: '12px' }}
                        >
                            Forgot PIN?
                        </button>
                    </div>
                )}
            </div>

            {showResetModal && (
                <PinResetModal
                    boardId={boardId}
                    ownerEmail={user?.email}
                    onClose={() => setShowResetModal(false)}
                    onResetSuccess={() => {
                        setShowResetModal(false);
                        onUnlocked();
                    }}
                />
            )}
        </div>
    );
};
