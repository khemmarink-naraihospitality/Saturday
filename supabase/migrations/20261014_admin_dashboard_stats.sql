-- The Admin console's Dashboard, computed in the database.
--
-- Its three panels (Basic stats, Daily Active Users, the leaderboards) used to
-- download every activity_logs row of the last 60 days — ~36,000 of them, 1,000
-- at a time, one request after another, each row carrying its actor's profile and
-- passing the row-level policy (which calls is_admin() per row) — and count them in
-- the browser. This returns the same figures as one small JSON document.
--
-- Days are the viewer's own: p_tz is the browser's IANA zone, so "today", the day
-- buckets and the four weeks line up with what the client drew before.
--
-- SECURITY DEFINER because it reads every user's activity; it checks is_admin()
-- itself (super_admin / it_admin, the same people the Admin console lets in).

create or replace function public.admin_dashboard_stats(p_tz text default 'UTC')
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $fn$
declare
    v_tz text := coalesce(nullif(p_tz, ''), 'UTC');
    v_today date;
    v_since timestamptz;
    v_result jsonb;
begin
    if not public.is_admin() then
        raise exception 'Not allowed' using errcode = '42501';
    end if;

    if not exists (select 1 from pg_timezone_names where name = v_tz) then
        v_tz := 'UTC';
    end if;

    v_today := (now() at time zone v_tz)::date;
    -- Midnight, 59 days back: a 60-day window counting today.
    v_since := (v_today - 59)::timestamp at time zone v_tz;

    with ev as materialized (
        select a.actor_id,
               a.action_type,
               case when jsonb_typeof(a.metadata -> 'board_id') = 'string' then a.metadata ->> 'board_id' end as board_id,
               (a.created_at at time zone v_tz)::date as d
        from public.activity_logs a
        where a.created_at >= v_since
          and a.actor_id is not null
    ),
    lb as (
        select actor_id, action_type, board_id, (v_today - d) as ago
        from ev
        where action_type in ('item_created', 'item_comment_added')
          and d >= v_today - 27
          and d <= v_today
    ),
    people as (
        select actor_id,
               count(*) as total,
               jsonb_build_array(
                   count(*) filter (where ago between 21 and 27),
                   count(*) filter (where ago between 14 and 20),
                   count(*) filter (where ago between 7 and 13),
                   count(*) filter (where ago between 0 and 6)
               ) as weeks,
               action_type
        from lb
        group by actor_id, action_type
    )
    select jsonb_build_object(
        'summary', (
            select jsonb_build_object(
                'boards_updated', count(distinct board_id),
                'people_posted', count(distinct actor_id) filter (where action_type = 'item_comment_added'),
                'updates', count(*) filter (where action_type = 'item_comment_added'),
                'contributed', count(distinct actor_id) filter (where action_type <> 'user_login'),
                'signed_in', count(distinct actor_id) filter (where action_type = 'user_login')
            ) from ev
        ),
        'joined', (select count(*) from public.profiles where created_at >= v_since),
        'daily', (
            select coalesce(jsonb_agg(jsonb_build_object('day', day, 'users', users) order by day), '[]'::jsonb)
            from (
                select x.d::text as day,
                       jsonb_agg(
                           jsonb_build_object(
                               'name', coalesce(nullif(p.full_name, ''), p.email, 'Unknown user'),
                               'email', coalesce(p.email, '')
                           )
                           order by coalesce(nullif(p.full_name, ''), p.email, 'Unknown user')
                       ) as users
                from (select distinct d, actor_id from ev where d >= v_today - 29) x
                left join public.profiles p on p.id = x.actor_id
                group by x.d
            ) days
        ),
        'boards', (
            select coalesce(jsonb_agg(jsonb_build_object(
                       'board_id', t.board_id,
                       'title', coalesce(b.title, 'Deleted board'),
                       'items', t.items,
                       'updates', t.updates
                   ) order by t.items + t.updates desc, t.board_id), '[]'::jsonb)
            from (
                select board_id,
                       count(*) filter (where action_type = 'item_created') as items,
                       count(*) filter (where action_type = 'item_comment_added') as updates
                from lb
                where board_id is not null
                group by board_id
                order by count(*) desc, board_id
                limit 50
            ) t
            left join public.boards b
                on t.board_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
               and b.id = case when t.board_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then t.board_id::uuid end
        ),
        'creators', (
            select coalesce(jsonb_agg(jsonb_build_object(
                       'user_id', r.actor_id, 'name', r.name, 'avatar_url', r.avatar_url, 'weeks', r.weeks, 'total', r.total
                   ) order by r.total desc, r.name), '[]'::jsonb)
            from (
                select pe.actor_id, pe.weeks, pe.total,
                       coalesce(nullif(p.full_name, ''), p.email, 'Unknown user') as name,
                       p.avatar_url
                from people pe left join public.profiles p on p.id = pe.actor_id
                where pe.action_type = 'item_created'
                order by pe.total desc, 4
                limit 50
            ) r
        ),
        'communicators', (
            select coalesce(jsonb_agg(jsonb_build_object(
                       'user_id', r.actor_id, 'name', r.name, 'avatar_url', r.avatar_url, 'weeks', r.weeks, 'total', r.total
                   ) order by r.total desc, r.name), '[]'::jsonb)
            from (
                select pe.actor_id, pe.weeks, pe.total,
                       coalesce(nullif(p.full_name, ''), p.email, 'Unknown user') as name,
                       p.avatar_url
                from people pe left join public.profiles p on p.id = pe.actor_id
                where pe.action_type = 'item_comment_added'
                order by pe.total desc, 4
                limit 50
            ) r
        )
    ) into v_result;

    return v_result;
end;
$fn$;

revoke all on function public.admin_dashboard_stats(text) from public, anon;
grant execute on function public.admin_dashboard_stats(text) to authenticated;
