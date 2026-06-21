create extension if not exists pgcrypto;

alter table public.profiles
  add column if not exists email text;

create index if not exists profiles_role_created_idx
  on public.profiles (role, created_at desc);

create index if not exists profiles_email_lower_idx
  on public.profiles (lower(email))
  where email is not null;

update public.profiles as profiles
set email = users.email
from auth.users as users
where profiles.id = users.id
  and profiles.email is distinct from users.email;

create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (
      select profiles.role = 'admin'
      from public.profiles as profiles
      where profiles.id = auth.uid()
    ),
    false
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id or public.is_admin());

drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin"
  on public.profiles
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "solve_sessions_select_own" on public.solve_sessions;
drop policy if exists "solve_sessions_select_own_or_admin" on public.solve_sessions;
create policy "solve_sessions_select_own_or_admin"
  on public.solve_sessions
  for select
  to authenticated
  using (auth.uid() = user_id or public.is_admin());

drop policy if exists "solve_sessions_insert_own" on public.solve_sessions;
create policy "solve_sessions_insert_own"
  on public.solve_sessions
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "solve_sessions_update_own" on public.solve_sessions;
drop policy if exists "solve_sessions_update_own_or_admin" on public.solve_sessions;
create policy "solve_sessions_update_own_or_admin"
  on public.solve_sessions
  for update
  to authenticated
  using (auth.uid() = user_id or public.is_admin())
  with check (auth.uid() = user_id or public.is_admin());

drop policy if exists "feedback_reports_select_admin" on public.feedback_reports;
create policy "feedback_reports_select_admin"
  on public.feedback_reports
  for select
  to authenticated
  using (public.is_admin());

drop policy if exists "feedback_reports_update_admin" on public.feedback_reports;
create policy "feedback_reports_update_admin"
  on public.feedback_reports
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    new.email,
    'user'
  )
  on conflict (id) do update
    set email = excluded.email,
        display_name = coalesce(public.profiles.display_name, excluded.display_name);

  return new;
end;
$$;

create or replace function public.sync_user_profile_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set email = new.email
  where id = new.id;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

drop trigger if exists on_auth_user_updated_sync_profile on auth.users;
create trigger on_auth_user_updated_sync_profile
  after update of email on auth.users
  for each row execute function public.sync_user_profile_email();
