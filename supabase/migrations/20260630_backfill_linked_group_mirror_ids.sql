-- One-time backfill: items copied into a group at link-creation time
-- (linkGroupToOther's initial backfill) were never given a mirror_item_id,
-- so the sync trigger has been silently skipping all edits to those
-- pre-existing items ever since (it bails when mirror_item_id is null).
-- Only items created AFTER a group was linked have been syncing.
--
-- Pairs items 1:1 within each linked group by title (top-level items), then
-- by (title, parent) for sub-items once their parent pairing is resolved.
-- "order" is NOT used for matching — it's never synced by the trigger and
-- drifts independently per side as each board is reordered locally.
-- Verified before running: no group in group_links has two top-level items
-- sharing a title, and no parent has two sub-items sharing a title.

begin;

-- Top-level items (parent_id is null)
update items ia
set mirror_item_id = ib.id
from items ib, group_links gl
where ia.parent_id is null
  and ib.parent_id is null
  and ia.group_id <> ib.group_id
  and ia.title = ib.title
  and ia.mirror_item_id is null
  and (
    (gl.group_a_id = ia.group_id and gl.group_b_id = ib.group_id)
    or (gl.group_b_id = ia.group_id and gl.group_a_id = ib.group_id)
  );

-- Sub-items: require the parent pair to already be resolved above, so a
-- sub-item only links to its counterpart under the matching parent.
update items ia
set mirror_item_id = ib.id
from items ib, group_links gl, items pa, items pb
where ia.parent_id is not null
  and ib.parent_id is not null
  and pa.id = ia.parent_id
  and pb.id = ib.parent_id
  and ia.group_id <> ib.group_id
  and ia.title = ib.title
  and pa.mirror_item_id = pb.id
  and ia.mirror_item_id is null
  and (
    (gl.group_a_id = ia.group_id and gl.group_b_id = ib.group_id)
    or (gl.group_b_id = ia.group_id and gl.group_a_id = ib.group_id)
  );

commit;
