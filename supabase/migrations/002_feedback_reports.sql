create extension if not exists pgcrypto;

create table if not exists public.feedback_reports (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('bug', 'request', 'other')),
  message text not null check (length(trim(message)) between 1 and 4000),
  contact text check (contact is null or length(contact) <= 240),
  page_path text,
  current_scramble text,
  timer_mode text,
  user_agent text,
  status text not null default 'open' check (status in ('open', 'reviewing', 'resolved', 'archived')),
  created_at timestamptz not null default now()
);

create index if not exists feedback_reports_created_idx
  on public.feedback_reports (created_at desc);

alter table public.feedback_reports enable row level security;

drop policy if exists "feedback_reports_insert_public" on public.feedback_reports;
create policy "feedback_reports_insert_public"
  on public.feedback_reports
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists "feedback_reports_select_admin" on public.feedback_reports;
create policy "feedback_reports_select_admin"
  on public.feedback_reports
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

drop policy if exists "feedback_reports_update_admin" on public.feedback_reports;
create policy "feedback_reports_update_admin"
  on public.feedback_reports
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  )
  with check (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );
