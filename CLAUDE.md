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
```

## Architecture Overview

**Workera** is a Monday.com-inspired project management SPA. Stack: React 18 + TypeScript + Vite, Supabase (PostgreSQL + Auth + Realtime), Tailwind CSS v4, Zustand.

### Routing (No router library)

Navigation is driven entirely by `activePage` in Zustand (`useBoardStore`). `App.tsx` switches between lazy-loaded page components based on this value. URL is kept in sync manually via `window.history.pushState`. URL pattern: `/{username}/{workspace-slug}/{board-slug}`.

Pages: `home`, `board`, `notifications`, `admin`, `dashboard`, `favorites`.

### State Management

Two Zustand stores:

- **`useBoardStore`** (`src/store/useBoardStore.ts`) — the primary store, composed of 6 slices:
  - `boardSlice` — boards CRUD, navigation, view state, Excel import
  - `workspaceSlice` — workspaces CRUD
  - `itemSlice` — items/sub-items CRUD, selection, drag-and-drop
  - `groupSlice` — groups CRUD
  - `columnSlice` — columns CRUD, type changes
  - `memberSlice` — board/workspace members, notifications, Supabase Realtime subscription

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

Column types: `text`, `long_text`, `status`, `date`, `number`, `dropdown`, `checkbox`, `link`, `people`, `timeline`, `files`.

Board views: `main_table` (default), `timeline`, `kanban`, `calendar` — switched via `Board.activeViewId`.

### Supabase Edge Functions

`inviteToBoard` calls the `invite-user` Supabase Edge Function to send email invitations and handle pending invites for users who don't have an account yet.

### Styling

Tailwind CSS v4 (via `@tailwindcss/postcss`). Design tokens use CSS custom properties in HSL format: `hsl(var(--color-bg-canvas))`, `hsl(var(--color-brand-primary))`, etc. Many components use inline styles rather than Tailwind classes for layout-critical properties.

### Build Chunking

Vite is configured with manual chunks (`vite.config.ts`) to split vendor bundles: `vendor-react`, `vendor-ui`, `vendor-dnd`, `vendor-table`, `vendor-utils`, `vendor-supabase`.
