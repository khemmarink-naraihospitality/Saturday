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

The board segment is the bare title (`/{username}/{workspace}/{board-title}`) unless it needs an id (`boardPathSegment` in `src/lib/utils.ts`): when another live board in the workspace has the same slug, or the title leaves no slug at all (Thai/emoji-only titles slugify to `""`), it carries an id suffix (`buildBoardSlug` / `parseBoardSlugSuffix` / `shortId`) — the last 8 hex chars before a `--` — and the resolver always accepts that form, so older shared links still work. A legacy link with no `--` suffix (`parseBoardSlugSuffix` returns `null`) falls back to title-only matching in `App.tsx`'s deep-link resolver.

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

`AuthContext` wraps the app and exposes `session`. `App.tsx` checks `is_approved` before rendering `MainApp`. Accounts at `naraihospitality.com`, `marasca.live`, `lubd.com`, `visitamanta.com`, `riverineplace.com` and `naraihotel.co.th` never need an admin's approval: the database approves them when the account is created (`public.is_auto_approved_email()`, called by the `handle_new_user` trigger on `auth.users` — `supabase/migrations/20261011_auto_approve_company_domains.sql`), so an invited user who hasn't signed in yet isn't left "Pending". `ALLOWED_DOMAINS` in `App.tsx` is the client's copy of the same list — change both together.

Sign-in is Google, email/password, or **Microsoft** (Supabase's Azure provider, single-tenant app registration; enabled in the project's Auth settings, secret held there only; `LoginPage`, and `/auth/microsoft` starts it directly — `takeMicrosoftEntry` in `src/lib/initialPath.ts`). An account whose *first* sign-in was Microsoft (`app_metadata.provider = 'azure'`) is not auto-approved whatever its domain: it waits for an admin in User Management, and the super admin is notified (`supabase/migrations/20261019_microsoft_signins_need_approval.sql`, mirrored by `createdViaMicrosoft` in `App.tsx`). An existing account that later signs in with Microsoft keeps its approval.

**Two separate role systems:**

- **System roles** (`profiles.system_role`): `super_admin`, `it_admin`, `user` — controls access to the Admin page.
- **Board/workspace roles** (`board_members.role`): `owner > admin > editor > member > viewer` — controls board-level permissions via the `usePermission` hook (`src/hooks/usePermission.ts`). Call `can('action')` to gate features.

**`profiles.is_active`** is a separate, reversible switch from `is_approved`: approval is the one-time gate on a brand-new account, while `is_active` is what an admin flips off when someone leaves. It hides the user from member lists/person-pickers/@mentions and blocks sign-in, without deleting anything they own — flipping it back restores them exactly as they were. `AppContent` renders `DeactivatedAccountPage` instead of the app when the signed-in user's own profile is inactive.

**Who may change `system_role`, `is_approved`, `is_active` and `email` on a profile** is enforced by the `guard_profile_privileged_columns` trigger (`supabase/migrations/20261013_guard_profile_privileged_columns.sql`), not by RLS: the "Users update own" policy lets a user update their own row with no column limit, and `authenticated` holds UPDATE on every column, so without the trigger anyone could promote themselves to `super_admin` from the browser console. The trigger allows the server (no `auth.uid()`, i.e. service-role edge functions and migrations) and `super_admin` anything; an `it_admin` only on rows whose role (before and after) stays below their own; and anyone on their own row only `is_approved → true` for a company-domain address (the `App.tsx` first-sign-in path) or an `email` equal to their sign-in address. Name, avatar and reminder settings are unrestricted. On INSERT (the upsert in `loadUserData`) it overwrites those columns with the user's existing values or defaults rather than raising. A new code path that writes those columns as a signed-in user will fail with error 42501 unless it fits one of those rows — do it from an edge function with the service-role key instead.

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

