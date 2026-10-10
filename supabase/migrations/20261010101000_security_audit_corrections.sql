-- Corrective security migration from the Stage E Step 2 static audit.
-- Tighten writable fields and align Storage reads with resource/classroom RLS.

-- Browser callers may only submit an open report. Resolution metadata and the
-- title snapshot are database controlled.
create or replace function public.capture_report_resource_title()
returns trigger
language plpgsql
set search_path = ''
as $$
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

-- Lock additional profile identity fields; callers may still edit ordinary
-- profile fields through the existing self-update UI.
create or replace function public.protect_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null and (
    new.id is distinct from old.id or new.email is distinct from old.email or new.role is distinct from old.role
  ) then
    raise exception 'Profile identity and role fields cannot be changed through the client';
  end if;
  if new.account_status is distinct from old.account_status and (
    auth.uid() is not null and (not public.is_admin() or old.id = auth.uid() or old.role = 'admin')
  ) then
    raise exception 'Only an administrator may change the status of another non-admin account';
  end if;
  return new;
end;
$$;
revoke all on function public.protect_profile_privileges() from public, anon, authenticated;

-- Ignore client supplied workflow/counter fields on resource creation and bind
-- stored metadata to the active owner and to classrooms the owner can access.
create or replace function public.enforce_resource_insert_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
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
  else
    if pg_catalog.cardinality(storage.foldername(new.storage_path)) <> 1
      or (storage.foldername(new.storage_path))[1] <> auth.uid()::text
      or pg_catalog.lower(storage.extension(new.storage_path)) not in ('pdf', 'ppt', 'pptx', 'doc', 'docx', 'xlsx', 'zip')
      or pg_catalog.lower(storage.extension(new.storage_path)) <> pg_catalog.lower(pg_catalog.split_part(new.original_file_name, '.', pg_catalog.array_length(pg_catalog.string_to_array(new.original_file_name, '.'), 1)))
      or pg_catalog.length(pg_catalog.btrim(new.original_file_name)) = 0
      or new.file_size is null or new.file_size < 1 or new.file_size > 20971520
      or new.mime_type is null then
      raise exception 'Resource file metadata or Storage path is invalid';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_resource_insert_fields() from public, anon, authenticated;
drop trigger if exists resources_enforce_insert_fields on public.resources;
create trigger resources_enforce_insert_fields before insert on public.resources
for each row execute function public.enforce_resource_insert_fields();

-- Authenticated users can only alter their own read flag; notification creation
-- for other users remains behind the existing admin RPC and database triggers.
drop policy if exists notifications_insert_own on public.notifications;
revoke insert, update on table public.notifications from authenticated;
grant update (read) on table public.notifications to authenticated;

-- Preserve classroom membership ownership: a teacher cannot delete their own
-- teacher membership row to evade the leave_classroom owner guard.
drop policy if exists members_delete_self_owner_admin on public.classroom_members;
create policy members_delete_self_owner_admin on public.classroom_members
for delete to authenticated
using (
  public.is_active_user()
  and user_id = (select auth.uid())
  and not public.owns_classroom(classroom_id)
);

-- Storage remains private. Limit uploaded object names/types and allow reads of
-- resources shared through classroom_resources under the same membership rules
-- as resource metadata. Disabled accounts lose Storage access as well.
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
on conflict (id) do update set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists resource_files_insert_owner on storage.objects;
create policy resource_files_insert_owner on storage.objects
for insert to authenticated
with check (
  bucket_id = 'resources'
  and public.is_active_user()
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and pg_catalog.cardinality(storage.foldername(name)) = 1
  and pg_catalog.lower(storage.extension(name)) in ('pdf', 'ppt', 'pptx', 'doc', 'docx', 'xlsx', 'zip')
);

drop policy if exists resource_files_select_authorized on storage.objects;
create policy resource_files_select_authorized on storage.objects
for select to authenticated
using (
  bucket_id = 'resources' and public.is_active_user() and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or public.is_admin()
    or exists (
      select 1 from public.resources r where r.storage_path = name and (
        r.uploader_id = (select auth.uid())
        or (r.status = 'approved' and r.visibility = 'public')
        or (r.status = 'approved' and r.visibility = 'department' and exists (
          select 1 from public.profiles p where p.id = (select auth.uid()) and p.department = r.department
        ))
        or (r.status = 'approved' and r.visibility = 'classroom' and r.classroom_id is not null and
          (public.is_classroom_member(r.classroom_id) or public.owns_classroom(r.classroom_id)))
      )
    )
    or exists (
      select 1
      from public.classroom_resources cr
      join public.resources shared_resource on shared_resource.id = cr.resource_id
      where shared_resource.storage_path = name
        and (public.is_classroom_member(cr.classroom_id) or public.owns_classroom(cr.classroom_id))
    )
  )
);

drop policy if exists resource_files_update_owner on storage.objects;
create policy resource_files_update_owner on storage.objects
for update to authenticated
using (
  bucket_id = 'resources' and public.is_active_user()
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and pg_catalog.cardinality(storage.foldername(name)) = 1
  and pg_catalog.lower(storage.extension(name)) in ('pdf', 'ppt', 'pptx', 'doc', 'docx', 'xlsx', 'zip')
)
with check (
  bucket_id = 'resources' and public.is_active_user()
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and pg_catalog.cardinality(storage.foldername(name)) = 1
  and pg_catalog.lower(storage.extension(name)) in ('pdf', 'ppt', 'pptx', 'doc', 'docx', 'xlsx', 'zip')
);

-- Explicit grants make RLS the row filter while limiting which SQL operations
-- the public Data API roles can attempt. SECURITY DEFINER RPCs/triggers retain
-- their owner's required access.
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
grant select on table public.reports to authenticated;
grant insert (resource_id, reporter_id, reason, description) on table public.reports to authenticated;
grant select on table public.moderation_logs to authenticated;
grant insert (admin_id, action, target_type, target_id, details) on table public.moderation_logs to authenticated;
