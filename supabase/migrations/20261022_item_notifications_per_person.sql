-- The item notification switch becomes per person.
--
-- 20261022_item_notifications_switch.sql added one on/off for the whole item.
-- Who hears about an item is now chosen person by person: notify_user_ids holds
-- the ids of the people in the item's Person column who are switched on (empty
-- = nobody, the default). Only people who are also in a Person column of the item
-- are told, so removing someone from the column silences them.
--
-- notify_enabled stays in the table, unused: a browser still running the earlier
-- build selects it by name, and dropping it would stop such a board loading.
-- (No item had it on when this ran.)

alter table public.items
    add column if not exists notify_user_ids uuid[] not null default '{}';

comment on column public.items.notify_enabled is 'Superseded by notify_user_ids; unused.';
