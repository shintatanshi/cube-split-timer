create extension if not exists pgcrypto;

create table if not exists public.friend_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  receiver_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  check (sender_id <> receiver_id),
  check (char_length(btrim(body)) between 1 and 1000)
);

create index if not exists friend_messages_pair_created_idx
  on public.friend_messages (
    least(sender_id, receiver_id),
    greatest(sender_id, receiver_id),
    created_at desc
  );

create index if not exists friend_messages_receiver_unread_idx
  on public.friend_messages (receiver_id, read_at, created_at desc)
  where read_at is null;

alter table public.friend_messages enable row level security;

drop policy if exists "friend_messages_select_own" on public.friend_messages;
create policy "friend_messages_select_own"
  on public.friend_messages
  for select
  to authenticated
  using (auth.uid() = sender_id or auth.uid() = receiver_id);

drop policy if exists "friend_messages_insert_own" on public.friend_messages;
drop policy if exists "friend_messages_update_own" on public.friend_messages;
drop policy if exists "friend_messages_delete_own" on public.friend_messages;

create or replace function public.are_accepted_friends(
  p_user_id uuid,
  p_friend_id uuid
)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.friend_requests
    where status = 'accepted'
      and least(requester_id, addressee_id) = least(p_user_id, p_friend_id)
      and greatest(requester_id, addressee_id) = greatest(p_user_id, p_friend_id)
  );
$$;

create or replace function public.get_chat_threads()
returns table (
  other_user_id uuid,
  display_name text,
  public_id text,
  avatar_id text,
  last_message text,
  last_message_at timestamptz,
  unread_count integer
)
language sql
security definer
stable
set search_path = public
as $$
  with accepted_friends as (
    select
      case
        when friend_requests.requester_id = auth.uid() then friend_requests.addressee_id
        else friend_requests.requester_id
      end as friend_id,
      friend_requests.responded_at,
      friend_requests.created_at
    from public.friend_requests as friend_requests
    where friend_requests.status = 'accepted'
      and (friend_requests.requester_id = auth.uid() or friend_requests.addressee_id = auth.uid())
  ),
  ranked_messages as (
    select
      case
        when friend_messages.sender_id = auth.uid() then friend_messages.receiver_id
        else friend_messages.sender_id
      end as friend_id,
      friend_messages.body,
      friend_messages.created_at,
      row_number() over (
        partition by case
          when friend_messages.sender_id = auth.uid() then friend_messages.receiver_id
          else friend_messages.sender_id
        end
        order by friend_messages.created_at desc
      ) as row_number
    from public.friend_messages as friend_messages
    where friend_messages.sender_id = auth.uid()
      or friend_messages.receiver_id = auth.uid()
  )
  select
    accepted_friends.friend_id as other_user_id,
    profiles.display_name,
    profiles.public_id,
    auth_users.raw_user_meta_data ->> 'avatar_id' as avatar_id,
    ranked_messages.body as last_message,
    ranked_messages.created_at as last_message_at,
    coalesce(unread_messages.unread_count, 0)::integer as unread_count
  from accepted_friends
  join public.profiles as profiles
    on profiles.id = accepted_friends.friend_id
  left join auth.users as auth_users
    on auth_users.id = profiles.id
  left join ranked_messages
    on ranked_messages.friend_id = accepted_friends.friend_id
    and ranked_messages.row_number = 1
  left join lateral (
    select count(*)::integer as unread_count
    from public.friend_messages as unread
    where unread.sender_id = accepted_friends.friend_id
      and unread.receiver_id = auth.uid()
      and unread.read_at is null
  ) as unread_messages on true
  order by
    coalesce(ranked_messages.created_at, accepted_friends.responded_at, accepted_friends.created_at) desc;
$$;

create or replace function public.get_chat_messages(
  p_public_id text,
  p_limit integer default 80
)
returns table (
  message_id uuid,
  sender_id uuid,
  receiver_id uuid,
  body text,
  created_at timestamptz,
  read_at timestamptz
)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_public_id text := nullif(lower(btrim(regexp_replace(p_public_id, '^@', ''))), '');
  v_friend_id uuid;
  v_limit integer := greatest(1, least(coalesce(p_limit, 80), 200));
