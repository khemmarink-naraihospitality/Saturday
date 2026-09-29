# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Start dev server at http://localhost:5173
npm run build     # Type-check + Vite production build (output: dist/)
npm run lint      # ESLint across all TS/TSX files
npm run preview   # Preview production build locally
```

No automated test runner is configured. `tests/` contains standalone TypeScript files for manual logic verification (e.g. `tests/dependency_logic_test.ts` for the dependency-cascade math).

## Environment Setup

Copy `.env.example` to `.env` and fill in:

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_GIPHY_API_KEY=...        # optional — GifStickerPicker falls back to a shared demo key
```

Two more vars are read but not in `.env.example`: `VITE_GOOGLE_API_KEY` / `VITE_GOOGLE_CLIENT_ID` (`src/hooks/useGooglePicker.ts`, Google file picker integration).

`BOARD_MASTER_PIN` is a separate **Supabase Edge Function secret** (not a `VITE_` client var) — see Private Board PIN Protection below.

## Architecture Overview

**Workera** is a Monday.com-inspired project management SPA. Stack: React 18 + TypeScript + Vite, Supabase (PostgreSQL + Auth + Realtime), Tailwind CSS v4, Zustand.

### Routing (No router library)

Navigation is driven entirely by `activePage` in Zustand (`useBoardStore`). `App.tsx` switches between lazy-loaded page components based on this value. URL is kept in sync manually via `window.history.pushState`. URL pattern: `/{username}/{workspace-slug}/{board-slug}--{shortId}`.

The board segment carries an id suffix (`buildBoardSlug` / `parseBoardSlugSuffix` / `shortId` in `src/lib/utils.ts`): titles collide (renames, re-created boards, imports), so the last 8 hex chars before a `--` disambiguate the URL. A legacy link with no `--` suffix (`parseBoardSlugSuffix` returns `null`) falls back to title-only matching in `App.tsx`'s deep-link resolver.

Pages: `home`, `board`, `notifications`, `admin`, `dashboard`, `favorites`.

### State Management

Two Zustand stores:

- **`useBoardStore`** (`src/store/useBoardStore.ts`) — the primary store, composed of 8 slices:
  - `boardSlice` — boards CRUD, navigation, view state, Excel import
  - `workspaceSlice` — workspaces CRUD
  - `itemSlice` — items/sub-items CRUD, selection, drag-and-drop
  - `groupSlice` — groups CRUD
  - `columnSlice` — columns CRUD, type changes
  - `memberSlice` — board/workspace members, notifications, Supabase Realtime subscription
  - `groupLinkSlice` — Linked Groups: creates/removes cross-board group links (see below)
  - `itemDependencySlice` — Finish-to-Start task dependencies and date-shift cascades (see below)

- **`useUserStore`** (`src/store/useUserStore.ts`) — persisted (localStorage). Stores `currentUser` including their `system_role` and `is_approved`.

Use `useAccessibleWorkspaces` (`src/hooks/useAccessibleWorkspaces.ts`) rather than re-deriving "workspaces this user can see" — it accounts for ownership, explicit workspace roles, *and* individually-shared boards in workspaces the user was never added to, and is shared between the sidebar tree and its collapsed icon rail so the two can't drift out of sync.

### Data Loading Pattern

Board data is **lazy-loaded in two stages**:

1. `loadUserData()` — fetches all workspaces and board metadata (no columns/groups/items). Sets `isDataLoaded: false` on each board.
2. `loadBoardData(boardId)` — triggered when a board is selected; fetches columns, groups, items, and item dependencies. Sets `isDataLoaded: true`. Guarded by `loadingBoardIds` Set to prevent duplicate fetches.

All mutations use **optimistic updates**: local state is updated immediately, then persisted to Supabase. On DB error, state is reverted and `loadUserData(true)` re-syncs.

Realtime updates come through a Supabase channel subscription (set up in `memberSlice.subscribeToRealtime`). A 5-minute polling fallback (`loadUserData(true)`) runs while `activeWorkspaceId` is set.

### Authentication & Access Control

