import { useState } from 'react';
import { X, Mail, KeyRound } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { PinDigitInput } from './PinDigitInput';
import { markBoardUnlocked } from '../../lib/boardPinUnlock';

interface PinResetModalProps {
    boardId: string;
    ownerEmail?: string | null;
    onClose: () => void;
    onResetSuccess: () => void;
}

export const PinResetModal = ({ boardId, ownerEmail, onClose, onResetSuccess }: PinResetModalProps) => {
    const [step, setStep] = useState<'request' | 'confirm'>('request');
    const [maskedEmail, setMaskedEmail] = useState<string | null>(null);
    const [otp, setOtp] = useState('');
    const [newPin, setNewPin] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const requestOtp = async () => {
        setIsSubmitting(true);
        setError(null);
        const { data, error: fnError } = await supabase.functions.invoke('board-pin', {
            body: { action: 'request_pin_reset_otp', boardId }
        });
        setIsSubmitting(false);
        if (fnError || data?.error) {
            setError(data?.error || fnError?.message || 'Failed to send the reset code.');
            return;
        }
        setMaskedEmail(data?.maskedEmail || ownerEmail || null);
        setStep('confirm');
    };

    const confirmReset = async () => {
        setIsSubmitting(true);
        setError(null);
        const { data, error: fnError } = await supabase.functions.invoke('board-pin', {
            body: { action: 'confirm_pin_reset', boardId, otp, newPin }
        });
        setIsSubmitting(false);
        if (fnError || data?.error) {
            setError(data?.error || fnError?.message || 'Failed to reset the PIN.');
            return;
        }
        markBoardUnlocked(boardId);
        onResetSuccess();
    };

    return (
        <>
            <div onClick={onClose} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 10000 }} />
            <div style={{
                position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                backgroundColor: 'hsl(var(--color-bg-surface))', borderRadius: '12px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.2)', width: '90%', maxWidth: '380px',
                padding: '28px 24px', textAlign: 'center', zIndex: 10001
            }}>
                <button
                    onClick={onClose}
                    style={{ position: 'absolute', top: '12px', right: '12px', background: 'none', border: 'none', cursor: 'pointer', color: 'hsl(var(--color-text-secondary))', display: 'flex' }}
                >
                    <X size={18} />
                </button>

                {step === 'request' ? (
                    <>
                        <Mail size={28} style={{ marginBottom: '8px', color: 'hsl(var(--color-brand-primary))' }} />
                        <div style={{ fontWeight: 700, fontSize: '16px', marginBottom: '4px' }}>Forgot PIN?</div>
                        <div style={{ fontSize: '13px', color: 'hsl(var(--color-text-secondary))', marginBottom: '20px' }}>
                            We'll send a 6-digit reset code to your email{ownerEmail ? <>: <strong>{ownerEmail}</strong></> : '.'}
                        </div>
                        {error && <div style={{ fontSize: '12px', color: '#e11d48', marginBottom: '12px' }}>{error}</div>}
                        <button
                            onClick={requestOtp}
                            disabled={isSubmitting}
                            className="btn-primary"
                            style={{ width: '100%', padding: '10px', borderRadius: '6px', cursor: isSubmitting ? 'not-allowed' : 'pointer', opacity: isSubmitting ? 0.7 : 1 }}
                        >
                            {isSubmitting ? 'Sending...' : 'Send Reset Code'}
                        </button>
                    </>
                ) : (
                    <>
                        <KeyRound size={28} style={{ marginBottom: '8px', color: 'hsl(var(--color-brand-primary))' }} />
                        <div style={{ fontSize: '13px', color: 'hsl(var(--color-text-secondary))', marginBottom: '16px' }}>
                            Enter the code sent to <strong>{maskedEmail}</strong> (expires in 10 minutes)
                        </div>

                        <PinDigitInput value={otp} onChange={setOtp} autoFocus />

                        <div style={{ fontSize: '13px', color: 'hsl(var(--color-text-secondary))', margin: '20px 0 8px', textAlign: 'left' }}>
                            New 6-digit PIN
                        </div>
                        <PinDigitInput value={newPin} onChange={setNewPin} />

                        {error && <div style={{ fontSize: '12px', color: '#e11d48', margin: '12px 0 0' }}>{error}</div>}

                        <button
                            onClick={confirmReset}
                            disabled={isSubmitting || otp.length !== 6 || newPin.length !== 6}
                            className="btn-primary"
                            style={{
                                width: '100%', padding: '10px', borderRadius: '6px', marginTop: '20px',
                                cursor: (isSubmitting || otp.length !== 6 || newPin.length !== 6) ? 'not-allowed' : 'pointer',
                                opacity: (isSubmitting || otp.length !== 6 || newPin.length !== 6) ? 0.7 : 1
                            }}
                        >
                            {isSubmitting ? 'Confirming...' : 'Confirm & Set New PIN'}
                        </button>

                        <button
                            onClick={requestOtp}
                            disabled={isSubmitting}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'hsl(var(--color-brand-primary))', fontSize: '12px', marginTop: '12px' }}
                        >
                            Resend code
                        </button>
                    </>
                )}
            </div>
        </>
    );
};
