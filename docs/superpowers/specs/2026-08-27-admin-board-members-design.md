# Admin Console: Board Members column + management

## Problem

The Admin Console's Board Management table (`src/components/admin/BoardTable.tsx`) lists every board system-wide but gives no visibility into who has access to each board, and no way for a `super_admin`/`it_admin` to add or remove members without opening the board itself and using Share Board (which requires being a member/owner of that board).

## Design

### 1. Members column (`BoardTable.tsx`)

After fetching boards, run one additional query against `board_members` (joined with `profiles`) filtered to the loaded board IDs, and group the rows by `board_id` client-side into a `Record<string, MemberRow[]>`.

Each table row gets a new **Members** cell (placed between Owner and Created) rendering an overlapping avatar stack (max 4 avatars, initials fallback like `MembersList`) plus a `+N` overflow badge when there are more. The whole cell is a button that opens the management modal for that board. A board with zero members renders a neutral "No members" label instead of an empty stack.

### 2. Manage Members modal (`src/components/admin/AdminBoardMembersModal.tsx`, new)

Opened from the Members cell. Fetches members via the existing `getBoardMembers(boardId)` store action and renders:

- The existing `MembersList` component (`src/components/workspace/MembersList.tsx`), with `currentUserRole="owner"` hardcoded so the admin always has full manage rights regardless of their actual membership in that board, and `allowedRoles={['viewer', 'member', 'admin']}` passed through the `RoleSelector`, matching the same roles used in `ShareBoardModal`. This reuses existing role-change, remove-with-confirm, and the built-in guard that blocks removing/demoting a member whose role is `owner`.
- A new `AdminAddMemberForm` (below) above the list for adding members.

Role change and remove wire directly to the existing store actions `updateMemberRole(memberId, 'admin'|'member'|'viewer', 'board')` and `removeMember(memberId, 'board')` — both already DB-only with no email side effects, so no changes needed there.

### 3. Silent add-member (`src/components/admin/AdminAddMemberForm.tsx`, new)

Per product decision, adding a member from the Admin Console must NOT send an email or in-app notification (unlike the normal Share Board invite flow, which always does). Scope is therefore **existing users only** — inviting a brand-new email still requires the real invite flow elsewhere, since a new account can't be created without emailing the person a way to sign in.

UI: a search input (reusing the existing `searchUsers` store action) that lists matching profiles; the admin must pick one from the results (no free-text email submission), choose a role via `RoleSelector`, and click Add.

New store action in `src/store/slices/memberSlice.ts`:

```ts
adminAddBoardMember: (boardId: string, userId: string, role: string) => Promise<void>
```

Implementation: insert directly into `board_members` (skip duplicate if already a member) and call the existing `logActivity('board_member_added_by_admin', 'board', boardId, { user_id, role })` for audit purposes. No `invite-user` edge function call, no `createNotification` call.

### 4. Access control

No new restriction: the Boards tab is already gated to `super_admin`/`it_admin` at the `AdminPage.tsx` level, and this feature is exposed identically to both, consistent with how the rest of that page already works.

## Out of scope

- Inviting a brand-new (no-account) email from the Admin Console — use the board's own Share Board modal for that.
- Workspace-level member management from Admin Console (only board-level, matching the current Board Management table's scope).
- Server-side pagination for the members query — the existing Board Management table already loads all boards in one unpaginated query, so the added members query follows the same pattern.
