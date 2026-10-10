-- Stage B: create profile rows even when Supabase email confirmation is enabled.
-- Apply this migration to the existing project after the Stage A schema.
create or replace function public.create_profile_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_role text := new.raw_user_meta_data ->> 'role';
  requested_semester text := new.raw_user_meta_data ->> 'semester';
begin
  if coalesce(requested_role, '') not in ('student', 'teacher') then
    requested_role := 'student';
  end if;

  insert into public.profiles (
    id,
    name,
    email,
    role,
    department,
    semester,
    teaching_designation,
    bio,
    account_status
  ) values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), split_part(new.email, '@', 1)),
    new.email,
    requested_role,
    nullif(trim(new.raw_user_meta_data ->> 'department'), ''),
    case
      when requested_role = 'student' and requested_semester ~ '^[0-9]{1,2}$'
        and requested_semester::integer between 1 and 20 then requested_semester::smallint
      else null
    end,
    case when requested_role = 'teacher' then nullif(trim(new.raw_user_meta_data ->> 'teaching_designation'), '') else null end,
    coalesce(new.raw_user_meta_data ->> 'bio', ''),
    'active'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke all on function public.create_profile_for_auth_user() from public, anon, authenticated;
drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute function public.create_profile_for_auth_user();

-- Disabled profiles may still read their own profile status, but cannot use app data.
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update to authenticated
using ((id = (select auth.uid()) and public.is_active_user()) or public.is_admin())
with check ((id = (select auth.uid()) and public.is_active_user()) or public.is_admin());

