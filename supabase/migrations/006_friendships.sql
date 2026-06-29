create table if not exists public.friendships (
  user_id uuid not null references auth.users(id) on delete cascade,
  friend_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  check (user_id <> friend_id)
);

create index if not exists friendships_friend_created_idx
  on public.friendships (friend_id, created_at desc);

alter table public.friendships enable row level security;

drop policy if exists "friendships_select_own" on public.friendships;
create policy "friendships_select_own"
  on public.friendships
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "friendships_insert_own" on public.friendships;
create policy "friendships_insert_own"
  on public.friendships
  for insert
  to authenticated
  with check (auth.uid() = user_id and friend_id <> auth.uid());

drop policy if exists "friendships_delete_own" on public.friendships;
create policy "friendships_delete_own"
  on public.friendships
  for delete
  to authenticated
  using (auth.uid() = user_id);

create or replace function public.get_my_friends()
returns table (
  friend_id uuid,
  display_name text,
  public_id text,
  avatar_id text,
  friend_created_at timestamptz
)
language sql
security definer
stable
set search_path = public
as $$
  select
    profiles.id as friend_id,
    profiles.display_name,
    profiles.public_id,
    auth_users.raw_user_meta_data ->> 'avatar_id' as avatar_id,
    friendships.created_at as friend_created_at
  from public.friendships as friendships
  join public.profiles as profiles
    on profiles.id = friendships.friend_id
  left join auth.users as auth_users
    on auth_users.id = profiles.id
  where friendships.user_id = auth.uid()
  order by friendships.created_at desc;
$$;

create or replace function public.add_friend_by_public_id(p_public_id text)
returns table (
  friend_id uuid,
  display_name text,
  public_id text,
  avatar_id text,
  friend_created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_public_id text := nullif(lower(btrim(regexp_replace(p_public_id, '^@', ''))), '');
  v_friend_id uuid;
begin
  if v_user_id is null then
    raise exception 'ログインが必要です。' using errcode = '28000';
  end if;

  if v_public_id is null or v_public_id !~ '^[a-z0-9_]{3,20}$' then
    raise exception '追加するユーザーIDは3〜20文字の英小文字・数字・_で入力してください。';
  end if;

  select profiles.id
  into v_friend_id
  from public.profiles as profiles
  where profiles.public_id = v_public_id;

  if v_friend_id is null then
    raise exception 'そのユーザーIDのアカウントが見つかりません。';
  end if;

  if v_friend_id = v_user_id then
    raise exception '自分自身はフレンドに追加できません。';
  end if;

  insert into public.friendships (user_id, friend_id)
  values (v_user_id, v_friend_id)
  on conflict (user_id, friend_id) do nothing;

  return query
    select *
    from public.get_my_friends() as friends
    where friends.friend_id = v_friend_id;
end;
$$;

create or replace function public.delete_friend(p_friend_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'ログインが必要です。' using errcode = '28000';
  end if;

  delete from public.friendships
  where user_id = auth.uid()
    and friend_id = p_friend_id;
end;
$$;

revoke all on function public.get_my_friends() from public;
revoke all on function public.add_friend_by_public_id(text) from public;
revoke all on function public.delete_friend(uuid) from public;

grant execute on function public.get_my_friends() to authenticated;
grant execute on function public.add_friend_by_public_id(text) to authenticated;
grant execute on function public.delete_friend(uuid) to authenticated;
