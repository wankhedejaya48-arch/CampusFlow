-- Stage D Step 5: connect the existing notifications table to the application.
-- No table is recreated and no existing notification rows are removed.

create index if not exists notifications_user_unread_created_idx
  on public.notifications (user_id, created_at desc)
  where read = false;

alter table public.notifications enable row level security;
revoke all on table public.notifications from anon, public;
grant select, insert, update, delete on table public.notifications to authenticated;

drop policy if exists notifications_owner_all on public.notifications;
drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications
for select to authenticated
using (public.is_active_user() and user_id = (select auth.uid()));

drop policy if exists notifications_insert_own on public.notifications;
create policy notifications_insert_own on public.notifications
for insert to authenticated
with check (public.is_active_user() and user_id = (select auth.uid()));

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications
for update to authenticated
using (public.is_active_user() and user_id = (select auth.uid()))
with check (public.is_active_user() and user_id = (select auth.uid()));

drop policy if exists notifications_delete_own on public.notifications;
create policy notifications_delete_own on public.notifications
for delete to authenticated
using (public.is_active_user() and user_id = (select auth.uid()));

-- These triggers preserve existing classroom-generated notification behavior while
-- preventing the browser from selecting arbitrary recipients.
create or replace function public.notify_classroom_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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

-- Existing AdminDashboard calls addNotification for verification outcomes.
-- This narrow RPC permits only active admins to create that existing category.
create or replace function public.create_admin_verification_notification(
  target_user_id uuid,
  notification_title text,
  notification_message text
)
returns public.notifications
language plpgsql
security definer
set search_path = ''
as $$
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

-- Keep the shared badge/page current across tabs and active sessions. RLS still
-- scopes row visibility to the signed-in recipient.
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
