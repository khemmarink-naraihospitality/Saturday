-- A per-item switch for notifying the people in the item's Person column.
--
-- Off by default, so no existing item changes. When an item has it on, the
-- people in its Person column(s) (except whoever made the change) get an in-app
-- notification and an email when its status changes, an update or reply is
-- posted, or another of its values changes. The client reads and writes it;
-- RLS already lets a member who can edit the item update its row.

alter table public.items
    add column if not exists notify_enabled boolean not null default false;
