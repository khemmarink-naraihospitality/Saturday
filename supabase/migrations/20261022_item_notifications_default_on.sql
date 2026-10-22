-- Item notifications are on by default; what is stored is who is switched off.
--
-- 20261022_item_notifications_per_person.sql stored the people switched ON
-- (notify_user_ids, empty = nobody). The default is now ON for everyone in an
-- item's Person column, as before the switch existed, so the list that matters
-- is the people switched OFF. notify_muted_user_ids holds them (empty = nobody
-- is off, the default). A person added to the Person column later is on.
--
-- notify_user_ids and notify_enabled stay in the table, unused: a browser still
-- running an earlier build selects them by name, and dropping them would stop
-- such a board loading. (No item had either set when this ran.)

alter table public.items
    add column if not exists notify_muted_user_ids uuid[] not null default '{}';

comment on column public.items.notify_user_ids is 'Superseded by notify_muted_user_ids; unused.';
