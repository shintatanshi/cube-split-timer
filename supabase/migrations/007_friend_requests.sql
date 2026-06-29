create extension if not exists pgcrypto;

create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  addressee_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  addressee_seen_at timestamptz,
  requester_seen_at timestamptz,
  check (requester_id <> addressee_id),
  check (status in ('pending', 'accepted', 'rejected'))
);

create index if not exists friend_requests_addressee_status_idx
  on public.friend_requests (addressee_id, status, created_at desc);

create index if not exists friend_requests_requester_status_idx
  on public.friend_requests (requester_id, status, created_at desc);

drop index if exists friend_requests_active_pair_key;
create unique index friend_requests_active_pair_key
  on public.friend_requests (
    least(requester_id, addressee_id),
    greatest(requester_id, addressee_id)
  )
  where status in ('pending', 'accepted');

alter table public.friend_requests enable row level security;

drop policy if exists "friend_requests_select_own" on public.friend_requests;
create policy "friend_requests_select_own"
  on public.friend_requests
  for select
  to authenticated
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

drop policy if exists "friend_requests_insert_own" on public.friend_requests;
drop policy if exists "friend_requests_update_own" on public.friend_requests;
drop policy if exists "friend_requests_delete_own" on public.friend_requests;

-- Writes go through security-definer RPCs so users cannot accept their own outgoing request
-- by directly updating the table.

do $$
begin
  if to_regclass('public.friendships') is not null then
    execute $migrate$
      with legacy_friendships as (
        select distinct on (least(user_id, friend_id), greatest(user_id, friend_id))
          user_id,
          friend_id,
          created_at
        from public.friendships
        where user_id <> friend_id
        order by least(user_id, friend_id), greatest(user_id, friend_id), created_at asc
      )
      insert into public.friend_requests (
        requester_id,
        addressee_id,
        status,
        created_at,
        responded_at,
        addressee_seen_at,
        requester_seen_at
      )
      select
        user_id,
        friend_id,
        'accepted',
        created_at,
        created_at,
        now(),
        now()
      from legacy_friendships
      on conflict do nothing
    $migrate$;
  end if;
end;
$$;

create or replace function public.get_friend_connections()
returns table (
  request_id uuid,
  other_user_id uuid,
  direction text,
  status text,
  display_name text,
  public_id text,
  avatar_id text,
  request_created_at timestamptz,
  responded_at timestamptz,
  addressee_seen_at timestamptz
)
language sql
security definer
stable
set search_path = public
as $$
  select
    friend_requests.id as request_id,
    case
      when friend_requests.requester_id = auth.uid() then friend_requests.addressee_id
      else friend_requests.requester_id
    end as other_user_id,
    case
      when friend_requests.status = 'accepted' then 'friend'
      when friend_requests.addressee_id = auth.uid() then 'incoming'
      else 'outgoing'
    end as direction,
    friend_requests.status,
    profiles.display_name,
    profiles.public_id,
    auth_users.raw_user_meta_data ->> 'avatar_id' as avatar_id,
    friend_requests.created_at as request_created_at,
    friend_requests.responded_at,
    friend_requests.addressee_seen_at
  from public.friend_requests as friend_requests
  join public.profiles as profiles
    on profiles.id = case
      when friend_requests.requester_id = auth.uid() then friend_requests.addressee_id
      else friend_requests.requester_id
    end
  left join auth.users as auth_users
    on auth_users.id = profiles.id
  where (friend_requests.requester_id = auth.uid() or friend_requests.addressee_id = auth.uid())
    and friend_requests.status in ('pending', 'accepted')
  order by
    case
      when friend_requests.status = 'pending' and friend_requests.addressee_id = auth.uid() then 0
      when friend_requests.status = 'pending' and friend_requests.requester_id = auth.uid() then 1
      else 2
    end,
    friend_requests.created_at desc;
$$;

create or replace function public.get_friend_notification_count()
returns integer
language sql
security definer
stable
set search_path = public
as $$
  select count(*)::integer
  from public.friend_requests
  where addressee_id = auth.uid()
    and status = 'pending'
    and addressee_seen_at is null;
$$;

create or replace function public.mark_friend_request_notifications_seen()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'ログインが必要です。' using errcode = '28000';
  end if;

  update public.friend_requests
  set addressee_seen_at = now()
  where addressee_id = auth.uid()
    and status = 'pending'
    and addressee_seen_at is null;

  get diagnostics v_count = row_count;

  return v_count;