**Column sets.** Items and sub-items never share a column, and sub-item columns belong to one group: `columns.scope` is `item` or `subitem`, and a `subitem` column has `columns.group_id` (`Column.groupId`) — a check constraint enforces that pairing, and a composite FK `(group_id, board_id) → groups(id, board_id)` keeps the group on the same board and cascades on delete. A board's columns are therefore separate sets (the items', then one per group for the sub-items under that group's items), each with its own header and its own `order` sequence: `addColumn` takes a position within the set, `moveColumn`/`duplicateColumn` act within the column's set, and `replaceSet()` renumbers only that set. A sub-item's group is its **parent's** (`subitem` rows from `groupItems` carry `columnGroupId`); the parent is what it's seen under, and sub-items' own `group_id` has historically gone stale when parents moved. Use `itemColumns()` / `subitemColumns(columns, groupId)` / `siblingColumns()` from `src/lib/columnScope.ts` rather than filtering `board.columns` by hand; item-level views (Kanban, Calendar, Timeline, toolbar menus, dashboard, AI summary) read `itemColumns`. Rows changing place take their values along via `planCarry()` (match by title+type, status options by label, clone what's missing): a parent dragged to another group carries its sub-items to that group's sub-item columns (`carryValues` in `itemSlice`). Moving a parent to another *board* (`moveSelectedItemsToTarget`) takes its sub-items along too — rows load per board, so one left behind has a parent that isn't on its board and shows on neither. Values moving across boards go to the target's columns by **type** (`planCarry(…, 'type')`: same title and type first, then the next unmatched column of that type in the target's order; status labels by name, added to the target column when missing): items fill the target board's existing item columns only, sub-items their new group's sub-item columns (missing ones cloned, as within a board). A value with no column of its type on the target stays stored under its old column id, so moving the row back shows it again. `supabase/migrations/20261002_subitem_columns_per_group.sql` split the old shared (`both`) columns by actual use, after copying `columns` and every item's `values` to the `backup` schema (not exposed to the API); `splitSharedColumns()` applies the same rules client-side to pre-split backups and to Excel imports, where `ImportBoardModal` marks each column with the Monday-export table(s) it came from. Under each parent's sub-items a `subitem-summary` row (from `groupItems`' optional `subitemColumnsFor` argument) totals that group's sub-item columns, drawn with the same `SummaryCell` as the group footers; `computeAggregates()` in `src/utils/grouping.ts` is the one place those roll-ups are computed. The item columns' header is one bar, `position: sticky` above the whole table (`Table.tsx`), not a `groupItems` virtual row repeated per group — item columns are the same set everywhere, so there was nothing group-specific for a repeat to show. Since it sits outside the virtualizer but still pushes the virtualized rows down in normal flow, `useVirtualizer` is given `scrollMargin: ITEM_HEADER_HEIGHT` and each row's `translateY` subtracts that same constant; change the header's height and both need to move together or rows render offset by the difference.

### Workspace Dashboard

`WorkspaceDashboardPage` fetches every board's columns, groups and items for the workspace in one go (`workspaceData`, raw snake_case rows — the boards aren't loaded into the store) and every widget reads from that. Widgets are a layout (`order` plus per-widget `span` 1–3 and optional pixel `height`) rendered by `renderWidget`; dragging the grip reorders and the bottom-right corner resizes (width snaps to grid columns), and the layout is saved per workspace — in `profiles.dashboard_layouts` (debounced, `20261014_profile_dashboard_layouts.sql`) with localStorage `dashboardLayout:…` as the instant copy — from `updateLayout`, never from an effect, so switching workspace can't write one's layout over another's; filters live per widget and per workspace in localStorage (`dashboardStatusColumn:…`, `dashboardBoardFilter:…`).

