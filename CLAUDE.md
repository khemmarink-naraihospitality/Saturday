# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Start dev server at http://localhost:5173
npm run build     # Type-check + Vite production build (output: dist/)
npm run lint      # ESLint across all TS/TSX files
npm run preview   # Preview production build locally
```

No automated test runner is configured. `tests/` contains a standalone TypeScript file for manual logic verification.

## Environment Setup

Copy `.env.example` to `.env` and fill in:

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_GIPHY_API_KEY=...        # optional — GifStickerPicker falls back to a shared demo key
```

Two more vars are read but not in `.env.example`: `VITE_GOOGLE_API_KEY` / `VITE_GOOGLE_CLIENT_ID` (`src/hooks/useGooglePicker.ts`, Google file picker integration).

## Architecture Overview

**Workera** is a Monday.com-inspired project management SPA. Stack: React 18 + TypeScript + Vite, Supabase (PostgreSQL + Auth + Realtime), Tailwind CSS v4, Zustand.

### Routing (No router library)

Navigation is driven entirely by `activePage` in Zustand (`useBoardStore`). `App.tsx` switches between lazy-loaded page components based on this value. URL is kept in sync manually via `window.history.pushState`. URL pattern: `/{username}/{workspace-slug}/{board-slug}`.

Pages: `home`, `board`, `notifications`, `admin`, `dashboard`, `favorites`.

### State Management

Two Zustand stores:

- **`useBoardStore`** (`src/store/useBoardStore.ts`) — the primary store, composed of 7 slices:
  - `boardSlice` — boards CRUD, navigation, view state, Excel import
  - `workspaceSlice` — workspaces CRUD
  - `itemSlice` — items/sub-items CRUD, selection, drag-and-drop
  - `groupSlice` — groups CRUD
  - `columnSlice` — columns CRUD, type changes
  - `memberSlice` — board/workspace members, notifications, Supabase Realtime subscription
  - `groupLinkSlice` — Linked Groups: creates/removes cross-board group links (see below)

- **`useUserStore`** (`src/store/useUserStore.ts`) — persisted (localStorage). Stores `currentUser` including their `system_role` and `is_approved`.

### Data Loading Pattern

Board data is **lazy-loaded in two stages**:

1. `loadUserData()` — fetches all workspaces and board metadata (no columns/groups/items). Sets `isDataLoaded: false` on each board.
2. `loadBoardData(boardId)` — triggered when a board is selected; fetches columns, groups, and items. Sets `isDataLoaded: true`. Guarded by `loadingBoardIds` Set to prevent duplicate fetches.

All mutations use **optimistic updates**: local state is updated immediately, then persisted to Supabase. On DB error, state is reverted and `loadUserData(true)` re-syncs.

Realtime updates come through a Supabase channel subscription (set up in `memberSlice.subscribeToRealtime`). A 5-minute polling fallback (`loadUserData(true)`) runs while `activeWorkspaceId` is set.

### Authentication & Access Control

`AuthContext` wraps the app and exposes `session`. `App.tsx` checks `is_approved` before rendering `MainApp`. Auto-approval applies to emails from `naraihospitality.com`, `marasca.live`, and `lubd.com`.

**Two separate role systems:**

- **System roles** (`profiles.system_role`): `super_admin`, `it_admin`, `user` — controls access to the Admin page.
- **Board/workspace roles** (`board_members.role`): `owner > admin > editor > member > viewer` — controls board-level permissions via the `usePermission` hook (`src/hooks/usePermission.ts`). Call `can('action')` to gate features.

### Data Model

Core types defined in `src/types/index.ts`:

- `Workspace → Board → Group → Item` hierarchy
- `Board.columns: Column[]` — column definitions with `type: ColumnType` and `options[]` for `status`/`dropdown`
- `Item.values: { [columnId: string]: any }` — dynamic map keyed by column UUID. **Status values are stored as the option UUID** (not the label string).
- `Item.parentId` — links sub-items to a parent item. Groups only render top-level items; sub-items are filtered by `parentId !== null`.

Column types: `text`, `long_text`, `status`, `date`, `due_date`, `number`, `dropdown`, `checkbox`, `link`, `people`, `timeline`, `files`.

Board views: `main_table` (default), `timeline`, `kanban`, `calendar` — switched via `Board.activeViewId`.

### Linked Groups

A group can be mirrored to a group on a *different* board (`groupLinkSlice.ts`, `group_links` table). `linkGroupToOther` clones the source group's items into a brand-new group on the current board, auto-creating any missing columns and mapping `status`/`dropdown` option ids across boards by matching option **label** (since option UUIDs differ per board). `Group.linkedGroupId` / `linkedBoardId` (`src/types/index.ts`) are populated client-side from `group_links` — not real columns on `groups`.

Ongoing sync after the initial link is handled by a **Postgres trigger** (see `supabase/migrations/20260630_sync_linked_group_updates.sql` and related migrations), not client code — writes to one side's items are mirrored to the other side server-side. The client's job is only to keep both sides subscribed: `loadBoardData` auto-loads any linked board in the background (`boardSlice.ts`), and silently re-fetches items when reopening a board that has linked groups, so mirror rows created while the user was elsewhere appear immediately.

### Private Board PIN Protection

Boards with `is_private: true` are gated by a 6-digit PIN before any board data (columns/groups/items) is fetched — `BoardPage.tsx` renders `PinLockScreen` in place of the board until unlocked. PIN verification, attempt lockout, and OTP-based reset all happen server-side in the `board-pin` Edge Function (never compared client-side). Once unlocked, the board id is cached in `sessionStorage` via `src/lib/boardPinUnlock.ts` for the rest of the tab session, and cleared on sign-out (`AuthContext`).

### Supabase Edge Functions

- `invite-user` — sends board invitation emails; called via `inviteToBoard`, also handles pending invites for users without an account yet.
- `board-pin` — verifies/sets/resets private-board PINs (OTP-based reset flow); called from `PinLockScreen` and `PinResetModal`.
- `ai-summary` — generates AI summaries of board/group activity; called from `AISummaryView` and `AISettings`.
- `test-smtp` — sends a test email to verify SMTP settings from `EmailSettings` (admin).
- `admin-create-user` — creates a user account server-side (service-role key, re-verifies caller's `system_role` against the target role's `ROLE_HIERARCHY`); called from `CreateUserModal` (admin).

### Styling

Tailwind CSS v4 (via `@tailwindcss/postcss`). Design tokens use CSS custom properties in HSL format: `hsl(var(--color-bg-canvas))`, `hsl(var(--color-brand-primary))`, etc. Many components use inline styles rather than Tailwind classes for layout-critical properties.

### Build Chunking

Vite is configured with manual chunks (`vite.config.ts`) to split vendor bundles: `vendor-react`, `vendor-ui`, `vendor-dnd`, `vendor-table`, `vendor-utils`, `vendor-supabase`.
