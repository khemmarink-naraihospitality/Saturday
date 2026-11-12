-- Single sign-on from the NHG portal (nhgspace.com), 12-Nov-2026.
--
-- The `sso-exchange` Edge Function accepts a one-minute ticket from the portal
-- and gives back a Saturday session. A ticket must work ONCE, so each ticket's
-- id (jti) is recorded here and a second use is refused (primary key conflict).
--
-- RLS: ENABLED with NO policies, on purpose. Only the Edge Function's service role
-- reads or writes this table; no browser should ever touch it. (Supabase's default
-- is RLS off, which would make the table readable with the public anon key.)

CREATE TABLE IF NOT EXISTS public.sso_ticket_uses (
    jti      text PRIMARY KEY,
    email    text NOT NULL,
    used_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sso_ticket_uses ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS sso_ticket_uses_used_at_idx ON public.sso_ticket_uses (used_at);
