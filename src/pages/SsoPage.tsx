import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

// /sso — where the NHG portal (nhgspace.com) lands a person with a one-minute
// ticket in the URL fragment (#ticket=...). The fragment is never sent to a
// server or written to a log. This page scrubs it from the address bar at once,
// trades it for a session through the `sso-exchange` Edge Function, and carries
// on to the app. It stands alone: main.tsx renders it instead of the whole app,
// so nothing else reads or changes the session while the exchange runs.

const PORTAL = 'https://nhgspace.com/launch';

type Outcome = { ok: true } | { ok: false; message: string };

const MESSAGES: Record<string, string> = {
    no_account: "You don't have a WorkSpace account yet. Please ask your administrator to add you.",
    pending: 'Your WorkSpace account is waiting for approval.',
    inactive: 'Your WorkSpace account has been deactivated. Please contact the IT Department.',
    invalid_ticket: 'That sign-in link has expired or was already used. Please start again from the portal.',
    not_configured: 'Sign-in from the portal is not set up yet. Please contact the IT Department.',
};
const GENERIC = 'Could not sign you in. Please start again from the portal.';

// React StrictMode runs effects twice in development, and a ticket works once:
// the exchange is memoised so it happens exactly one time per page load.
let attempt: Promise<Outcome> | null = null;

async function exchange(): Promise<Outcome> {
    const ticket = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('ticket');
    window.history.replaceState(null, '', '/sso');
    if (!ticket) return { ok: false, message: MESSAGES.invalid_ticket };

    const { data, error } = await supabase.functions.invoke('sso-exchange', { body: { ticket } });
    if (error || !data?.token_hash) {
        let code = '';
        try {
            const res = (error as { context?: Response } | null)?.context;
            if (res) code = (await res.json())?.code ?? '';
        } catch { /* the message below says enough */ }
        return { ok: false, message: MESSAGES[code] ?? GENERIC };
    }

    const verified = await supabase.auth.verifyOtp({ token_hash: data.token_hash, type: data.type ?? 'magiclink' });
    if (verified.error) return { ok: false, message: GENERIC };
    return { ok: true };
}

export function SsoPage() {
    const [message, setMessage] = useState('');

    useEffect(() => {
        attempt ??= exchange();
        void attempt.then((outcome) => {
            if (outcome.ok) window.location.replace('/');
            else setMessage(outcome.message);
        });
    }, []);

    return (
        <div className="min-h-screen flex items-center justify-center bg-[#FFEFD2] p-4 font-sans text-[#152A00]">
            <div className="w-full max-w-[420px] rounded-2xl bg-white/80 px-8 py-10 text-center shadow-lg">
                {message ? (
                    <>
                        <p role="alert" className="text-[15px] leading-relaxed">{message}</p>
                        <a
                            href={PORTAL}
                            className="mt-6 inline-block rounded-lg bg-[#152A00] px-5 py-3 text-[15px] font-medium text-[#FFEFD2]"
                        >
                            Back to the portal
                        </a>
                    </>
                ) : (
                    <>
                        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-b-2 border-[#152A00]" />
                        <p className="mt-4 text-[15px]">Signing you in to WorkSpace...</p>
                    </>
                )}
            </div>
        </div>
    );
}
