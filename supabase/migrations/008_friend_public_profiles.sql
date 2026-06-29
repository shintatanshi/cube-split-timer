create or replace function public.get_friend_public_profile(p_public_id text)
returns table (
  user_id uuid,
  display_name text,
  public_id text,
  avatar_id text,
  best_ms integer,
  today_best_ms integer
)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_public_id text := nullif(lower(btrim(regexp_replace(p_public_id, '^@', ''))), '');
  v_target_id uuid;
begin
  if v_user_id is null then
    raise exception 'ログインが必要です。' using errcode = '28000';
  end if;

  if v_public_id is null or v_public_id !~ '^[a-z0-9_]{3,20}$' then
    raise exception 'ユーザーIDは3〜20文字の英小文字・数字・_で入力してください。';
  end if;

  select profiles.id
  into v_target_id
  from public.profiles as profiles
  where profiles.public_id = v_public_id;

  if v_target_id is null then
    raise exception 'そのユーザーIDのアカウントが見つかりません。';
  end if;

  if v_target_id <> v_user_id and not exists (
    select 1
    from public.friend_requests
    where status in ('pending', 'accepted')
      and least(requester_id, addressee_id) = least(v_user_id, v_target_id)
      and greatest(requester_id, addressee_id) = greatest(v_user_id, v_target_id)
  ) then
    raise exception 'このプロフィールを見るにはフレンド申請またはフレンド登録が必要です。';
  end if;

  return query
    select
      profiles.id as user_id,
      profiles.display_name,
      profiles.public_id,
      auth_users.raw_user_meta_data ->> 'avatar_id' as avatar_id,
      (
        select min(solve_sessions.total_ms)::integer
        from public.solve_sessions as solve_sessions
        where solve_sessions.user_id = profiles.id
          and solve_sessions.is_deleted = false
          and solve_sessions.is_dnf = false
      ) as best_ms,
      (
        select min(solve_sessions.total_ms)::integer
        from public.solve_sessions as solve_sessions
        where solve_sessions.user_id = profiles.id
          and solve_sessions.is_deleted = false
          and solve_sessions.is_dnf = false
          and (solve_sessions.created_at at time zone 'Asia/Tokyo')::date =
            (now() at time zone 'Asia/Tokyo')::date
      ) as today_best_ms
    from public.profiles as profiles
    left join auth.users as auth_users
      on auth_users.id = profiles.id
    where profiles.id = v_target_id;
end;
$$;

revoke all on function public.get_friend_public_profile(text) from public;
grant execute on function public.get_friend_public_profile(text) to authenticated;
