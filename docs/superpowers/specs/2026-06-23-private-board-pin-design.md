# Private Board with PIN — Design

## Summary

Board Owners can mark a board as **Private** and protect it with a 6-digit PIN. Every user (including the Owner) must enter the correct PIN once per login session before viewing a private board's content. If the PIN is forgotten, only the Owner can trigger a "Forgot PIN" flow that emails a one-time OTP to the Owner's own email address, which is then used to set a new PIN. SMTP delivery and the email template for this flow are managed in the existing Admin → Email Settings page, alongside the current invite/assign/mention templates.

## Scope

- Set/change/remove a 6-digit PIN on a board (Owner only).
- Lock screen shown to anyone opening a private board, gating board content until the correct PIN is entered.
- Per-login-session unlock (not re-asked again until logout), enforced per board.
- Forgot PIN → email OTP → set new PIN, restricted to the Owner.
- Realtime force-lock: if the Owner turns Private ON while others have the board open, those sessions are immediately kicked back to the lock screen.
- Small lock indicator on board names in lists/sidebar wherever boards are listed.
- New "PIN Reset OTP" email template in Admin → Email Settings.

Out of scope: per-member custom PINs, PIN-protected sub-items/groups, public/anonymous link sharing (no such feature exists today and isn't being added here).

## Who is "Owner"

Reuses the existing `usePermission()` role resolution (`src/hooks/usePermission.ts`), which already resolves to `'owner'` for both the workspace owner and a `board_members.role === 'owner'` entry. Any UI/action gated to "Owner" in this feature checks `role === 'owner'` from that hook — no new role concept is introduced.

## Data Model

Two new tables, both accessed **only** via Edge Functions using the service-role key. No anon/authenticated RLS grants — the PIN hash and OTP hash must never be reachable directly from the client.

```sql
create table board_pins (
  board_id uuid primary key references boards(id) on delete cascade,
  pin_hash text not null,
  pin_salt text not null,
  failed_attempts int not null default 0,
  locked_until timestamptz,
  set_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

create table board_pin_reset_otps (
  id uuid primary key default uuid_generate_v4(),
  board_id uuid not null references boards(id) on delete cascade,
  otp_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0,
  created_at timestamptz not null default now()
);
```

`boards.is_private boolean not null default false` is added to the existing `boards` table. This flag is readable by anyone who can see the board (needed to know whether to show the lock screen at all), but it carries no secret — the PIN itself never lives on this row.

RLS: `board_pins` and `board_pin_reset_otps` get `enable row level security` with **no policies** (default-deny). All reads/writes happen through Edge Functions with the service-role key, after the function itself checks the caller's role server-side via `board_members`/`workspaces.owner_id`.

## Edge Function: `board-pin`

New Edge Function (sibling to `invite-user`, same SMTP/Nodemailer setup reused for the OTP email) with four actions:

- **`set_pin`** — caller must be Owner (verified server-side). Hashes the new 6-digit PIN with a random salt (SHA-256(pin + salt), stored as `pin_hash`/`pin_salt` — sufficient given the real protection is server-side rate limiting on a 6-digit space, not hash strength) and upserts `board_pins`. Also flips `boards.is_private`. Setting `is_private = false` deletes the `board_pins` row entirely.
- **`verify_pin`** — checks the submitted PIN against the stored hash for `board_id`.
  - On `locked_until` in the future: reject immediately with the remaining lockout time.
  - On mismatch: increment `failed_attempts`; at 5 failed attempts, set `locked_until = now() + 5 minutes` and reset `failed_attempts` to 0.
  - On match: reset `failed_attempts` to 0, return success.
- **`request_pin_reset_otp`** — caller must be Owner. Generates a 6-digit OTP, hashes it, stores it in `board_pin_reset_otps` with a 10-minute expiry, and sends it to the Owner's own email (from `auth.users`/`profiles`) using the new `pin_reset_otp_template` from `system_settings`.
- **`confirm_pin_reset`** — caller must be Owner. Verifies the OTP (checks hash, expiry, and a 5-attempt cap on the OTP row itself), and if valid, sets the new PIN exactly like `set_pin` and deletes the OTP row.

## Frontend

### Types

`Board` gains `is_private?: boolean` in `src/types/index.ts`.

### Unlock state

A new piece of client state — `unlockedBoardIds: Set<string>` — lives in `sessionStorage` (cleared on tab close, and explicitly cleared on sign-out in `AuthContext`). This satisfies "ask once per login session" without inventing new session infrastructure: closing the tab or logging out re-locks every private board; navigating or reloading within the same login does not.

### Lock screen

New component `src/components/board/PinLockScreen.tsx`, rendered by the board page when `board.is_private && !unlockedBoardIds.has(board.id)`. It overlays the full board view (matching the mockup approved during brainstorming):

- 6 individual digit inputs, auto-advancing focus.
- Inline error with remaining attempts; once locked, shows the countdown until `locked_until`.
- "Forgot PIN?" link, visible only when `role === 'owner'` for this board, opening `PinResetModal`.
- On successful `verify_pin`, adds the board to `unlockedBoardIds` and dismisses.

### Forgot PIN / reset modal

New component `src/components/board/PinResetModal.tsx`, two steps matching the approved mockup:

1. Confirms the masked destination email and calls `request_pin_reset_otp`.
2. 6-digit OTP input + 6-digit new-PIN input, calls `confirm_pin_reset`. Includes a "Resend code" action that re-calls step 1.

### Share Board Modal

`ShareBoardModal.tsx` gains a "Private Board" section, visible only when `role === 'owner'`, positioned above the existing Invite form (per approved mockup):

- Toggle: Private Board on/off.
- When on: 6-digit PIN entry + "Save PIN" button (used for both initial set and change). Calls `set_pin` / disables via the same action with `is_private: false`.

### Board lists / sidebar

Wherever board names are rendered in lists (sidebar, home page board cards), a small `Lock` icon (lucide-react, same sizing/color convention as the existing `ReplyIcon`/`ThumbsUp` usage — `size={13}`, `color: hsl(var(--color-text-secondary))`) renders next to the title when `board.is_private`. No emoji, matching the rest of the icon system.

### Realtime force-lock

The existing Supabase Realtime subscription in `memberSlice.subscribeToRealtime` already listens for `postgres_changes` on relevant tables. Add a listener for `UPDATE` on `boards` where `is_private` changes from `false` to `true`: on receipt, remove that `board_id` from `unlockedBoardIds` for every other connected client, which immediately re-renders `PinLockScreen` over the open board.

## Admin → Email Settings

`src/components/admin/EmailSettings.tsx` gains a fourth template block, following the exact pattern of `assignItemTemplate`/`mentionTemplate`: a new `pinResetOtpTemplate` state, seeded with a default subject/HTML in the same NHG-branded style as `DEFAULT_MENTION_TEMPLATE`/`DEFAULT_ASSIGN_TEMPLATE`, persisted to `system_settings` under key `pin_reset_otp_template`. Available variables: `{{otpCode}}`, `{{boardName}}`, `{{expiryMinutes}}`.

## Error Handling

- Wrong PIN: inline error + remaining-attempts count; no distinction in error message between "wrong PIN" and "board doesn't exist" (avoids leaking existence).
- Lockout: countdown shown, all PIN inputs disabled until `locked_until` passes.
- Expired/invalid OTP: inline error, "Resend code" stays available.
- Edge Function failures (SMTP down, etc.): surfaced via the existing `useToast` pattern used elsewhere in `ShareBoardModal`.

## Testing

No automated test runner exists in this repo (per `CLAUDE.md`); verification is manual:

- Owner sets a PIN → reload as a different member → lock screen appears → correct PIN unlocks, wrong PIN increments attempts and eventually locks out for 5 minutes.
- Logout/login clears the unlock and the lock screen reappears.
- Non-owner never sees the "Private Board" section in Share Board Modal, nor "Forgot PIN?" on the lock screen.
- Owner triggers Forgot PIN → OTP arrives at Owner's email using the configured SMTP and the new template → new PIN works.
- Owner flips Private ON while another member has the board open → that member is force-locked without a manual reload.
