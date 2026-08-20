-- Board load performance fix. Both items and groups now get an
-- `is_archived = false` filter added to their queries (items: today's
-- soft-delete change; groups: an earlier session), but neither table ever
-- got an index covering that filter. Opening any board runs this query,
-- so every archived row that's accumulated since soft-delete shipped has
-- been making every board load progressively slower with no index to
-- prune them — this is the most likely cause of the reported slowdown.
--
-- Composite (board_id, is_archived) covers the exact where-clause shape
-- used everywhere: `.eq('board_id', boardId).eq('is_archived', false)`.

create index if not exists idx_items_board_id_is_archived
  on items (board_id, is_archived);

create index if not exists idx_groups_board_id_is_archived
  on groups (board_id, is_archived);
