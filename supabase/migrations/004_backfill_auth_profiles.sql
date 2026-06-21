alter table public.profiles
  add column if not exists email text;

insert into public.profiles (id, display_name, email, role, created_at)
select
  users.id,
  coalesce(users.raw_user_meta_data ->> 'display_name', split_part(users.email, '@', 1)),
  users.email,
  'user',
  users.created_at
from auth.users as users
where not exists (
  select 1
  from public.profiles as profiles
  where profiles.id = users.id
);

update public.profiles as profiles
set email = users.email,
    display_name = coalesce(profiles.display_name, users.raw_user_meta_data ->> 'display_name', split_part(users.email, '@', 1))
from auth.users as users
where profiles.id = users.id
  and (
    profiles.email is distinct from users.email
    or profiles.display_name is null
  );
