import { useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { useUserStore } from '../../store/useUserStore';
import { X, User, Mail, ChevronDown, Lock, Check } from 'lucide-react';

const ROLE_HIERARCHY: Record<string, number> = {
    user: 1,
    it_admin: 2,
    super_admin: 3
};

const ROLE_LABELS: Record<string, string> = {
    user: 'User',
    it_admin: 'IT Admin',
    super_admin: 'Super Admin'
};

const GoogleIcon = () => (
    <svg width="18" height="18" viewBox="0 0 48 48">
        <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z" />
        <path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z" />
        <path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z" />
        <path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z" />
    </svg>
);

interface CreateUserModalProps {
    onClose: () => void;
    onCreated: () => void;
}

export const CreateUserModal = ({ onClose, onCreated }: CreateUserModalProps) => {
    const { currentUser } = useUserStore();
    const callerRole = currentUser.system_role || 'user';

    const assignableRoles = Object.keys(ROLE_HIERARCHY).filter(
        r => callerRole === 'super_admin' || ROLE_HIERARCHY[r] < ROLE_HIERARCHY[callerRole]
    );

    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [role, setRole] = useState(assignableRoles[0] || 'user');
    const [authType, setAuthType] = useState<'google' | 'internal'>('google');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const canSubmit = fullName.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !saving;

    const handleSubmit = async () => {
        if (!canSubmit) return;
        setSaving(true);
        setError('');

        const { data, error: fnError } = await supabase.functions.invoke('admin-create-user', {
            body: {
                email: email.trim(),
                fullName: fullName.trim(),
                role,
                authType,
                redirectOrigin: window.location.origin
            }
        });

        setSaving(false);

        if (fnError || data?.error) {
            setError(data?.error || fnError?.message || 'Failed to create user');
            return;
        }

        await supabase.rpc('log_activity', {
            p_action_type: 'user_created',
            p_target_type: 'user',
            p_target_id: data.userId,
            p_metadata: { email: email.trim(), role, authType }
        });

        onCreated();
        onClose();
    };

    const inputStyle: React.CSSProperties = {
        width: '100%',
        padding: '11px 12px 11px 40px',
        borderRadius: '10px',
        border: '1px solid #333333',
        backgroundColor: '#242424',
        color: '#f4f4f5',
        fontSize: '14px',
        outline: 'none',
        boxSizing: 'border-box'
    };

    const labelStyle: React.CSSProperties = {
        display: 'block',
        fontSize: '12px',
        fontWeight: 600,
        color: '#a1a1aa',
        marginBottom: '8px',
        letterSpacing: '0.02em'
    };

    return createPortal(
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
            <div style={{
                backgroundColor: '#1a1a1a',
                borderRadius: '20px',
                width: '480px',
                maxWidth: '90vw',
                maxHeight: '90vh',
                overflowY: 'auto',
                boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
                border: '1px solid #2a2a2a',
                padding: '32px'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px' }}>
                    <h2 style={{ margin: 0, fontSize: '24px', fontWeight: 500, color: '#f4f4f5', fontFamily: 'Georgia, "Times New Roman", serif' }}>
                        Create a new user
                    </h2>
                    <button
                        onClick={onClose}
                        style={{ background: 'none', border: 'none', color: '#71717a', cursor: 'pointer', padding: '4px', display: 'flex' }}
                    >
                        <X size={20} />
                    </button>
                </div>

                {error && (
                    <div style={{
                        marginBottom: '20px', padding: '10px 14px', borderRadius: '8px', fontSize: '13px',
                        backgroundColor: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.25)'
                    }}>
                        {error}
                    </div>
                )}

                <div style={{ marginBottom: '20px' }}>
                    <label style={labelStyle}>Full Name</label>
                    <div style={{ position: 'relative' }}>
                        <User size={16} color="#71717a" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                        <input
                            type="text"
                            placeholder="Full Name"
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            style={inputStyle}
                        />
                    </div>
                </div>

                <div style={{ marginBottom: '20px' }}>
                    <label style={labelStyle}>Email address</label>
                    <div style={{ position: 'relative' }}>
                        <Mail size={16} color="#71717a" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                        <input
                            type="email"
                            placeholder="user@gmail.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            style={inputStyle}
                        />
                    </div>
                </div>

                <div style={{ marginBottom: '24px' }}>
                    <label style={labelStyle}>Assigned Role</label>
                    <div style={{ position: 'relative' }}>
                        <select
                            value={role}
                            onChange={(e) => setRole(e.target.value)}
                            style={{
                                width: '100%', padding: '11px 36px 11px 14px', borderRadius: '10px', border: '1px solid #333333',
                                backgroundColor: '#242424', color: '#f4f4f5', fontSize: '14px', outline: 'none',
                                appearance: 'none', boxSizing: 'border-box', cursor: 'pointer'
                            }}
                        >
                            {assignableRoles.map(r => (
                                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                            ))}
                        </select>
                        <ChevronDown size={16} color="#71717a" style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                    </div>
                </div>

                <div style={{ marginBottom: '10px' }}>
                    <label style={labelStyle}>User Authentication</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <button
                            type="button"
                            onClick={() => setAuthType('google')}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '10px', padding: '14px',
                                borderRadius: '10px', cursor: 'pointer', textAlign: 'left',
                                border: authType === 'google' ? '1.5px solid #a3a83c' : '1px solid #333333',
                                backgroundColor: authType === 'google' ? 'rgba(163,168,60,0.08)' : '#242424'
                            }}
                        >
                            <GoogleIcon />
                            <div>
                                <div style={{ fontSize: '13px', fontWeight: 600, color: '#f4f4f5' }}>Google</div>
                                <div style={{ fontSize: '11px', color: '#a1a1aa' }}>Authentication</div>
                            </div>
                        </button>
                        <button
                            type="button"
                            onClick={() => setAuthType('internal')}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '10px', padding: '14px',
                                borderRadius: '10px', cursor: 'pointer', textAlign: 'left',
                                border: authType === 'internal' ? '1.5px solid #a3a83c' : '1px solid #333333',
                                backgroundColor: authType === 'internal' ? 'rgba(163,168,60,0.08)' : '#242424'
                            }}
                        >
                            <Lock size={18} color="#a1a1aa" />
                            <div>
                                <div style={{ fontSize: '13px', fontWeight: 600, color: '#f4f4f5' }}>Internal</div>
                                <div style={{ fontSize: '11px', color: '#a1a1aa' }}>Users</div>
                            </div>
                        </button>
                    </div>
                    <p style={{ fontSize: '12px', color: '#71717a', marginTop: '10px', lineHeight: 1.5 }}>
                        {authType === 'google' ? (
                            <>User signs in with <strong style={{ color: '#d4d4d8' }}>Continue with Google</strong> using this email address.</>
                        ) : (
                            <>User gets an email to <strong style={{ color: '#d4d4d8' }}>set their own password</strong>, then signs in with this email and that password.</>
                        )}
                    </p>
                </div>

                <button
                    onClick={handleSubmit}
                    disabled={!canSubmit}
                    style={{
                        width: '100%', marginTop: '18px', padding: '13px', borderRadius: '10px', border: 'none',
                        backgroundColor: '#059669', color: 'white', fontSize: '15px', fontWeight: 600,
                        cursor: canSubmit ? 'pointer' : 'not-allowed', opacity: canSubmit ? 1 : 0.5,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                    }}
                >
                    {saving ? 'Creating...' : (<><Check size={16} /> Create user</>)}
                </button>
            </div>
        </div>,
        document.body
    );
};