end;
$$;

create or replace function public.send_friend_request(p_public_id text)
returns table (
  request_id uuid,
  other_user_id uuid,
  direction text,
  status text,
  display_name text,
  public_id text,
  avatar_id text,
  request_created_at timestamptz,
  responded_at timestamptz,
  addressee_seen_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_public_id text := nullif(lower(btrim(regexp_replace(p_public_id, '^@', ''))), '');
  v_addressee_id uuid;
  v_request_id uuid;
  v_existing public.friend_requests;
begin
  if v_user_id is null then
    raise exception 'ログインが必要です。' using errcode = '28000';
  end if;

  if v_public_id is null or v_public_id !~ '^[a-z0-9_]{3,20}$' then
    raise exception '追加するユーザーIDは3〜20文字の英小文字・数字・_で入力してください。';
  end if;

  select profiles.id
  into v_addressee_id
  from public.profiles as profiles
  where profiles.public_id = v_public_id;

  if v_addressee_id is null then
    raise exception 'そのユーザーIDのアカウントが見つかりません。';
  end if;

  if v_addressee_id = v_user_id then
    raise exception '自分自身はフレンドに追加できません。';
  end if;

  select *
  into v_existing
  from public.friend_requests
  where friend_requests.status in ('pending', 'accepted')
    and least(requester_id, addressee_id) = least(v_user_id, v_addressee_id)
    and greatest(requester_id, addressee_id) = greatest(v_user_id, v_addressee_id)
  order by created_at desc
  limit 1
  for update;

  if found then
    if v_existing.status = 'accepted' then
      v_request_id := v_existing.id;
    elsif v_existing.addressee_id = v_user_id then
      update public.friend_requests
      set
        status = 'accepted',
        responded_at = now(),
        addressee_seen_at = coalesce(addressee_seen_at, now()),
        requester_seen_at = null
      where id = v_existing.id
      returning id into v_request_id;
    else
      v_request_id := v_existing.id;
    end if;
  else
    insert into public.friend_requests (requester_id, addressee_id, status)
    values (v_user_id, v_addressee_id, 'pending')
    returning id into v_request_id;
  end if;

  return query
    select *
    from public.get_friend_connections() as connections
    where connections.request_id = v_request_id;
exception
  when unique_violation then
    raise exception 'このユーザーとはすでに申請中、またはフレンドです。' using errcode = '23505';
end;
$$;

create or replace function public.respond_friend_request(
  p_request_id uuid,
  p_accept boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'ログインが必要です。' using errcode = '28000';
  end if;

  if p_accept then
    update public.friend_requests
    set
      status = 'accepted',
      responded_at = now(),
      addressee_seen_at = coalesce(addressee_seen_at, now()),
      requester_seen_at = null
    where id = p_request_id
      and addressee_id = auth.uid()
      and status = 'pending';
  else
    update public.friend_requests
    set
      status = 'rejected',
      responded_at = now(),
      addressee_seen_at = coalesce(addressee_seen_at, now())
    where id = p_request_id
      and addressee_id = auth.uid()
      and status = 'pending';
  end if;
end;
$$;

create or replace function public.delete_friend_connection(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'ログインが必要です。' using errcode = '28000';
  end if;

  delete from public.friend_requests
  where id = p_request_id
    and (requester_id = auth.uid() or addressee_id = auth.uid())
    and status in ('pending', 'accepted');
end;
$$;

do $$
begin
  begin
    alter publication supabase_realtime add table public.friend_requests;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
end;
$$;

revoke all on function public.get_friend_connections() from public;
revoke all on function public.get_friend_notification_count() from public;
revoke all on function public.mark_friend_request_notifications_seen() from public;
revoke all on function public.send_friend_request(text) from public;
revoke all on function public.respond_friend_request(uuid, boolean) from public;
revoke all on function public.delete_friend_connection(uuid) from public;

grant execute on function public.get_friend_connections() to authenticated;
grant execute on function public.get_friend_notification_count() to authenticated;
grant execute on function public.mark_friend_request_notifications_seen() to authenticated;
grant execute on function public.send_friend_request(text) to authenticated;
grant execute on function public.respond_friend_request(uuid, boolean) to authenticated;
grant execute on function public.delete_friend_connection(uuid) to authenticated;
