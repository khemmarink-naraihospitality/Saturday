import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { savePendingDeepLink } from '../lib/pendingDeepLink';
import { takeMicrosoftEntry } from '../lib/initialPath';
import { AuthCard, AuthField } from '../components/auth/AuthCard';

// A sign-in the provider or Supabase turned down comes back to the page with
// error_description in the query or the hash. Read it once, and tidy the URL.
const readReturnedAuthError = (): string | null => {
    const fromQuery = new URLSearchParams(window.location.search);
    const fromHash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const message = fromQuery.get('error_description') || fromHash.get('error_description');
    if (!message) return null;
    ['error', 'error_code', 'error_description'].forEach(k => fromQuery.delete(k));
    const rest = fromQuery.toString();
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${rest ? `?${rest}` : ''}`);
    return message.replace(/\+/g, ' ');
};

export const LoginPage = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showEmailLogin, setShowEmailLogin] = useState(false);

    const [showForgotPassword, setShowForgotPassword] = useState(false);
    const [forgotEmail, setForgotEmail] = useState('');
    const [forgotLoading, setForgotLoading] = useState(false);
    const [forgotResult, setForgotResult] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    const handleEmailLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const { error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });
            if (error) throw error;
            // Keep any emailed item link before the URL is reset, so signing in
            // from the link still lands on that item.
            savePendingDeepLink(window.location.search);
            window.history.replaceState(null, '', '/');
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleForgotPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setForgotLoading(true);
        setForgotResult(null);

        try {
            const { data, error: fnError } = await supabase.functions.invoke('invite-user', {
                body: {
                    action: 'forgot_password',
                    email: forgotEmail,
                    redirectTo: `${window.location.origin}/reset-password`
                }
            });

            // On a non-2xx response the SDK throws before parsing the body, so
            // `data` is null and the real error payload only lives on
            // fnError.context (the raw Response) — read it back explicitly to
            // tell a Google-account rejection apart from any other failure.
            let errorBody: any = data;
            if (fnError && (fnError as any).context?.json) {
                try { errorBody = await (fnError as any).context.json(); } catch { /* body already consumed or not JSON */ }
            }

            if (errorBody?.error === 'GOOGLE_ACCOUNT') {
                setForgotResult({ type: 'error', text: 'This account signs in with Google or Microsoft. Please use that sign-in button instead.' });
            } else if (fnError || errorBody?.error) {
                setForgotResult({ type: 'error', text: errorBody?.error || fnError?.message || 'Something went wrong. Please try again.' });
            } else {
                setForgotResult({ type: 'success', text: 'If this email belongs to an internal account, a reset link has been sent.' });
            }
        } catch (err: any) {
            setForgotResult({ type: 'error', text: err.message || 'Something went wrong. Please try again.' });
        } finally {
            setForgotLoading(false);
        }
    };

    const handleMicrosoftLogin = async () => {
        try {
            // As for Google: stash the deep link, come back to the bare origin
            // (it is on the redirect allow-list). Azure must return an email.
            savePendingDeepLink(window.location.search);
            const { error } = await supabase.auth.signInWithOAuth({
                provider: 'azure',
                options: {
                    scopes: 'email',
                    redirectTo: `${window.location.origin}`
                }
            });
            if (error) throw error;
        } catch (err: any) {
            setError(err.message);
        }
    };

    // Opened at /auth/microsoft: go straight to Microsoft. A failed attempt
    // comes back to "/" with an error instead, so this can't loop.
    useEffect(() => {
        const returned = readReturnedAuthError();
        if (returned) {
            setError(returned);
            return;
        }
        if (takeMicrosoftEntry()) void handleMicrosoftLogin();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleGoogleLogin = async () => {
        try {
            // The OAuth round trip returns to the bare origin, so the link has to
            // be stashed before leaving the page. sessionStorage survives it
            // (same tab, same origin); redirectTo is left alone so it keeps
            // matching the allowed-redirect list configured in Supabase.
            savePendingDeepLink(window.location.search);
            const { error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: `${window.location.origin}`
                }
            });
            if (error) throw error;
        } catch (err: any) {
            setError(err.message);
        }
    };

    return (
        <AuthCard title="NHG WorkSpace" subtitle="Login to your WorkSpace">
            {error && <div className="auth-message" role="alert">{error}</div>}

            <button type="button" className="auth-btn auth-btn--secondary" onClick={handleGoogleLogin}>
                <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
                    <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z" />
                    <path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z" />
                    <path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z" />
                    <path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z" />
                </svg>
                Continue with Google
            </button>

            <div className="auth-divider">
                <button
                    type="button"
                    className="auth-link"
                    onClick={() => setShowEmailLogin(!showEmailLogin)}
                    aria-expanded={showEmailLogin}
                >
                    {showEmailLogin ? 'Hide email option' : 'Or sign with other option'}
                </button>
            </div>

            {showEmailLogin && !showForgotPassword && (
                <>
                    {/* Microsoft (Entra ID): under the email option for now, until it is rolled out */}
                    <button type="button" className="auth-btn auth-btn--secondary" onClick={handleMicrosoftLogin}>
                        <svg width="20" height="20" viewBox="0 0 23 23" aria-hidden="true">
                            <path fill="#f35325" d="M1 1h10v10H1z" />
                            <path fill="#81bc06" d="M12 1h10v10H12z" />
                            <path fill="#05a6f0" d="M1 12h10v10H1z" />
                            <path fill="#ffba08" d="M12 12h10v10H12z" />
                        </svg>
                        Continue with Microsoft
                    </button>

                    <form className="auth-form" onSubmit={handleEmailLogin}>
                        <AuthField
                            id="login-email"
                            label="Your Alias Email"
                            type="email"
                            autoComplete="email"
                            placeholder="name@company.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                        />
                        <AuthField
                            id="login-password"
                            label="Password"
                            type="password"
                            autoComplete="current-password"
                            placeholder="Enter your password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                        <div className="auth-row auth-row--end">
                            <button
                                type="button"
                                className="auth-link"
                                onClick={() => {
                                    setForgotEmail(email);
                                    setForgotResult(null);
                                    setShowForgotPassword(true);
                                }}
                            >
                                Forgot your password?
                            </button>
                        </div>
                        <button type="submit" className="auth-btn auth-btn--primary" disabled={loading}>
                            {loading ? 'Processing...' : 'Log In'}
                        </button>
                    </form>

                    <div className="auth-row">
                        <button type="button" className="auth-link" onClick={() => window.open('https://rebrand.ly/nhgcts', '_blank')}>
                            Need an account? Sign Up
                        </button>
                    </div>
                </>
            )}

            {showEmailLogin && showForgotPassword && (
                <>
                    <p className="auth-note">
                        Enter your alias email and we'll send a password reset link. This only works for Internal accounts — Google accounts should sign in with "Continue with Google".
                    </p>
                    <form className="auth-form" onSubmit={handleForgotPassword}>
                        <AuthField
                            id="forgot-email"
                            label="Your Alias Email"
                            type="email"
                            autoComplete="email"
                            placeholder="name@company.com"
                            value={forgotEmail}
                            onChange={(e) => setForgotEmail(e.target.value)}
                            required
                        />
                        {forgotResult && (
                            <div className={`auth-message${forgotResult.type === 'success' ? ' auth-message--ok' : ''}`} role={forgotResult.type === 'success' ? 'status' : 'alert'}>
                                {forgotResult.text}
                            </div>
                        )}
                        <button type="submit" className="auth-btn auth-btn--primary" disabled={forgotLoading}>
                            {forgotLoading ? 'Sending...' : 'Send Reset Link'}
                        </button>
                    </form>

                    <div className="auth-row">
                        <button type="button" className="auth-link" onClick={() => setShowForgotPassword(false)}>
                            Back to login
                        </button>
                    </div>
                </>
            )}
        </AuthCard>
    );
};
