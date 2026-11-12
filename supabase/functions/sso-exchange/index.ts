// sso-exchange: turns a one-minute ticket from the NHG portal (nhgspace.com)
// into a Saturday session, so a person who signed in at the portal is not asked
// to sign in again here (12-Nov-2026).
//
// Why a ticket: NHGOne and Saturday are two Supabase projects. A session from one
// means nothing to the other, so the portal (NHGOne's backend, api/app/routers/
// sso.py) vouches for the person with an HS256 JWT signed with a secret only the
// two of them hold, and this function checks it.
//
//   POST { ticket }  ->  { token_hash, type }   the browser then calls
//                                               supabase.auth.verifyOtp(...) itself
//
// What it checks, and why each matters:
//   - the signature, with the shared secret SSO_TICKET_SECRET (a Supabase secret,
//     never in the repo), compared in constant time; only alg HS256 is accepted;
//   - issuer "nhgone" and audience "saturday" (a ticket minted for something
//     else is no use here), a short life (exp, and at most 120 s from iat), and
//     an iat not in the future beyond a little clock skew;
//   - the ticket's jti has not been used (public.sso_ticket_uses): a ticket works
//     ONCE, so one copied from a log or a screen after the person has used it is
//     worthless. If that table is missing the function refuses (fails closed);
//   - the email belongs to an EXISTING, approved, active Saturday profile. It never
//     creates an account: whoever should have one is added the usual way.
//
// It returns only a single-use magic-link token hash for that account. generateLink
// sends no email. The hash is as good as a session for 1 hour or the first use,
// so it is never logged.
//
// Deploy with "Verify JWT" OFF (--no-verify-jwt): the caller has no session yet
// (only the public anon/publishable key), and the ticket is the credential.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ISSUER = "nhgone";
const AUDIENCE = "saturday";
const MAX_LIFETIME_SECONDS = 120;
const CLOCK_SKEW_SECONDS = 30;

const ALLOWED_ORIGINS = new Set([
  "https://work.nhgspace.com",
  "https://saturday.naraihospitalitygroup.com",
  "http://localhost:5173",
]);

const corsFor = (req: Request) => {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "https://work.nhgspace.com",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
};

const json = (req: Request, status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsFor(req), "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const fromB64url = (s: string): Uint8Array => {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

const decodeJson = (s: string) => JSON.parse(new TextDecoder().decode(fromB64url(s)));

type Claims = {
  iss?: string; aud?: string; sub?: string; email?: string;
  iat?: number; exp?: number; jti?: string;
};

/** The ticket's claims if it is genuine and in date; otherwise null. */
async function verifyTicket(ticket: string, secret: string): Promise<Claims | null> {
  const parts = ticket.split(".");
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  try {
    const header = decodeJson(h);
    if (header.alg !== "HS256") return null;

    const key = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"],
    );
    const valid = await crypto.subtle.verify("HMAC", key, fromB64url(s), new TextEncoder().encode(`${h}.${p}`));
    if (!valid) return null;

    const claims: Claims = decodeJson(p);
    const now = Math.floor(Date.now() / 1000);
    if (claims.iss !== ISSUER || claims.aud !== AUDIENCE) return null;
    if (typeof claims.iat !== "number" || typeof claims.exp !== "number") return null;
    if (claims.exp <= now) return null;
    if (claims.iat > now + CLOCK_SKEW_SECONDS) return null;
    if (claims.exp - claims.iat > MAX_LIFETIME_SECONDS) return null;
    if (typeof claims.jti !== "string" || claims.jti.length < 16 || claims.jti.length > 64) return null;
    if (typeof claims.email !== "string" || !claims.email.includes("@")) return null;
    return claims;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsFor(req) });
  if (req.method !== "POST") return json(req, 405, { code: "method_not_allowed" });

  const secret = Deno.env.get("SSO_TICKET_SECRET") ?? "";
  if (secret.length < 32) {
    console.error("sso-exchange: SSO_TICKET_SECRET is not set");
    return json(req, 503, { code: "not_configured" });
  }

  let ticket = "";
  try {
    ticket = String((await req.json()).ticket ?? "");
  } catch {
    return json(req, 400, { code: "bad_request" });
  }
  if (!ticket || ticket.length > 4096) return json(req, 400, { code: "bad_request" });

  const claims = await verifyTicket(ticket, secret);
  if (!claims) return json(req, 401, { code: "invalid_ticket" });
  const email = claims.email!.trim().toLowerCase();

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // A ticket works once. The primary key makes two simultaneous exchanges race
  // safely: exactly one insert wins.
  const used = await admin.from("sso_ticket_uses").insert({ jti: claims.jti, email });
  if (used.error) {
    if (used.error.code === "23505") return json(req, 401, { code: "invalid_ticket" });
    console.error("sso-exchange: could not record the ticket", used.error.message);
    return json(req, 503, { code: "not_configured" });
  }
  // Tidy up old records now and then; they only matter for a minute.
  if (Math.random() < 0.05) {
    await admin.from("sso_ticket_uses").delete().lt("used_at", new Date(Date.now() - 24 * 3600 * 1000).toISOString());
  }

  const { data: profiles, error: profileError } = await admin
    .from("profiles")
    .select("id, email, is_approved, is_active")
    .ilike("email", email.replace(/[\\%_]/g, "\\$&"));
  if (profileError) {
    console.error("sso-exchange: profile lookup failed", profileError.message);
    return json(req, 500, { code: "server_error" });
  }
  const matches = (profiles ?? []).filter((p) => (p.email ?? "").toLowerCase() === email);
  if (matches.length !== 1) return json(req, 403, { code: "no_account" });
  const profile = matches[0];
  if (profile.is_active === false) return json(req, 403, { code: "inactive" });
  if (profile.is_approved !== true) return json(req, 403, { code: "pending" });

  const link = await admin.auth.admin.generateLink({ type: "magiclink", email: profile.email });
  const tokenHash = link.data?.properties?.hashed_token;
  if (link.error || !tokenHash) {
    console.error("sso-exchange: generateLink failed", link.error?.message);
    return json(req, 500, { code: "server_error" });
  }

  console.log(`sso-exchange: signed in ${email}`);
  return json(req, 200, { token_hash: tokenHash, type: "magiclink" });
});
