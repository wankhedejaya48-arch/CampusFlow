-- CampusFlow baseline: Profile schema compatibility
-- Preserves existing profile records, accommodates legacy profile table structures,
-- and remains safe for fresh installations.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  email text,
  role text not null default 'student',
  department text,
  semester smallint,
  teaching_designation text,
  bio text,
  account_status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Ensure all expected columns exist if the table was pre-existing
alter table public.profiles add column if not exists name text;
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists role text not null default 'student';
alter table public.profiles add column if not exists department text;
alter table public.profiles add column if not exists semester smallint;
alter table public.profiles add column if not exists teaching_designation text;
alter table public.profiles add column if not exists bio text;
alter table public.profiles add column if not exists account_status text not null default 'active';
alter table public.profiles add column if not exists created_at timestamptz not null default now();
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

-- Preserve and migrate existing profile data from legacy columns if present
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'full_name'
  ) then
    execute 'update public.profiles set name = coalesce(nullif(name, ''''), nullif(full_name, '''')) where name is null or name = ''''';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'username'
  ) then
    execute 'update public.profiles set name = coalesce(nullif(name, ''''), nullif(username, '''')) where name is null or name = ''''';
  end if;
end;
$$;

-- Populate email from auth.users if missing
update public.profiles p
set email = u.email
from auth.users u
where p.id = u.id and (p.email is null or p.email = '');

-- Fill fallback names and defaults for any existing rows
update public.profiles
set name = coalesce(nullif(name, ''), split_part(email, '@', 1), 'CampusFlow Member')
where name is null or name = '';

update public.profiles
set role = 'student'
where role is null or role not in ('student', 'teacher', 'admin');

update public.profiles
set account_status = 'active'
where account_status is null or account_status not in ('active', 'disabled');

-- Set column defaults and NOT NULL constraints
alter table public.profiles alter column name set not null;
alter table public.profiles alter column role set default 'student';
alter table public.profiles alter column role set not null;
alter table public.profiles alter column account_status set default 'active';
alter table public.profiles alter column account_status set not null;
alter table public.profiles alter column created_at set default now();
alter table public.profiles alter column created_at set not null;
alter table public.profiles alter column updated_at set default now();
alter table public.profiles alter column updated_at set not null;

-- Add constraints safely if not already present
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass and conname = 'profiles_role_check'
  ) then
    alter table public.profiles add constraint profiles_role_check check (role in ('student', 'teacher', 'admin'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass and conname = 'profiles_account_status_check'
  ) then
    alter table public.profiles add constraint profiles_account_status_check check (account_status in ('active', 'disabled'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass and conname = 'profiles_semester_check'
  ) then
    alter table public.profiles add constraint profiles_semester_check check (semester is null or semester between 1 and 20);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass and conname = 'profiles_email_key'
  ) then
    begin
      alter table public.profiles add constraint profiles_email_key unique (email);
    exception when others then
      null;
    end;
  end if;
end;
$$;
