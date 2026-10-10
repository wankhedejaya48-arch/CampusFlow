-- Stage E Step 1: secure the existing profile roles and expose only the
-- administrative actions already present in AdminDashboard.

-- Preserve report history after resource removal, matching the existing Admin UI.
alter table public.reports add column if not exists resource_title text;
update public.reports report
set resource_title = coalesce(resource.title, 'Resource unavailable')
from public.resources resource
where report.resource_id = resource.id and report.resource_title is null;
update public.reports set resource_title = 'Resource unavailable' where resource_title is null;
alter table public.reports alter column resource_title set default 'Resource unavailable';
alter table public.reports alter column resource_title set not null;
alter table public.reports alter column resource_id drop not null;
alter table public.reports drop constraint if exists reports_resource_id_fkey;
alter table public.reports add constraint reports_resource_id_fkey
  foreign key (resource_id) references public.resources(id) on delete set null;

create or replace function public.capture_report_resource_title()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.resource_title := null;
  select r.title into new.resource_title from public.resources r where r.id = new.resource_id;
  if new.resource_title is null then raise exception 'The reported resource is unavailable'; end if;
  return new;
end;
$$;
revoke all on function public.capture_report_resource_title() from public, anon, authenticated;
drop trigger if exists reports_capture_resource_title on public.reports;
create trigger reports_capture_resource_title before insert on public.reports
for each row execute function public.capture_report_resource_title();

-- Role changes are not part of the UI. Provision or change administrator roles
-- out of band; no authenticated profile update can change a role.
create or replace function public.protect_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role is distinct from old.role and auth.uid() is not null then
    raise exception 'Profile roles cannot be changed through the client';
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

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
for update to authenticated
using (id = (select auth.uid()) and public.is_active_user())
with check (id = (select auth.uid()) and public.is_active_user());
drop policy if exists profiles_delete_admin on public.profiles;
revoke delete on table public.profiles from authenticated;

create or replace function public.admin_set_account_status(target_user_id uuid, next_status text)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare updated_profile public.profiles;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access required'; end if;
  if next_status is null or next_status not in ('active', 'disabled') then raise exception 'Unsupported account status'; end if;
  if target_user_id is null or target_user_id = auth.uid() then raise exception 'Administrators cannot change their own account status'; end if;
  update public.profiles p
  set account_status = next_status, updated_at = pg_catalog.now()
  where p.id = target_user_id and p.role <> 'admin'
  returning p.* into updated_profile;
  if updated_profile.id is null then raise exception 'User not found or account status cannot be changed'; end if;
  return updated_profile;
end;
$$;
revoke all on function public.admin_set_account_status(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_set_account_status(uuid, text) to authenticated;

-- Moderation updates can change only a pending resource's review status/reason.
drop policy if exists resources_update_uploader_or_admin on public.resources;
revoke update on table public.resources from authenticated;

create or replace function public.admin_moderate_resource(
  target_resource_id uuid,
  target_status text,
  target_rejection_reason text default null
)
returns public.resources
language plpgsql
security definer
set search_path = ''
as $$
declare updated_resource public.resources;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access required'; end if;
  if target_status is null or target_status not in ('approved', 'rejected') then raise exception 'Unsupported resource review status'; end if;
  if target_status = 'rejected' and pg_catalog.length(coalesce(target_rejection_reason, '')) > 300 then
    raise exception 'Rejection reason must be 300 characters or fewer';
  end if;
  update public.resources r
  set status = target_status,
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

-- Report moderation is limited to dismiss/remove outcomes from the current UI.
drop policy if exists reports_update_admin on public.reports;
drop policy if exists reports_delete_admin on public.reports;
revoke update, delete on table public.reports from authenticated;

create or replace function public.admin_resolve_report(target_report_id uuid, target_status text)
returns public.reports
language plpgsql
security definer
set search_path = ''
as $$
declare updated_report public.reports;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access required'; end if;
  if target_status is distinct from 'dismissed' then raise exception 'Only open reports may be dismissed through this action'; end if;
  update public.reports r
  set status = target_status, resolved_at = pg_catalog.now(), resolved_by = auth.uid()
  where r.id = target_report_id and r.status = 'open'
  returning r.* into updated_report;
  if updated_report.id is null then raise exception 'Open report not found'; end if;
  return updated_report;
end;
$$;
revoke all on function public.admin_resolve_report(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_resolve_report(uuid, text) to authenticated;

-- Resource removal is only supported from an open report in the existing UI.
drop policy if exists resources_delete_owner_admin on public.resources;
drop policy if exists resources_delete_owner on public.resources;
create policy resources_delete_owner on public.resources
for delete to authenticated using (uploader_id = (select auth.uid()) and public.is_active_user());

create or replace function public.admin_remove_reported_resource(target_resource_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
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

-- Admins may delete only Storage objects belonging to an open reported resource;
-- owners retain the existing ability to remove their own objects.
drop policy if exists resource_files_delete_owner_admin on storage.objects;
drop policy if exists resource_files_delete_owner_or_reported_admin on storage.objects;
create policy resource_files_delete_owner_or_reported_admin on storage.objects
for delete to authenticated
using (
  bucket_id = 'resources' and public.is_active_user() and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or (public.is_admin() and exists (
      select 1 from public.resources r
      join public.reports report on report.resource_id = r.id
      where r.storage_path = name and report.status = 'open'
    ))
  )
);
