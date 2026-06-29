alter table public.profiles
  add column if not exists public_id text,
  add column if not exists public_id_changed_at timestamptz;

drop index if exists profiles_public_id_key;
create unique index profiles_public_id_key
  on public.profiles (public_id)
  where public_id is not null;

alter table public.profiles
  drop constraint if exists profiles_public_id_format;

alter table public.profiles
  add constraint profiles_public_id_format
  check (public_id is null or public_id ~ '^[a-z0-9_]{3,20}$');

create or replace function public.update_my_profile(
  p_display_name text,
  p_public_id text
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := now();
  v_display_name text := nullif(btrim(p_display_name), '');
  v_public_id text := nullif(lower(btrim(p_public_id)), '');
  v_profile public.profiles;
  v_unlock_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'ログインが必要です。' using errcode = '28000';
  end if;

  if v_display_name is not null and char_length(v_display_name) > 40 then
    raise exception 'ユーザー名は40文字以内にしてください。';
  end if;

  if v_public_id is not null and v_public_id !~ '^[a-z0-9_]{3,20}$' then
    raise exception 'ユーザーIDは3〜20文字の英小文字・数字・_で入力してください。';
  end if;

  insert into public.profiles (id, display_name, email, role)
  select
    users.id,
    coalesce(users.raw_user_meta_data ->> 'display_name', split_part(users.email, '@', 1)),
    users.email,
    'user'
  from auth.users as users
  where users.id = v_user_id
  on conflict (id) do nothing;

  select *
  into v_profile
  from public.profiles
  where id = v_user_id
  for update;

  if not found then
    raise exception 'プロフィールを更新できませんでした。';
  end if;

  if v_public_id is distinct from v_profile.public_id then
    if v_profile.public_id_changed_at is not null
      and v_profile.public_id_changed_at > v_now - interval '3 days' then
      v_unlock_at := v_profile.public_id_changed_at + interval '3 days';

      raise exception 'ユーザーIDは3日に1回だけ変更できます。%以降に変更できます。',
        to_char(v_unlock_at at time zone 'Asia/Tokyo', 'YYYY-MM-DD HH24:MI');
    end if;

    update public.profiles
    set
      display_name = v_display_name,
      public_id = v_public_id,
      public_id_changed_at = v_now
    where id = v_user_id
    returning * into v_profile;
  else
    update public.profiles
    set display_name = v_display_name
    where id = v_user_id
    returning * into v_profile;
  end if;

  return v_profile;
exception
  when unique_violation then
    raise exception 'このユーザーIDはすでに使われています。' using errcode = '23505';
end;
$$;

revoke all on function public.update_my_profile(text, text) from public;
grant execute on function public.update_my_profile(text, text) to authenticated;
