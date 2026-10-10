-- CampusFlow Schema Foundation Reference
--
-- Live Migration Baseline:
-- The live Supabase project (rhwoegbwmavtiltxyobs) is initialized with the following baseline migrations:
--   1. 20261010094832_campusflow_profile_schema_compat.sql
--   2. 20261010095425_campusflow_full_schema.sql
--   3. 20261010095830_campusflow_final_live_policy_alignment.sql
--
-- Migration History & Fresh Installation Order:
-- For fresh installations, execute the migration files under supabase/migrations/ in strictly
-- increasing 14-digit timestamp order (from 20261010094832 through 20261010101100).
-- For the live project (rhwoegbwmavtiltxyobs), the baseline migrations are already applied;
-- do not run destructive resets, do not run `supabase db push`, and do not alter existing roles.
--
-- Environment & Key Security:
-- - The .env file is local-only and must never be committed to source control.
-- - The browser/client application must never contain or expose a service-role key.
-- - All client requests rely on the public anon/publishable key and are secured by Row Level Security (RLS).
-- This schema does not import browser localStorage, IndexedDB, demo accounts, or mock rows.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text not null unique,
  role text not null default 'student' check (role in ('student', 'teacher', 'admin')),
  department text,
  semester smallint check (semester is null or semester between 1 and 20),
  teaching_designation text,
  bio text,
  account_status text not null default 'active' check (account_status in ('active', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.classrooms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  subject text not null,
  department text not null,
  semester smallint not null check (semester between 1 and 20),
  teacher_id uuid not null references public.profiles(id) on delete restrict,
  share_code text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.resources (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  subject text not null,
  semester smallint not null check (semester between 1 and 20),
  department text not null,
  resource_type text not null,
  tags text[] not null default '{}',
  uploader_id uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  visibility text not null default 'public' check (visibility in ('public', 'department', 'classroom')),
  classroom_id uuid references public.classrooms(id) on delete set null,
  storage_path text,
  original_file_name text,
  mime_type text,
  file_size bigint check (file_size is null or file_size >= 0),
  views bigint not null default 0 check (views >= 0),
  downloads bigint not null default 0 check (downloads >= 0),
  rating numeric(2, 1) not null default 0 check (rating between 0 and 5),
  rating_count integer not null default 0 check (rating_count >= 0),
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((visibility <> 'classroom') or classroom_id is not null),
  check ((storage_path is null) = (original_file_name is null))
);

create table if not exists public.classroom_members (
  classroom_id uuid not null references public.classrooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'student' check (role in ('teacher', 'student')),
  joined_at timestamptz not null default now(),
  primary key (classroom_id, user_id)
);

alter table public.classroom_members
  add column if not exists role text not null default 'student';
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.classroom_members'::regclass and conname = 'classroom_members_role_check'
  ) then
    alter table public.classroom_members add constraint classroom_members_role_check check (role in ('teacher', 'student'));
  end if;
end;
$$;
update public.classroom_members m
set role = case when c.teacher_id = m.user_id then 'teacher' else 'student' end
from public.classrooms c where c.id = m.classroom_id;
insert into public.classroom_members (classroom_id, user_id, role)
select c.id, c.teacher_id, 'teacher' from public.classrooms c
on conflict (classroom_id, user_id) do update set role = 'teacher';

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references public.classrooms(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete restrict,
  title text not null,
  message text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.classroom_resources (
  classroom_id uuid not null references public.classrooms(id) on delete cascade,
  resource_id uuid not null references public.resources(id) on delete cascade,
  shared_by uuid not null references public.profiles(id) on delete restrict,
  shared_at timestamptz not null default now(),
  primary key (classroom_id, resource_id)
);

create or replace function public.set_announcement_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.set_announcement_updated_at() from public, anon, authenticated;
drop trigger if exists announcements_set_updated_at on public.announcements;
create trigger announcements_set_updated_at before update on public.announcements
for each row execute function public.set_announcement_updated_at();

create table if not exists public.resource_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  requester_name text not null default 'CampusFlow Member',
  title text not null,
  subject text not null,
  semester smallint not null check (semester between 1 and 20),
  resource_type text not null,
  description text not null default '',
  status text not null default 'open' check (status in ('open', 'fulfilled', 'closed')),
  responses integer not null default 0 check (responses >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.enforce_resource_request_fields()
returns trigger language plpgsql set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_active_user() then
    raise exception 'An active signed-in profile is required';
  end if;
  if tg_op = 'INSERT' then
    if new.requester_id <> auth.uid() then raise exception 'A request must belong to the authenticated user'; end if;
    select coalesce(nullif(p.name, ''), 'CampusFlow Member') into new.requester_name
    from public.profiles p where p.id = auth.uid();
    if not found then raise exception 'An active profile is required to create a request'; end if;
    new.status := 'open';
    new.responses := 0;
    new.created_at := now();
    new.updated_at := now();
  else
    if new.requester_id is distinct from old.requester_id then raise exception 'Request ownership cannot be changed'; end if;
    if new.status is distinct from old.status and not public.is_admin() then
      raise exception 'Only an administrator can change request status';
    end if;
    new.id := old.id;
    new.requester_name := old.requester_name;
    new.responses := old.responses;
    new.created_at := old.created_at;
    new.updated_at := now();
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_resource_request_fields() from public, anon, authenticated;
drop trigger if exists resource_requests_enforce_fields on public.resource_requests;
create trigger resource_requests_enforce_fields before insert or update on public.resource_requests
for each row execute function public.enforce_resource_request_fields();

create table if not exists public.favorites (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  resource_id uuid not null references public.resources(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, resource_id),
  constraint favorites_id_key unique (id)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('upload', 'request', 'classroom', 'verification', 'download', 'announcement')),
  title text not null,
  message text not null,
  related_resource_id uuid references public.resources(id) on delete set null,
  related_classroom_id uuid references public.classrooms(id) on delete set null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid references public.resources(id) on delete set null,
  resource_title text not null default 'Resource unavailable',
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null,
  description text not null default '',
  status text not null default 'open' check (status in ('open', 'dismissed', 'removed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null,
  unique (resource_id, reporter_id)
);

create or replace function public.capture_report_resource_title()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.reason not in ('Incorrect content', 'Spam', 'Inappropriate content', 'Duplicate resource', 'Copyright concern', 'Other') then
    raise exception 'Unsupported report reason';
  end if;
  if pg_catalog.length(new.description) > 2000 then raise exception 'Report description must be 2000 characters or fewer'; end if;
  new.resource_title := null;
  select r.title into new.resource_title from public.resources r where r.id = new.resource_id;
  if new.resource_title is null then raise exception 'The reported resource is unavailable'; end if;
  if auth.uid() is not null then
    new.status := 'open';
    new.created_at := pg_catalog.now();
    new.resolved_at := null;
    new.resolved_by := null;
  end if;
  return new;
end;
$$;
revoke all on function public.capture_report_resource_title() from public, anon, authenticated;
drop trigger if exists reports_capture_resource_title on public.reports;
create trigger reports_capture_resource_title before insert on public.reports
for each row execute function public.capture_report_resource_title();

create table if not exists public.moderation_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.profiles(id) on delete restrict,
  action text not null,
  target_type text not null,
  target_id text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists resources_browse_idx on public.resources (status, visibility, department, semester, created_at desc);
create index if not exists resources_uploader_idx on public.resources (uploader_id, created_at desc);
create index if not exists classroom_members_user_idx on public.classroom_members (user_id, classroom_id);
create index if not exists classrooms_teacher_idx on public.classrooms (teacher_id);
create unique index if not exists classrooms_share_code_key on public.classrooms (share_code);
create index if not exists announcements_classroom_idx on public.announcements (classroom_id, created_at desc);
create index if not exists requests_status_idx on public.resource_requests (status, created_at desc);
create index if not exists requests_requester_idx on public.resource_requests (requester_id, created_at desc);
create index if not exists favorites_user_idx on public.favorites (user_id, created_at desc);
create index if not exists favorites_resource_idx on public.favorites (resource_id);
create index if not exists notifications_user_idx on public.notifications (user_id, read, created_at desc);
create index if not exists notifications_user_unread_created_idx on public.notifications (user_id, created_at desc) where read = false;
create index if not exists reports_status_idx on public.reports (status, created_at desc);

-- Foreign-key indexes added during live verification to optimize joins and cascading operations
create index if not exists resources_classroom_idx on public.resources (classroom_id);
create index if not exists announcements_teacher_idx on public.announcements (teacher_id);
create index if not exists classroom_resources_resource_idx on public.classroom_resources (resource_id);
create index if not exists classroom_resources_shared_by_idx on public.classroom_resources (shared_by);
create index if not exists notifications_related_resource_idx on public.notifications (related_resource_id);
create index if not exists notifications_related_classroom_idx on public.notifications (related_classroom_id);
create index if not exists reports_reporter_idx on public.reports (reporter_id);
create index if not exists reports_resolved_by_idx on public.reports (resolved_by);
create index if not exists moderation_logs_admin_idx on public.moderation_logs (admin_id);

-- SECURITY DEFINER helpers avoid recursive RLS checks on profiles/memberships.
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin' and p.account_status = 'active');
$$;

create or replace function public.is_active_user()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.account_status = 'active');
$$;

create or replace function public.owns_classroom(target_classroom_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.classrooms c where c.id = target_classroom_id and c.teacher_id = (select auth.uid()));
$$;

create or replace function public.is_classroom_member(target_classroom_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.classroom_members m where m.classroom_id = target_classroom_id and m.user_id = (select auth.uid()));
$$;

revoke all on function public.is_admin() from public, anon;
revoke all on function public.is_active_user() from public, anon;
revoke all on function public.owns_classroom(uuid) from public, anon;
revoke all on function public.is_classroom_member(uuid) from public, anon;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_active_user() to authenticated;
grant execute on function public.owns_classroom(uuid) to authenticated;
grant execute on function public.is_classroom_member(uuid) to authenticated;

create or replace function public.enforce_resource_insert_fields()
returns trigger language plpgsql set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_active_user() then
    raise exception 'An active signed-in profile is required';
  end if;
  if new.uploader_id is distinct from auth.uid() then
    raise exception 'A resource must belong to the authenticated user';
  end if;
  if new.classroom_id is not null and not (
    public.owns_classroom(new.classroom_id) or public.is_classroom_member(new.classroom_id)
  ) then
    raise exception 'You must belong to the selected classroom';
  end if;
  new.status := 'pending';
  new.views := 0;
  new.downloads := 0;
  new.rating := 0;
  new.rating_count := 0;
  new.rejection_reason := null;
  new.created_at := pg_catalog.now();
  new.updated_at := new.created_at;
  if new.storage_path is null then
    new.original_file_name := null;
    new.mime_type := null;
    new.file_size := null;
  elsif pg_catalog.cardinality(storage.foldername(new.storage_path)) <> 1
    or (storage.foldername(new.storage_path))[1] <> auth.uid()::text
    or pg_catalog.lower(storage.extension(new.storage_path)) not in ('pdf', 'ppt', 'pptx', 'doc', 'docx', 'xlsx', 'zip')
    or pg_catalog.lower(storage.extension(new.storage_path)) <> pg_catalog.lower(pg_catalog.split_part(new.original_file_name, '.', pg_catalog.array_length(pg_catalog.string_to_array(new.original_file_name, '.'), 1)))
    or pg_catalog.length(pg_catalog.btrim(new.original_file_name)) = 0
    or new.file_size is null or new.file_size < 1 or new.file_size > 20971520
    or new.mime_type is null then
    raise exception 'Resource file metadata or Storage path is invalid';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_resource_insert_fields() from public, anon, authenticated;
drop trigger if exists resources_enforce_insert_fields on public.resources;
create trigger resources_enforce_insert_fields before insert on public.resources
for each row execute function public.enforce_resource_insert_fields();

-- Classroom event notifications retain the existing local notification behavior.
create or replace function public.notify_classroom_created()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or new.teacher_id is distinct from auth.uid() then return new; end if;
  insert into public.notifications (user_id, type, title, message, related_classroom_id)
  values (new.teacher_id, 'classroom', 'Classroom Created',
    new.name || ' is ready. Share code ' || new.share_code || ' with students.', new.id);
  return new;
end;
$$;
revoke all on function public.notify_classroom_created() from public, anon, authenticated;
drop trigger if exists notify_classroom_created on public.classrooms;
create trigger notify_classroom_created after insert on public.classrooms
for each row execute function public.notify_classroom_created();

create or replace function public.notify_classroom_joined()
returns trigger language plpgsql security definer set search_path = '' as $$
declare classroom_name text;
begin
  if auth.uid() is null or new.user_id is distinct from auth.uid() or new.role <> 'student' then return new; end if;
  select c.name into classroom_name from public.classrooms c where c.id = new.classroom_id;
  if classroom_name is not null then
    insert into public.notifications (user_id, type, title, message, related_classroom_id)
    values (new.user_id, 'classroom', 'Joined Classroom Successfully', 'You joined ' || classroom_name || '.', new.classroom_id);
  end if;
  return new;
end;
$$;
revoke all on function public.notify_classroom_joined() from public, anon, authenticated;
drop trigger if exists notify_classroom_joined on public.classroom_members;
create trigger notify_classroom_joined after insert on public.classroom_members
for each row execute function public.notify_classroom_joined();

create or replace function public.notify_classroom_resource_shared()
returns trigger language plpgsql security definer set search_path = '' as $$
declare classroom_name text; resource_title text;
begin
  if auth.uid() is null or new.shared_by is distinct from auth.uid() then return new; end if;
  select c.name into classroom_name from public.classrooms c where c.id = new.classroom_id;
  select r.title into resource_title from public.resources r where r.id = new.resource_id;
  if classroom_name is not null and resource_title is not null then
    insert into public.notifications (user_id, type, title, message, related_resource_id, related_classroom_id)
    select m.user_id, 'classroom', 'New resource in ' || classroom_name, resource_title, new.resource_id, new.classroom_id
    from public.classroom_members m
    join public.profiles p on p.id = m.user_id and p.account_status = 'active'
    where m.classroom_id = new.classroom_id and m.user_id <> new.shared_by;
  end if;
  return new;
end;
$$;
revoke all on function public.notify_classroom_resource_shared() from public, anon, authenticated;
drop trigger if exists notify_classroom_resource_shared on public.classroom_resources;
create trigger notify_classroom_resource_shared after insert on public.classroom_resources
for each row execute function public.notify_classroom_resource_shared();

create or replace function public.notify_classroom_announcement()
returns trigger language plpgsql security definer set search_path = '' as $$
declare classroom_name text;
begin
  if auth.uid() is null or new.teacher_id is distinct from auth.uid() then return new; end if;
  select c.name into classroom_name from public.classrooms c where c.id = new.classroom_id;
  if classroom_name is not null then
    insert into public.notifications (user_id, type, title, message, related_classroom_id)
    select m.user_id, 'announcement', new.title || ' · ' || classroom_name, new.message, new.classroom_id
    from public.classroom_members m
    join public.profiles p on p.id = m.user_id and p.account_status = 'active'
    where m.classroom_id = new.classroom_id;
  end if;
  return new;
end;
$$;
revoke all on function public.notify_classroom_announcement() from public, anon, authenticated;
drop trigger if exists notify_classroom_announcement on public.announcements;
create trigger notify_classroom_announcement after insert on public.announcements
for each row execute function public.notify_classroom_announcement();

create or replace function public.create_admin_verification_notification(
  target_user_id uuid, notification_title text, notification_message text
)
returns public.notifications language plpgsql security definer set search_path = '' as $$
declare created_notification public.notifications;
begin
  if auth.uid() is null or not public.is_active_user() or not public.is_admin() then
    raise exception 'Only active administrators may create verification notifications';
  end if;
  if target_user_id is null or not exists (select 1 from public.profiles p where p.id = target_user_id) then
    raise exception 'The notification recipient does not exist';
  end if;
  if notification_title is null or pg_catalog.length(pg_catalog.btrim(notification_title)) = 0
    or pg_catalog.length(notification_title) > 160
    or notification_message is null or pg_catalog.length(pg_catalog.btrim(notification_message)) = 0
    or pg_catalog.length(notification_message) > 2000 then
    raise exception 'A valid notification title and message are required';
  end if;
  insert into public.notifications (user_id, type, title, message)
  values (target_user_id, 'verification', pg_catalog.btrim(notification_title), pg_catalog.btrim(notification_message))
  returning * into created_notification;
  return created_notification;
end;
$$;
revoke all on function public.create_admin_verification_notification(uuid, text, text) from public, anon;
grant execute on function public.create_admin_verification_notification(uuid, text, text) to authenticated;

-- Joining is performed through this RPC so clients cannot insert memberships for another user.
create or replace function public.create_classroom(classroom_name text, classroom_subject text, classroom_department text, classroom_semester smallint)
returns uuid language plpgsql security definer set search_path = '' as $$
declare new_id uuid; new_code text;
begin
  if auth.uid() is null or not public.is_active_user() then raise exception 'An active signed-in profile is required'; end if;
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'teacher' and p.account_status = 'active') then
    raise exception 'Only active teachers may create classrooms';
  end if;
  if length(trim(classroom_name)) = 0 or length(trim(classroom_subject)) = 0 or length(trim(classroom_department)) = 0 then
    raise exception 'Classroom name, subject, and department are required';
  end if;
  if classroom_semester < 1 or classroom_semester > 20 then raise exception 'Choose a valid semester'; end if;

  loop
    new_code := 'CF' || upper(substr(replace(pg_catalog.gen_random_uuid()::text, '-', ''), 1, 10));
    begin
      insert into public.classrooms (name, subject, department, semester, teacher_id, share_code)
      values (trim(classroom_name), trim(classroom_subject), trim(classroom_department), classroom_semester, auth.uid(), new_code)
      returning id into new_id;
      exit;
    exception when unique_violation then
      -- The unique share_code constraint is the authority; retry only on a collision.
      if exists (select 1 from public.classrooms c where c.share_code = new_code) then continue; end if;
      raise;
    end;
  end loop;

  insert into public.classroom_members (classroom_id, user_id, role)
  values (new_id, auth.uid(), 'teacher');
  return new_id;
end;
$$;

create or replace function public.join_classroom_with_code(requested_share_code text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare target_id uuid; inserted_id uuid;
begin
  if auth.uid() is null or not public.is_active_user() then raise exception 'An active signed-in profile is required'; end if;
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'student' and p.account_status = 'active') then raise exception 'Only active students may join classrooms'; end if;
  select c.id into target_id from public.classrooms c where upper(c.share_code) = upper(trim(requested_share_code));
  if target_id is null then raise exception 'No classroom matches that code'; end if;
  insert into public.classroom_members (classroom_id, user_id, role)
  values (target_id, auth.uid(), 'student')
  on conflict (classroom_id, user_id) do nothing
  returning classroom_id into inserted_id;
  if inserted_id is null then raise exception 'You have already joined this classroom'; end if;
  return target_id;
end;
$$;

create or replace function public.leave_classroom(target_classroom_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare removed_id uuid;
begin
  if auth.uid() is null or not public.is_active_user() then raise exception 'An active signed-in profile is required'; end if;
  if public.owns_classroom(target_classroom_id) then raise exception 'Classroom owners cannot leave their own classroom'; end if;
  delete from public.classroom_members m
  where m.classroom_id = target_classroom_id and m.user_id = auth.uid()
  returning m.classroom_id into removed_id;
  if removed_id is null then raise exception 'You are not a member of this classroom'; end if;
end;
$$;

create or replace function public.get_classroom_member_directory(target_classroom_ids uuid[])
returns table (classroom_id uuid, user_id uuid, role text, joined_at timestamptz, name text)
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_active_user() then raise exception 'An active signed-in profile is required'; end if;
  if exists (
    select 1 from unnest(target_classroom_ids) requested(id)
    where not (public.is_admin() or public.owns_classroom(requested.id) or public.is_classroom_member(requested.id))
  ) then raise exception 'You do not have access to one or more classroom membership lists'; end if;
  return query
    select m.classroom_id, m.user_id, m.role, m.joined_at, p.name
    from public.classroom_members m join public.profiles p on p.id = m.user_id
    where m.classroom_id = any(target_classroom_ids)
    order by m.classroom_id, case when m.role = 'teacher' then 0 else 1 end, m.joined_at;
end;
$$;

revoke all on function public.create_classroom(text, text, text, smallint) from public, anon;
grant execute on function public.create_classroom(text, text, text, smallint) to authenticated;
revoke all on function public.join_classroom_with_code(text) from public, anon;
grant execute on function public.join_classroom_with_code(text) to authenticated;
revoke all on function public.leave_classroom(uuid) from public, anon;
grant execute on function public.leave_classroom(uuid) to authenticated;
revoke all on function public.get_classroom_member_directory(uuid[]) from public, anon;
grant execute on function public.get_classroom_member_directory(uuid[]) to authenticated;

-- Roles are provisioned out of band; client updates cannot assign administrator access.
create or replace function public.protect_profile_privileges()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and (
    new.id is distinct from old.id or new.email is distinct from old.email or new.role is distinct from old.role
  ) then
    raise exception 'Profile identity and role fields cannot be changed through the client';
  end if;
  if new.account_status is distinct from old.account_status and (
    (auth.uid() is not null and (not public.is_admin() or old.id = auth.uid() or old.role = 'admin'))
  ) then
    raise exception 'Only an administrator may change the status of another non-admin account';
  end if;
  return new;
end;
$$;
revoke all on function public.protect_profile_privileges() from public, anon, authenticated;
drop trigger if exists profiles_protect_privileges on public.profiles;
create trigger profiles_protect_privileges before update on public.profiles
for each row execute function public.protect_profile_privileges();

create or replace function public.admin_set_account_status(target_user_id uuid, next_status text)
returns public.profiles language plpgsql security definer set search_path = '' as $$
declare updated_profile public.profiles;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access required'; end if;
  if next_status is null or next_status not in ('active', 'disabled') then raise exception 'Unsupported account status'; end if;
  if target_user_id is null or target_user_id = auth.uid() then raise exception 'Administrators cannot change their own account status'; end if;
  update public.profiles p set account_status = next_status, updated_at = pg_catalog.now()
  where p.id = target_user_id and p.role <> 'admin'
  returning p.* into updated_profile;
  if updated_profile.id is null then raise exception 'User not found or account status cannot be changed'; end if;
  return updated_profile;
end;
$$;
revoke all on function public.admin_set_account_status(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_set_account_status(uuid, text) to authenticated;

drop policy if exists resources_update_uploader_or_admin on public.resources;
revoke update on table public.resources from authenticated;
create or replace function public.admin_moderate_resource(
  target_resource_id uuid, target_status text, target_rejection_reason text default null
)
returns public.resources language plpgsql security definer set search_path = '' as $$
declare updated_resource public.resources;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access required'; end if;
  if target_status is null or target_status not in ('approved', 'rejected') then raise exception 'Unsupported resource review status'; end if;
  if target_status = 'rejected' and pg_catalog.length(coalesce(target_rejection_reason, '')) > 300 then
    raise exception 'Rejection reason must be 300 characters or fewer';
  end if;
  update public.resources r set status = target_status,
    rejection_reason = case when target_status = 'rejected' then nullif(pg_catalog.btrim(target_rejection_reason), '') else null end,
    updated_at = pg_catalog.now()
  where r.id = target_resource_id and r.status = 'pending'
  returning r.* into updated_resource;
  if updated_resource.id is null then raise exception 'Pending resource not found'; end if;
  return updated_resource;
end;
$$;
revoke all on function public.admin_moderate_resource(uuid, text, text) from public, anon, authenticated;
grant execute on function public.admin_moderate_resource(uuid, text, text) to authenticated;

drop policy if exists reports_update_admin on public.reports;
drop policy if exists reports_delete_admin on public.reports;
create or replace function public.admin_resolve_report(target_report_id uuid, target_status text)
returns public.reports language plpgsql security definer set search_path = '' as $$
declare updated_report public.reports;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access required'; end if;
  if target_status is distinct from 'dismissed' then raise exception 'Only open reports may be dismissed through this action'; end if;
  update public.reports r set status = target_status, resolved_at = pg_catalog.now(), resolved_by = auth.uid()
  where r.id = target_report_id and r.status = 'open'
  returning r.* into updated_report;
  if updated_report.id is null then raise exception 'Open report not found'; end if;
  return updated_report;
end;
$$;
revoke all on function public.admin_resolve_report(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_resolve_report(uuid, text) to authenticated;

drop policy if exists resources_delete_owner_admin on public.resources;
drop policy if exists resources_delete_admin on public.resources;
create or replace function public.admin_remove_reported_resource(target_resource_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare removed_storage_path text;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access required'; end if;
  if not exists (select 1 from public.reports r where r.resource_id = target_resource_id and r.status = 'open') then
    raise exception 'Only a resource with an open report can be removed here';
  end if;
  update public.reports r set status = 'removed', resolved_at = pg_catalog.now(), resolved_by = auth.uid()
  where r.resource_id = target_resource_id and r.status = 'open';
  delete from public.resources r where r.id = target_resource_id returning r.storage_path into removed_storage_path;
  if not found then raise exception 'Resource not found'; end if;
  return removed_storage_path;
end;
$$;
revoke all on function public.admin_remove_reported_resource(uuid) from public, anon, authenticated;
grant execute on function public.admin_remove_reported_resource(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.classrooms enable row level security;
alter table public.resources enable row level security;
alter table public.classroom_members enable row level security;
alter table public.announcements enable row level security;
alter table public.classroom_resources enable row level security;
alter table public.resource_requests enable row level security;
alter table public.favorites enable row level security;
alter table public.notifications enable row level security;
alter table public.reports enable row level security;
alter table public.moderation_logs enable row level security;

-- Profiles: users create only their own non-admin profile; users update their own profile; admins manage profiles.
create policy profiles_select_self_admin on public.profiles for select to authenticated using (id = (select auth.uid()) or public.is_admin());
create policy profiles_insert_self_nonadmin on public.profiles for insert to authenticated with check (id = (select auth.uid()) and role in ('student', 'teacher') and account_status = 'active');
create policy profiles_update_self on public.profiles for update to authenticated using (id = (select auth.uid()) and public.is_active_user()) with check (id = (select auth.uid()) and public.is_active_user());
drop policy if exists profiles_delete_admin on public.profiles;
revoke delete on table public.profiles from authenticated;

-- Resources: pending/private records remain visible to uploader/admin; classroom content requires membership/ownership.
create policy resources_select_authorized on public.resources for select to authenticated using (
  public.is_active_user() and (public.is_admin() or uploader_id = (select auth.uid()) or
  (status = 'approved' and visibility = 'public') or
  (status = 'approved' and visibility = 'department' and exists (
    select 1 from public.profiles p where p.id = (select auth.uid()) and p.department = resources.department
  )) or
  (status = 'approved' and visibility = 'classroom' and classroom_id is not null and
    (public.is_classroom_member(classroom_id) or public.owns_classroom(classroom_id))) or
  exists (select 1 from public.classroom_resources cr where cr.resource_id = resources.id and
    (public.is_classroom_member(cr.classroom_id) or public.owns_classroom(cr.classroom_id)))
  )
);
create policy resources_insert_owner on public.resources for insert to authenticated with check (
  uploader_id = (select auth.uid()) and public.is_active_user() and status = 'pending'
);
create policy resources_delete_owner on public.resources for delete to authenticated
using (public.is_active_user() and uploader_id = (select auth.uid()));

-- Counter writes are atomic and limited to resources the caller can already access.
create or replace function public.increment_resource_counter(target_resource_id uuid, counter_name text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare updated_count bigint;
begin
  if auth.uid() is null or not public.is_active_user() then
    raise exception 'An active signed-in profile is required';
  end if;
  if counter_name not in ('views', 'downloads') then
    raise exception 'Unsupported resource counter';
  end if;

  update public.resources r
  set views = r.views + case when counter_name = 'views' then 1 else 0 end,
      downloads = r.downloads + case when counter_name = 'downloads' then 1 else 0 end,
      updated_at = now()
  where r.id = target_resource_id and (
    public.is_admin() or r.uploader_id = auth.uid() or
    (r.status = 'approved' and r.visibility = 'public') or
    (r.status = 'approved' and r.visibility = 'department' and exists (
      select 1 from public.profiles p where p.id = auth.uid() and p.department = r.department
    )) or
    (r.status = 'approved' and r.visibility = 'classroom' and r.classroom_id is not null and
      (public.is_classroom_member(r.classroom_id) or public.owns_classroom(r.classroom_id))) or
    exists (select 1 from public.classroom_resources cr where cr.resource_id = r.id and
      (public.is_classroom_member(cr.classroom_id) or public.owns_classroom(cr.classroom_id)))
  )
  returning case when counter_name = 'views' then r.views else r.downloads end into updated_count;

  if updated_count is null then
    raise exception 'Resource not found or not accessible';
  end if;
  return updated_count;
end;
$$;
revoke all on function public.increment_resource_counter(uuid, text) from public, anon;
grant execute on function public.increment_resource_counter(uuid, text) to authenticated;

-- Classrooms and members.
create policy classrooms_select_member_owner_admin on public.classrooms for select to authenticated using (
  public.is_active_user() and (teacher_id = (select auth.uid()) or public.is_admin() or public.is_classroom_member(id))
);
drop policy if exists classrooms_insert_teacher on public.classrooms;
create policy classrooms_update_owner_admin on public.classrooms for update to authenticated using (public.is_active_user() and (teacher_id = (select auth.uid()) or public.is_admin())) with check (public.is_active_user() and (teacher_id = (select auth.uid()) or public.is_admin()));
create policy classrooms_delete_owner_admin on public.classrooms for delete to authenticated using (public.is_active_user() and (teacher_id = (select auth.uid()) or public.is_admin()));

create policy members_select_self_classmates_owner_admin on public.classroom_members for select to authenticated using (
  public.is_active_user() and
  (user_id = (select auth.uid()) or public.is_admin() or public.owns_classroom(classroom_id) or public.is_classroom_member(classroom_id))
);
create policy members_delete_self_owner_admin on public.classroom_members for delete to authenticated using (
  public.is_active_user() and user_id = (select auth.uid()) and not public.owns_classroom(classroom_id)
);
drop policy if exists members_insert_admin_only on public.classroom_members;

create policy announcements_select_members on public.announcements for select to authenticated using (
  public.is_active_user() and (public.is_admin() or public.owns_classroom(classroom_id) or public.is_classroom_member(classroom_id))
);
create policy announcements_insert_owner on public.announcements for insert to authenticated with check (
  teacher_id = (select auth.uid()) and public.owns_classroom(classroom_id) and public.is_active_user()
  and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'teacher' and p.account_status = 'active')
);
create policy announcements_update_owner_admin on public.announcements for update to authenticated
using (public.is_active_user() and (public.owns_classroom(classroom_id) or public.is_admin()))
with check (public.is_active_user() and (public.is_admin() or (public.owns_classroom(classroom_id) and teacher_id = (select auth.uid()))));
create policy announcements_delete_owner_admin on public.announcements for delete to authenticated
using (public.is_active_user() and (public.owns_classroom(classroom_id) or public.is_admin()));

create policy classroom_resources_select_members on public.classroom_resources for select to authenticated using (
  public.is_active_user() and (public.is_admin() or public.owns_classroom(classroom_id) or public.is_classroom_member(classroom_id))
);
create policy classroom_resources_insert_owner on public.classroom_resources for insert to authenticated with check (
  public.is_active_user() and shared_by = (select auth.uid()) and public.owns_classroom(classroom_id)
  and exists (select 1 from public.resources r where r.id = resource_id and r.uploader_id = (select auth.uid()))
);
create policy classroom_resources_delete_owner_admin on public.classroom_resources for delete to authenticated using (
  public.is_active_user() and (public.owns_classroom(classroom_id) or public.is_admin())
);

-- Requests are visible to the requester and active teachers/admins; only requester creates their own.
create policy requests_select_authorized on public.resource_requests for select to authenticated using (
  public.is_active_user() and (requester_id = (select auth.uid()) or public.is_admin() or exists (
    select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'teacher' and p.account_status = 'active'
  ))
);
create policy requests_insert_self on public.resource_requests for insert to authenticated with check (public.is_active_user() and requester_id = (select auth.uid()));
create policy requests_update_owner_admin on public.resource_requests for update to authenticated
using (public.is_active_user() and (public.is_admin() or requester_id = (select auth.uid())))
with check (public.is_active_user() and (public.is_admin() or requester_id = (select auth.uid())));
create policy requests_delete_owner_admin on public.resource_requests for delete to authenticated
using (public.is_active_user() and (public.is_admin() or requester_id = (select auth.uid())));

create policy favorites_select_own on public.favorites for select to authenticated
using (public.is_active_user() and user_id = (select auth.uid()));
create policy favorites_insert_own_accessible_resource on public.favorites for insert to authenticated
with check (
  public.is_active_user() and user_id = (select auth.uid())
  and exists (select 1 from public.resources r where r.id = resource_id)
);
create policy favorites_delete_own on public.favorites for delete to authenticated
using (public.is_active_user() and user_id = (select auth.uid()));

revoke all on table public.notifications from public, anon, authenticated;
grant select, delete on table public.notifications to authenticated;
grant update (read) on table public.notifications to authenticated;
drop policy if exists notifications_owner_all on public.notifications;
create policy notifications_select_own on public.notifications for select to authenticated
using (public.is_active_user() and user_id = (select auth.uid()));
drop policy if exists notifications_insert_own on public.notifications;
create policy notifications_update_own on public.notifications for update to authenticated
using (public.is_active_user() and user_id = (select auth.uid()))
with check (public.is_active_user() and user_id = (select auth.uid()));
create policy notifications_delete_own on public.notifications for delete to authenticated
using (public.is_active_user() and user_id = (select auth.uid()));

revoke update, delete on table public.reports from authenticated;
create policy reports_select_reporter_admin on public.reports for select to authenticated using (
  public.is_active_user() and (reporter_id = (select auth.uid()) or public.is_admin())
);
create policy reports_insert_self on public.reports for insert to authenticated with check (reporter_id = (select auth.uid()) and public.is_active_user());
create policy moderation_logs_admin_select on public.moderation_logs for select to authenticated using (public.is_admin());
create policy moderation_logs_admin_insert on public.moderation_logs for insert to authenticated with check (admin_id = (select auth.uid()) and public.is_admin());

do $$
begin
  if exists (select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_catalog.pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
    ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;

-- Private resource file storage. Keep this bucket private; files are not served via public URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('resources', 'resources', false, 20971520, array[
  'application/pdf',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip',
  'application/x-zip-compressed',
  'application/octet-stream'
])
on conflict (id) do update set public = false, file_size_limit = 20971520, allowed_mime_types = excluded.allowed_mime_types;

-- Object names inside this bucket use {userId}/{uniqueId}-{safeFileName}.
create policy resource_files_insert_owner on storage.objects for insert to authenticated with check (
  bucket_id = 'resources' and public.is_active_user()
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and pg_catalog.cardinality(storage.foldername(name)) = 1
  and pg_catalog.lower(storage.extension(name)) in ('pdf', 'ppt', 'pptx', 'doc', 'docx', 'xlsx', 'zip')
);
create policy resource_files_select_authorized on storage.objects for select to authenticated using (
  bucket_id = 'resources' and public.is_active_user() and (
    (storage.foldername(name))[1] = (select auth.uid())::text or public.is_admin() or
    exists (select 1 from public.resources r where r.storage_path = name and (
      r.uploader_id = (select auth.uid()) or
      (r.status = 'approved' and r.visibility = 'public') or
      (r.status = 'approved' and r.visibility = 'department' and exists (
        select 1 from public.profiles p where p.id = (select auth.uid()) and p.department = r.department
      )) or
      (r.status = 'approved' and r.classroom_id is not null and
        (public.is_classroom_member(r.classroom_id) or public.owns_classroom(r.classroom_id)))
    )) or exists (
      select 1
      from public.classroom_resources cr
      join public.resources shared_resource on shared_resource.id = cr.resource_id
      where shared_resource.storage_path = name
        and (public.is_classroom_member(cr.classroom_id) or public.owns_classroom(cr.classroom_id))
    )
  )
);
create policy resource_files_update_owner on storage.objects for update to authenticated using (
  bucket_id = 'resources' and public.is_active_user()
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and pg_catalog.cardinality(storage.foldername(name)) = 1
  and pg_catalog.lower(storage.extension(name)) in ('pdf', 'ppt', 'pptx', 'doc', 'docx', 'xlsx', 'zip')
) with check (
  bucket_id = 'resources' and public.is_active_user()
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and pg_catalog.cardinality(storage.foldername(name)) = 1
  and pg_catalog.lower(storage.extension(name)) in ('pdf', 'ppt', 'pptx', 'doc', 'docx', 'xlsx', 'zip')
);
drop policy if exists resource_files_delete_owner_admin on storage.objects;
create policy resource_files_delete_owner_or_reported_admin on storage.objects for delete to authenticated using (
  bucket_id = 'resources' and public.is_active_user() and (
    (storage.foldername(name))[1] = (select auth.uid())::text or
    (public.is_admin() and exists (
      select 1 from public.resources r
      join public.reports report on report.resource_id = r.id
      where r.storage_path = name and report.status = 'open'
    ))
  )
);

-- Explicit Data API grants. RLS remains the row/role boundary; these grants
-- prevent anonymous access and limit authenticated writes to app-used columns.
revoke all on table public.profiles, public.resources, public.classrooms,
  public.classroom_members, public.announcements, public.classroom_resources,
  public.resource_requests, public.favorites, public.notifications,
  public.reports, public.moderation_logs from public, anon, authenticated;

grant select on table public.profiles to authenticated;
grant insert (id, name, email, role, department, semester, teaching_designation, bio, account_status)
  on table public.profiles to authenticated;
grant update (name, department, semester, teaching_designation, bio)
  on table public.profiles to authenticated;

grant select, delete on table public.resources to authenticated;
grant insert (title, description, subject, semester, department, resource_type, tags, uploader_id,
  visibility, classroom_id, storage_path, original_file_name, mime_type, file_size)
  on table public.resources to authenticated;

grant select, update, delete on table public.classrooms to authenticated;
grant select, delete on table public.classroom_members to authenticated;
grant select, insert, delete on table public.classroom_resources to authenticated;
grant select, insert, update, delete on table public.announcements to authenticated;

grant select, insert, update, delete on table public.resource_requests to authenticated;
grant select, insert, delete on table public.favorites to authenticated;

grant select, delete on table public.notifications to authenticated;
grant update (read) on table public.notifications to authenticated;
grant select on table public.reports to authenticated;
grant insert (resource_id, reporter_id, reason, description) on table public.reports to authenticated;
grant select on table public.moderation_logs to authenticated;
grant insert (admin_id, action, target_type, target_id, details) on table public.moderation_logs to authenticated;