The Timeline widget (`components/dashboard/WorkspaceTimeline.tsx`, last in the order, spans all three columns) is the board Timeline view's look across the workspace: one bar per dated top-level item, coloured by its group, click opens the item on its own board. It folds down to its header row with the chevron beside the year (remembered per workspace under `dashboardTimelineCollapsed:…`); that is why the dashboard grid uses `gridAutoRows: auto` with a `minHeight` on each widget rather than a minimum row height. It is read-only — dragging a bar or linking dependencies stays on the board. Its only control besides the date navigator is the Filter button, `BoardGroupFilter` in its `toolbar` variant (the same board → group scope as Total Work Task, stored under its own key). The bar maths is `src/lib/timelineScale.ts`, shared with the board's `TimelineView` so both draw the same bar for the same dates (`tests/timeline_scale_test.ts` checks it against the logic as it was inline); the row building and ordering (board, then group, then position — no search/sort/group-by controls) is `src/lib/workspaceTimeline.ts` (`tests/workspace_timeline_test.ts`); hidden items and sub-items never appear. Which column dates an item is the rule `TimelineView` uses (first date/timeline/due-date column with a value), not `resolveTimelineColumn`.

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

`ActivityLeaderboards.tsx`, `DailyActiveUsersChart.tsx`, and `BasicStatsCards.tsx` all read one document from `fetchDashboardStats()` in `src/lib/activityStats.ts`, which calls the `admin_dashboard_stats(p_tz)` RPC (`supabase/migrations/20261014_admin_dashboard_stats.sql`): the 60-day counts, 30-day active-user buckets and 4-week leaderboards are aggregated in Postgres in the viewer's time zone, so nothing is paged down to the browser and there is no row cap to fall short of. The panels mount together and share the one in-flight request. It checks `is_admin()` itself (it is `SECURITY DEFINER` so it can read everyone's activity); a figure added here is added in that function, not by fetching rows.

### User-written HTML

Updates and replies are stored as `RichTextEditor`'s raw `innerHTML` and shown with `dangerouslySetInnerHTML`, so a member's markup is live in every teammate's session. Anything that puts stored HTML into the DOM goes through `sanitizeHtml()` (`src/lib/sanitizeHtml.ts`, DOMPurify): the update/reply render in `TaskDetail` and the phone's item screen — both via `displayUpdateHtml()` (`src/lib/linkify.ts`), which sanitizes and then turns plain web addresses into links without changing what is stored — and the editor's own load path (`innerHTML = sanitizeHtml(value)`). The editors also make an address a link as it is pasted or typed (followed by a space): `linkifyNode` / `autolinkBeforeCaret`, one rule (`findUrls`, `tests/linkify_test.ts`) for all of it, links styled like the toolbar's own. Storage is left as typed — it is scrubbed on the way out, so tightening the rules later also covers old rows. If the editor starts producing a new tag or attribute, add it to the allow-list there and to `tests/sanitize_html_test.ts` (needs `npm install --no-save jsdom`), or it will silently disappear from posted updates. The admin-only email-template previews in `EmailSettings` still render unsanitized HTML; they're authored by admins, not members.

### Phone layout (`src/mobile`)

Phones get their own layout, modelled on monday.com's iPhone app: `MainApp` renders the lazy `MobileApp` instead of the sidebar/board UI when `useIsMobile()` (`src/hooks/useIsMobile.ts`) says so — at most 767px wide, or a touch screen under 500px tall (a phone held sideways); tablets and desktops keep the desktop layout untouched. `MOBILE_LAYOUT_ENABLED` there is the switch for all phones at once; localStorage `saturday:layout` = `desktop` / `mobile` pins one browser (More › Desktop site sets it, and the "Mobile view" pill on the desktop layout undoes it). Every rule in `src/mobile/**/*.css` is scoped under `.m-app` / `.m-portal` (sheets render into a portal), with its own `--m-*` tokens, so none of it can reach the desktop.

It is a second view over the same store and actions, not a second app: rows come from the desktop pipeline (`filterAndSortItems` in `src/lib/boardRows.ts` → `groupItems`), values are written with `updateItemValue` / `assignMemberToItem` / `addColumnOption`…, updates with `addUpdate` / `editUpdate` / `toggleUpdateLike`, and the update-list helpers are shared with `TaskDetail` (`src/lib/updates.ts`). The composer's @mention chip is the same markup `RichTextEditor` inserts (`data-id`), which is what `addUpdate` reads to notify. Phone-only UI state lives in `src/mobile/state/mobileStore.ts`; the phone-only pages are extra `activePage` values (`workspace`, `workspaces`, `more`).