begin
  if v_user_id is null then
    raise exception 'ログインが必要です。' using errcode = '28000';
  end if;

  if v_public_id is null or v_public_id !~ '^[a-z0-9_]{3,20}$' then
    raise exception 'ユーザーIDは3〜20文字の英小文字・数字・_で入力してください。';
  end if;

  select profiles.id
  into v_friend_id
  from public.profiles as profiles
  where profiles.public_id = v_public_id;

  if v_friend_id is null then
    raise exception 'そのユーザーIDのアカウントが見つかりません。';
  end if;

  if not public.are_accepted_friends(v_user_id, v_friend_id) then
    raise exception 'チャットは承認済みのフレンドとだけ使えます。';
  end if;

  return query
    select
      messages.id as message_id,
      messages.sender_id,
      messages.receiver_id,
      messages.body,
      messages.created_at,
      messages.read_at
    from (
      select *
      from public.friend_messages as friend_messages
      where least(friend_messages.sender_id, friend_messages.receiver_id) = least(v_user_id, v_friend_id)
        and greatest(friend_messages.sender_id, friend_messages.receiver_id) = greatest(v_user_id, v_friend_id)
      order by friend_messages.created_at desc
      limit v_limit
    ) as messages
    order by messages.created_at asc;
end;
$$;

create or replace function public.send_friend_message(
  p_public_id text,
  p_body text
)
returns table (
  message_id uuid,
  sender_id uuid,
  receiver_id uuid,
  body text,
  created_at timestamptz,
  read_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_public_id text := nullif(lower(btrim(regexp_replace(p_public_id, '^@', ''))), '');
  v_body text := nullif(btrim(p_body), '');
  v_friend_id uuid;
  v_message public.friend_messages;
begin
  if v_user_id is null then
    raise exception 'ログインが必要です。' using errcode = '28000';
  end if;

  if v_public_id is null or v_public_id !~ '^[a-z0-9_]{3,20}$' then
    raise exception 'ユーザーIDは3〜20文字の英小文字・数字・_で入力してください。';
  end if;

  if v_body is null then
    raise exception 'メッセージを入力してください。';
  end if;

  if char_length(v_body) > 1000 then
    raise exception 'メッセージは1000文字以内にしてください。';
  end if;

  select profiles.id
  into v_friend_id
  from public.profiles as profiles
  where profiles.public_id = v_public_id;

  if v_friend_id is null then
    raise exception 'そのユーザーIDのアカウントが見つかりません。';
  end if;

  if not public.are_accepted_friends(v_user_id, v_friend_id) then
    raise exception 'チャットは承認済みのフレンドとだけ使えます。';
  end if;

  insert into public.friend_messages (sender_id, receiver_id, body)
  values (v_user_id, v_friend_id, v_body)
  returning * into v_message;

  return query
    select
      v_message.id,
      v_message.sender_id,
      v_message.receiver_id,
      v_message.body,
      v_message.created_at,
      v_message.read_at;
end;
$$;

create or replace function public.mark_chat_messages_read(p_public_id text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_public_id text := nullif(lower(btrim(regexp_replace(p_public_id, '^@', ''))), '');
  v_friend_id uuid;
  v_count integer := 0;
begin
  if v_user_id is null then
    raise exception 'ログインが必要です。' using errcode = '28000';
  end if;

  if v_public_id is null or v_public_id !~ '^[a-z0-9_]{3,20}$' then
    raise exception 'ユーザーIDは3〜20文字の英小文字・数字・_で入力してください。';
  end if;

  select profiles.id
  into v_friend_id
  from public.profiles as profiles
  where profiles.public_id = v_public_id;

  if v_friend_id is null then
    raise exception 'そのユーザーIDのアカウントが見つかりません。';
  end if;

  update public.friend_messages
  set read_at = now()
  where sender_id = v_friend_id
    and receiver_id = v_user_id
    and read_at is null;

  get diagnostics v_count = row_count;

  return v_count;
end;
$$;

create or replace function public.get_chat_unread_count()
returns integer
language sql
security definer
stable
set search_path = public
as $$
  select count(*)::integer
  from public.friend_messages
  where receiver_id = auth.uid()
    and read_at is null;
$$;

do $$
begin
  begin
    alter publication supabase_realtime add table public.friend_messages;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
end;
$$;

revoke all on function public.are_accepted_friends(uuid, uuid) from public;
revoke all on function public.get_chat_threads() from public;
revoke all on function public.get_chat_messages(text, integer) from public;
revoke all on function public.send_friend_message(text, text) from public;
revoke all on function public.mark_chat_messages_read(text) from public;
revoke all on function public.get_chat_unread_count() from public;

grant execute on function public.are_accepted_friends(uuid, uuid) to authenticated;
grant execute on function public.get_chat_threads() to authenticated;
grant execute on function public.get_chat_messages(text, integer) to authenticated;
grant execute on function public.send_friend_message(text, text) to authenticated;
grant execute on function public.mark_chat_messages_read(text) to authenticated;
grant execute on function public.get_chat_unread_count() to authenticated;