drop policy if exists resources_select_authorized on public.resources;
create policy resources_select_authorized on public.resources for select to authenticated using (
  public.is_active_user() and (
    public.is_admin() or uploader_id = (select auth.uid()) or
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

drop policy if exists resources_update_uploader_or_admin on public.resources;
create policy resources_update_uploader_or_admin on public.resources for update to authenticated
using ((uploader_id = (select auth.uid()) and public.is_active_user()) or public.is_admin())
with check (public.is_admin() or (uploader_id = (select auth.uid()) and public.is_active_user() and status = 'pending'));

drop policy if exists classrooms_select_member_owner_admin on public.classrooms;
create policy classrooms_select_member_owner_admin on public.classrooms for select to authenticated using (
  public.is_active_user() and (teacher_id = (select auth.uid()) or public.is_admin() or public.is_classroom_member(id))
);
drop policy if exists classrooms_update_owner_admin on public.classrooms;
create policy classrooms_update_owner_admin on public.classrooms for update to authenticated
using (public.is_active_user() and (teacher_id = (select auth.uid()) or public.is_admin()))
with check (public.is_active_user() and (teacher_id = (select auth.uid()) or public.is_admin()));
drop policy if exists classrooms_delete_owner_admin on public.classrooms;
create policy classrooms_delete_owner_admin on public.classrooms for delete to authenticated
using (public.is_active_user() and (teacher_id = (select auth.uid()) or public.is_admin()));

drop policy if exists members_select_self_classmates_owner_admin on public.classroom_members;
create policy members_select_self_classmates_owner_admin on public.classroom_members for select to authenticated using (
  public.is_active_user() and
  (user_id = (select auth.uid()) or public.is_admin() or public.owns_classroom(classroom_id) or public.is_classroom_member(classroom_id))
);
drop policy if exists members_delete_self_owner_admin on public.classroom_members;
create policy members_delete_self_owner_admin on public.classroom_members for delete to authenticated using (
  public.is_active_user() and
  (user_id = (select auth.uid()) or public.owns_classroom(classroom_id) or public.is_admin())
);

drop policy if exists announcements_select_members on public.announcements;
create policy announcements_select_members on public.announcements for select to authenticated using (
  public.is_active_user() and
  (public.is_admin() or public.owns_classroom(classroom_id) or public.is_classroom_member(classroom_id))
);
drop policy if exists announcements_update_owner_admin on public.announcements;
create policy announcements_update_owner_admin on public.announcements for update to authenticated
using (public.is_active_user() and (public.owns_classroom(classroom_id) or public.is_admin()))
with check (public.is_active_user() and (public.owns_classroom(classroom_id) or public.is_admin()));
drop policy if exists announcements_delete_owner_admin on public.announcements;
create policy announcements_delete_owner_admin on public.announcements for delete to authenticated
using (public.is_active_user() and (public.owns_classroom(classroom_id) or public.is_admin()));

drop policy if exists classroom_resources_select_members on public.classroom_resources;
create policy classroom_resources_select_members on public.classroom_resources for select to authenticated using (
  public.is_active_user() and
  (public.is_admin() or public.owns_classroom(classroom_id) or public.is_classroom_member(classroom_id))
);
drop policy if exists classroom_resources_insert_owner on public.classroom_resources;
create policy classroom_resources_insert_owner on public.classroom_resources for insert to authenticated with check (
  public.is_active_user() and shared_by = (select auth.uid()) and public.owns_classroom(classroom_id)
);
drop policy if exists classroom_resources_delete_owner_admin on public.classroom_resources;
create policy classroom_resources_delete_owner_admin on public.classroom_resources for delete to authenticated
using (public.is_active_user() and (public.owns_classroom(classroom_id) or public.is_admin()));

drop policy if exists requests_select_authorized on public.resource_requests;
create policy requests_select_authorized on public.resource_requests for select to authenticated using (
  public.is_active_user() and (requester_id = (select auth.uid()) or public.is_admin() or exists (
    select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'teacher'
  ))
);
drop policy if exists requests_update_owner_admin on public.resource_requests;
create policy requests_update_owner_admin on public.resource_requests for update to authenticated
using (public.is_active_user() and (public.is_admin() or requester_id = (select auth.uid())))
with check (public.is_active_user() and (public.is_admin() or requester_id = (select auth.uid())));
drop policy if exists requests_delete_owner_admin on public.resource_requests;
create policy requests_delete_owner_admin on public.resource_requests for delete to authenticated
using (public.is_active_user() and (public.is_admin() or requester_id = (select auth.uid())));

drop policy if exists favorites_owner_all on public.favorites;
create policy favorites_owner_all on public.favorites for all to authenticated
using (public.is_active_user() and user_id = (select auth.uid()))
with check (public.is_active_user() and user_id = (select auth.uid()));
drop policy if exists notifications_owner_all on public.notifications;
create policy notifications_owner_all on public.notifications for all to authenticated
using (public.is_active_user() and user_id = (select auth.uid()))
with check (public.is_active_user() and user_id = (select auth.uid()));

drop policy if exists reports_select_reporter_admin on public.reports;
create policy reports_select_reporter_admin on public.reports for select to authenticated using (
  public.is_active_user() and (reporter_id = (select auth.uid()) or public.is_admin())
);
drop policy if exists reports_insert_self on public.reports;
create policy reports_insert_self on public.reports for insert to authenticated
with check (public.is_active_user() and reporter_id = (select auth.uid()));
drop policy if exists reports_update_admin on public.reports;
create policy reports_update_admin on public.reports for update to authenticated
using (public.is_active_user() and public.is_admin()) with check (public.is_active_user() and public.is_admin());
drop policy if exists reports_delete_admin on public.reports;
create policy reports_delete_admin on public.reports for delete to authenticated
using (public.is_active_user() and public.is_admin());

drop policy if exists resource_files_select_authorized on storage.objects;
create policy resource_files_select_authorized on storage.objects for select to authenticated using (
  public.is_active_user() and bucket_id = 'resources' and (
    (storage.foldername(name))[1] = (select auth.uid())::text or public.is_admin() or
    exists (select 1 from public.resources r where r.storage_path = name and (
      r.uploader_id = (select auth.uid()) or
      (r.status = 'approved' and r.visibility = 'public') or
      (r.status = 'approved' and r.visibility = 'department' and exists (
        select 1 from public.profiles p where p.id = (select auth.uid()) and p.department = r.department
      )) or
      (r.status = 'approved' and r.classroom_id is not null and
        (public.is_classroom_member(r.classroom_id) or public.owns_classroom(r.classroom_id)))
    ))
  )
);
drop policy if exists resource_files_update_owner on storage.objects;
create policy resource_files_update_owner on storage.objects for update to authenticated
using (public.is_active_user() and bucket_id = 'resources' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (public.is_active_user() and bucket_id = 'resources' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists resource_files_delete_owner_admin on storage.objects;
create policy resource_files_delete_owner_admin on storage.objects for delete to authenticated
using (public.is_active_user() and bucket_id = 'resources' and
  ((storage.foldername(name))[1] = (select auth.uid())::text or public.is_admin()));