- Board (`board/MobileTable.tsx`): virtualised with fixed row heights (`board/table/layout.ts`, tested in `tests/mobile_table_test.ts`); the name column is `position: sticky` and narrows as the columns scroll in, driven by a CSS variable written once per frame rather than by React.
- Cells: `cells/CellView.tsx` draws a value; a tap goes through `activateCell` (a checkbox ticks in place) to `CellEditorHost`, one sheet per column type in `cells/editors/`. Date maths is `cells/format.ts` / `cells/calendar.ts` — local calendar days, never `toISOString` (`tests/mobile_cells_test.ts`).
- History (`nav/`): MainApp still writes the URL for the pages both layouts share; `useMobileRouting` restores screens on back/forward and gives the phone-only pages entries of their own. Every `BottomSheet` and the item screen owns a history entry (`useHistoryOverlay`), so the back gesture closes it; `installHistoryDepth` stamps entries with `mDepth` (the header back button only steps back within the visit) and slides a page push in *under* an open overlay — an emailed item link opens the item before MainApp writes the board URL. Navigating from inside a sheet goes through `afterSheetClose`.
- Checking it: `npm run dev`, then `/mobile-preview.html?screen=board` (sample data, network stubbed; the screen list is at the top of `src/mobile/preview/main.tsx`, `&theme=dark` for dark) or `/app-preview.html?layout=mobile|desktop` (the whole app over the same data). `scripts/mobile-shots.sh <outdir>` screenshots the reference set at iPhone size.

### Styling

Tailwind CSS v4 (via `@tailwindcss/postcss`). Design tokens use CSS custom properties in HSL format: `hsl(var(--color-bg-canvas))`, `hsl(var(--color-brand-primary))`, etc. Many components use inline styles rather than Tailwind classes for layout-critical properties.

**Palettes.** Two colour palettes, **Saturday** (violet, the default for everyone and what `:root` in `src/styles/variables.css` and the `.m-app` block in `src/mobile/mobile.css` define) and **Narai** (cream, sage green and wood, after the NHGOne campus picture). Each person picks theirs in Profile Settings › Theme (desktop) or More › Theme (phone); light/dark is a separate switch on top. The list is `PALETTES` in `src/lib/palettes.ts`; `useThemeStore.palette` puts `data-palette="narai"` on `<html>` (Saturday has no attribute, so its pixels are exactly what they were before palettes existed), and Narai is a set of overrides of the same variables under `:root[data-palette='narai']:not(.dark)` / `.dark` and the `--m-*` equivalents in `mobile.css`. The choice lives on the account, `profiles.ui_theme` (`20261020_profile_ui_theme.sql`, check constraint lists the palette ids): `chooseAccountPalette` (`src/lib/uiTheme.ts`) applies it and saves it, `loadUserData` adopts it once per page session (a later poll must not undo a fresh choice; sign-out forgets it so the next account's own is adopted), and localStorage holds only the instant pre-load copy. To add a palette: add its id to `palettes.ts` and the check constraint, and an override block in both CSS files. Colour that must follow the palette goes through a token — a hard-coded violet doesn't. Where one had to stay as a fallback it is `var(--token, #oldviolet)` (e.g. `--color-nav-accent`, `--color-action`, `--color-action-2`, `--dash-*`, `--m-hero`), defined only by Narai. Status / dropdown / group colours are users' data and don't change with the palette. `?palette=narai` works on both preview pages.

### Build Chunking

Vite is configured with manual chunks (`vite.config.ts`) to split vendor bundles: `vendor-react`, `vendor-ui`, `vendor-dnd`, `vendor-table`, `vendor-utils`, `vendor-supabase`.