`AuthContext` wraps the app and exposes `session`. `App.tsx` checks `is_approved` before rendering `MainApp`. Auto-approval applies to emails from the domains in `ALLOWED_DOMAINS` (`App.tsx`): `naraihospitality.com`, `marasca.live`, `lubd.com`, `visitamanta.com`, `riverineplace.com`, and `naraihotel.co.th`.

**Two separate role systems:**

- **System roles** (`profiles.system_role`): `super_admin`, `it_admin`, `user` — controls access to the Admin page.
- **Board/workspace roles** (`board_members.role`): `owner > admin > editor > member > viewer` — controls board-level permissions via the `usePermission` hook (`src/hooks/usePermission.ts`). Call `can('action')` to gate features.

**`profiles.is_active`** is a separate, reversible switch from `is_approved`: approval is the one-time gate on a brand-new account, while `is_active` is what an admin flips off when someone leaves. It hides the user from member lists/person-pickers/@mentions and blocks sign-in, without deleting anything they own — flipping it back restores them exactly as they were. `AppContent` renders `DeactivatedAccountPage` instead of the app when the signed-in user's own profile is inactive.

**Deleting a user** goes through the `delete_user(user_id)` RPC, which now refuses while the target still owns any workspace or board — ownership has to move first via `admin_transfer_ownership(from_user, to_user)` (super-admin only; see `supabase/migrations/20260902_secure_delete_user_and_transfer.sql`). Both are `SECURITY DEFINER` with execute revoked from `anon`/`PUBLIC` and granted only to `authenticated`, re-checking the caller's `system_role` inside the function body — added after the previous unrestricted version was found to let any anon-key holder delete any account and cascade-delete their workspaces.

### Data Model

Core types defined in `src/types/index.ts`:

- `Workspace → Board → Group → Item` hierarchy
- `Board.columns: Column[]` — column definitions with `type: ColumnType` and `options[]` for `status`/`dropdown`
- `Item.values: { [columnId: string]: any }` — dynamic map keyed by column UUID. **Status values are stored as the option UUID** (not the label string).
- `Item.parentId` — links sub-items to a parent item. Groups only render top-level items; sub-items are filtered by `parentId !== null`.

Column types: `text`, `long_text`, `status`, `date`, `due_date`, `number`, `dropdown`, `checkbox`, `link`, `people`, `timeline`, `files`, `priority`.

`priority` is a 1-5 star rating stored as a plain number (`null` = unrated). It sorts with the numbers, and its group summary is the average of the rated rows only.

`status` and `dropdown` options share one fixed palette, `LABEL_COLORS` (`src/lib/labelColors.ts`), instead of picking colours independently — keeps boards visually consistent and keeps the Dashboard's status charts working off a bounded set of colours rather than any of 16 million.

Board views: `main_table` (default), `timeline`, `kanban`, `calendar` — switched via `Board.activeViewId`.

### Item Dependencies (Timeline)

Finish-to-Start dependencies between items on the same board (`item_dependencies` table, `itemDependencySlice.ts`, `supabase/migrations/20260903_item_dependencies.sql`). One row is one edge, predecessor → successor; only the `FS` type exists today (the `type` column is reserved for `SS`/`FF`/`SF`). A Postgres trigger rejects an edge whose two items aren't on the same `board_id`; RLS gates read/insert/delete the same way `group_links` does.

When a predecessor's date/timeline/due-date value moves, the client shifts every downstream successor by the same delta (`cascadeFromPredecessor` in `itemDependencySlice.ts`), cascading transitively and capped at `MAX_CASCADE_NODES` (500) as a backstop against a cycle created concurrently by two clients — cycles are otherwise rejected at creation time (`wouldCreateCycle` in `src/lib/dependencyUtils.ts`).

Which column anchors an item's bar is resolved once, in `resolveTimelineColumn` (`src/lib/dependencyUtils.ts`) — the first `timeline`/`date`/`due_date` column (in board column order) the item has a value for. The Timeline view and the dependency cascade both call this same function so an arrow can never point at one column while the shift lands on another. Dependency arrows render in `DependencyOverlay.tsx`; the per-item predecessor/successor editor is `DependenciesSection.tsx` inside `TaskDetail`.

