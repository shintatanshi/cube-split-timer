create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.solve_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null,
  scramble text not null,
  total_ms integer not null check (total_ms >= 0),
  cross_ms integer check (cross_ms is null or cross_ms >= 0),
  f2l_ms integer check (f2l_ms is null or f2l_ms >= 0),
  oll_ms integer check (oll_ms is null or oll_ms >= 0),
  pll_ms integer check (pll_ms is null or pll_ms >= 0),
  cross_solution text,
  notes text,
  is_dnf boolean not null default false,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists solve_sessions_user_created_idx
  on public.solve_sessions (user_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.solve_sessions enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id and role = 'user');

drop policy if exists "solve_sessions_select_own" on public.solve_sessions;
create policy "solve_sessions_select_own"
  on public.solve_sessions
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "solve_sessions_insert_own" on public.solve_sessions;
create policy "solve_sessions_insert_own"
  on public.solve_sessions
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "solve_sessions_update_own" on public.solve_sessions;
create policy "solve_sessions_update_own"
  on public.solve_sessions
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    'user'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
