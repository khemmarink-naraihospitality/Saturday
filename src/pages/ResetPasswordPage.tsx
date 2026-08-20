import { useState } from 'react';
import { supabase } from '../lib/supabase';

export const ResetPasswordPage = () => {
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (password.length < 8) {
            setError('Password must be at least 8 characters.');
            return;
        }
        if (password !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }

        setLoading(true);
        try {
            const { error } = await supabase.auth.updateUser({ password });
            if (error) throw error;
            window.history.replaceState(null, '', '/');
            window.location.reload();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
            fontFamily: 'Inter, -apple-system, sans-serif'
        }}>
            <div style={{
                backgroundColor: 'white',
                padding: '48px 40px',
                borderRadius: '16px',
                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
                width: '100%',
                maxWidth: '420px'
            }}>
                <div style={{ marginBottom: '28px', textAlign: 'center' }}>
                    <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 700, color: '#0f172a', letterSpacing: '-0.025em' }}>
                        Reset your password
                    </h1>
                    <p style={{ marginTop: '8px', fontSize: '14px', color: '#64748b' }}>
                        Choose a new password for your account.
                    </p>
                </div>

                {error && (
                    <div style={{
                        backgroundColor: '#fef2f2', color: '#b91c1c', padding: '12px',
                        borderRadius: '8px', marginBottom: '20px', fontSize: '13px', border: '1px solid #fee2e2'
                    }}>
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} style={{ textAlign: 'left' }}>
                    <div style={{ marginBottom: '20px' }}>
                        <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 600, color: '#475569' }}>Reset your password</label>
                        <input
                            type="password"
                            placeholder="At least 8 characters"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            style={{
                                width: '100%', padding: '12px 14px', borderRadius: '8px', border: '1px solid #e2e8f0',
                                fontSize: '15px', outline: 'none', backgroundColor: '#f8fafc', boxSizing: 'border-box'
                            }}
                        />
                    </div>
                    <div style={{ marginBottom: '24px' }}>
                        <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 600, color: '#475569' }}>Confirm Reset password</label>
                        <input
                            type="password"
                            placeholder="Re-enter your password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            required
                            style={{
                                width: '100%', padding: '12px 14px', borderRadius: '8px', border: '1px solid #e2e8f0',
                                fontSize: '15px', outline: 'none', backgroundColor: '#f8fafc', boxSizing: 'border-box'
                            }}
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        style={{
                            width: '100%', padding: '12px', backgroundColor: '#6366f1', color: 'white',
                            border: 'none', borderRadius: '8px', fontSize: '15px', fontWeight: 600,
                            cursor: loading ? 'not-allowed' : 'pointer', boxShadow: '0 4px 6px -1px rgba(99, 102, 241, 0.2)'
                        }}
                    >
                        {loading ? 'Saving...' : 'Reset password & continue'}
                    </button>
                </form>
            </div>
        </div>
    );
};
