-- Cue Check shared database setup
-- Run this entire file once in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.cuecheck_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'staff' check (role in ('admin', 'staff')),
  created_at timestamptz not null default now()
);

create or replace function public.cuecheck_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.cuecheck_profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.cuecheck_create_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.cuecheck_profiles (id, email, role)
  values (new.id, new.email, 'staff')
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists cuecheck_auth_user_created on auth.users;
create trigger cuecheck_auth_user_created
after insert on auth.users
for each row execute procedure public.cuecheck_create_profile();

create table if not exists public.cuecheck_config (
  id boolean primary key default true check (id = true),
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create table if not exists public.cuecheck_checks (
  id uuid primary key,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

alter table public.cuecheck_profiles enable row level security;
alter table public.cuecheck_config enable row level security;
alter table public.cuecheck_checks enable row level security;

drop policy if exists "Profiles visible to self and admins" on public.cuecheck_profiles;
create policy "Profiles visible to self and admins"
on public.cuecheck_profiles for select to authenticated
using (id = auth.uid() or public.cuecheck_is_admin());

drop policy if exists "Admins can update profiles" on public.cuecheck_profiles;
create policy "Admins can update profiles"
on public.cuecheck_profiles for update to authenticated
using (public.cuecheck_is_admin())
with check (public.cuecheck_is_admin());

drop policy if exists "Signed-in staff can read shared config" on public.cuecheck_config;
create policy "Signed-in staff can read shared config"
on public.cuecheck_config for select to authenticated using (true);

drop policy if exists "Signed-in staff can create shared config" on public.cuecheck_config;
create policy "Signed-in staff can create shared config"
on public.cuecheck_config for insert to authenticated with check (true);

drop policy if exists "Signed-in staff can update shared config" on public.cuecheck_config;
create policy "Signed-in staff can update shared config"
on public.cuecheck_config for update to authenticated using (true) with check (true);

drop policy if exists "Signed-in staff can read shared checks" on public.cuecheck_checks;
create policy "Signed-in staff can read shared checks"
on public.cuecheck_checks for select to authenticated using (true);

drop policy if exists "Signed-in staff can create shared checks" on public.cuecheck_checks;
create policy "Signed-in staff can create shared checks"
on public.cuecheck_checks for insert to authenticated with check (true);

drop policy if exists "Signed-in staff can update shared checks" on public.cuecheck_checks;
create policy "Signed-in staff can update shared checks"
on public.cuecheck_checks for update to authenticated using (true) with check (true);

drop policy if exists "Signed-in staff can delete shared checks" on public.cuecheck_checks;
create policy "Signed-in staff can delete shared checks"
on public.cuecheck_checks for delete to authenticated using (true);

grant usage on schema public to authenticated;
grant select, update on public.cuecheck_profiles to authenticated;
grant select, insert, update on public.cuecheck_config to authenticated;
grant select, insert, update, delete on public.cuecheck_checks to authenticated;

-- Enable realtime updates for staff using the app on multiple devices.
do $$
begin
  alter publication supabase_realtime add table public.cuecheck_config;
exception when duplicate_object then null;
when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.cuecheck_checks;
exception when duplicate_object then null;
when undefined_object then null;
end $$;

-- IMPORTANT: After creating your first staff account, promote that account
-- to administrator by running this separately with its exact email:
-- update public.cuecheck_profiles set role = 'admin'
-- where email = 'YOUR_ADMIN_EMAIL_HERE';