### Linked Groups

A group can be mirrored to a group on a *different* board (`groupLinkSlice.ts`, `group_links` table). `linkGroupToOther` clones the source group's items into a brand-new group on the current board, auto-creating any missing columns and mapping `status`/`dropdown` option ids across boards by matching option **label** (since option UUIDs differ per board). `Group.linkedGroupId` / `linkedBoardId` (`src/types/index.ts`) are populated client-side from `group_links` — not real columns on `groups`.

Ongoing sync after the initial link is handled by a **Postgres trigger** (see `supabase/migrations/20260630_sync_linked_group_updates.sql` and related migrations), not client code — writes to one side's items are mirrored to the other side server-side. The client's job is only to keep both sides subscribed: `loadBoardData` auto-loads any linked board in the background (`boardSlice.ts`), and silently re-fetches items when reopening a board that has linked groups, so mirror rows created while the user was elsewhere appear immediately.

### Private Board PIN Protection

Boards with `is_private: true` are gated by a 6-digit PIN before any board data (columns/groups/items) is fetched — `BoardPage.tsx` renders `PinLockScreen` in place of the board until unlocked. PIN verification, attempt lockout, and OTP-based reset all happen server-side in the `board-pin` Edge Function (never compared client-side). Once unlocked, the board id is cached in `sessionStorage` via `src/lib/boardPinUnlock.ts` for the rest of the tab session, and cleared on sign-out (`AuthContext`).

`board-pin`'s `verify_pin` action also accepts a **break-glass master PIN**, read server-side from the `BOARD_MASTER_PIN` edge-function secret and never sent to the client or shipped in the bundle. It only works for callers whose `profiles.system_role` is `super_admin`; anyone else supplying it gets an ordinary "Incorrect PIN" response, so its existence can't be inferred from the outside. A successful master-PIN unlock is logged to `activity_logs` (`board_master_pin_used`), and that check is deliberately audited before the failed-attempt lockout so a board someone else has locked out is still reachable to a super admin.

### Supabase Edge Functions

- `invite-user` — sends board invitation emails; called via `inviteToBoard`, also handles pending invites for users without an account yet.
- `board-pin` — verifies/sets/resets private-board PINs (OTP-based reset flow, plus the super-admin break-glass master PIN above); called from `PinLockScreen` and `PinResetModal`.
- `ai-summary` — generates AI summaries of board/group activity; called from `AISummaryView` and `AISettings`.
- `test-smtp` — sends a test email to verify SMTP settings from `EmailSettings` (admin).
- `admin-create-user` — creates a user account server-side (service-role key, re-verifies caller's `system_role` against the target role's `ROLE_HIERARCHY`); called from `CreateUserModal` (admin).

### Admin Console

Beyond user/SMTP/system settings, the Admin console can manage board and workspace membership directly — `AdminBoardMembersModal` / `AdminWorkspaceMembersModal` (+ `AdminAddMemberForm`) reuse `MembersList` from the board-side share UI, but fetch members with `includeInactive: true` so a deactivated member (see `is_active` above) still shows up somewhere they can be removed from. `AdminDeleteWorkspaceModal` is the UI for the transfer-then-delete flow described above.

`ActivityLeaderboards.tsx`, `DailyActiveUsersChart.tsx`, and `BasicStatsCards.tsx` read through `src/lib/activityStats.ts`, which pages `activity_logs` in batches of 1000 up to a 50k-row / ~60-day cap (`MAX_PAGES`) and reports back whether it hit that cap, so a summary never silently under-counts without saying so.

### Styling

Tailwind CSS v4 (via `@tailwindcss/postcss`). Design tokens use CSS custom properties in HSL format: `hsl(var(--color-bg-canvas))`, `hsl(var(--color-brand-primary))`, etc. Many components use inline styles rather than Tailwind classes for layout-critical properties.

### Build Chunking

Vite is configured with manual chunks (`vite.config.ts`) to split vendor bundles: `vendor-react`, `vendor-ui`, `vendor-dnd`, `vendor-table`, `vendor-utils`, `vendor-supabase`.
