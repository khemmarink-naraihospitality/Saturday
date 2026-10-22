-- A person can switch off only their own notifications for an item.
--
-- items.notify_muted_user_ids lists the people switched off. Anyone who can edit
-- an item can update its row, so on its own the column let one teammate switch
-- another off. This trigger refuses any change to the list other than adding or
-- removing the signed-in user's own id (server-side callers with no signed-in
-- user, e.g. migrations and edge functions, are not restricted).
--
-- set_item_notifications() is the way the app changes it: it needs only that the
-- caller can see the item (a board or workspace member, or an admin), so someone
-- who may not edit the item can still switch their own notifications on or off.

create or replace function public.guard_item_notify_muted()
returns trigger
language plpgsql
as $function$
declare
    changed uuid[];
begin
    if auth.uid() is null then
        return new;
    end if;
    if new.notify_muted_user_ids is not distinct from old.notify_muted_user_ids then
        return new;
    end if;

    select coalesce(array_agg(d.u), '{}')
      into changed
      from (
          (select unnest(new.notify_muted_user_ids) as u except select unnest(old.notify_muted_user_ids))
          union
          (select unnest(old.notify_muted_user_ids) as u except select unnest(new.notify_muted_user_ids))
      ) d;

    if exists (select 1 from unnest(changed) c where c <> auth.uid()) then
        raise exception 'You can only change your own notification setting for an item'
            using errcode = '42501';
    end if;
    return new;
end;
$function$;

drop trigger if exists guard_item_notify_muted on public.items;
create trigger guard_item_notify_muted
    before update of notify_muted_user_ids on public.items
    for each row execute function public.guard_item_notify_muted();

create or replace function public.set_item_notifications(p_item_id uuid, p_on boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
    v_board uuid;
    v_workspace uuid;
begin
    if auth.uid() is null then
        raise exception 'Not signed in' using errcode = '42501';
    end if;
    select i.board_id, b.workspace_id into v_board, v_workspace
      from items i join boards b on b.id = i.board_id
     where i.id = p_item_id;
    if v_board is null then
        raise exception 'Item not found' using errcode = 'P0002';
    end if;
    if not (is_admin() or is_board_member(v_board) or is_workspace_member(v_workspace)) then
        raise exception 'No access to this item' using errcode = '42501';
    end if;

    update items
       set notify_muted_user_ids = case
               when p_on then array_remove(notify_muted_user_ids, auth.uid())
               when auth.uid() = any(notify_muted_user_ids) then notify_muted_user_ids
               else array_append(notify_muted_user_ids, auth.uid())
           end
     where id = p_item_id;
end;
$function$;

revoke all on function public.set_item_notifications(uuid, boolean) from public, anon;
grant execute on function public.set_item_notifications(uuid, boolean) to authenticated;
