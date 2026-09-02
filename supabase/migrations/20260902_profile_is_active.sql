-- Active / Inactive status for user accounts.
--
-- Distinct from is_approved: approval is the one-time gate on a brand new account,
-- while this is the reversible switch an admin flips when someone leaves. An
-- inactive account keeps every row it owns (memberships, assignments, activity) —
-- it is hidden and locked out, never deleted — so flipping it back to active
-- restores the person exactly as they were.

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.profiles.is_active IS
    'False hides the user from member lists, person pickers and @mentions, and blocks sign-in. Reversible; no data is removed.';
