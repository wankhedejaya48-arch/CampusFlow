-- Disabled profiles must not read or mutate classroom resource links or reports.
drop policy if exists classroom_resources_select_members on public.classroom_resources;
create policy classroom_resources_select_members on public.classroom_resources
for select to authenticated
using (
  public.is_active_user()
  and (public.is_admin() or public.owns_classroom(classroom_id) or public.is_classroom_member(classroom_id))
);

drop policy if exists classroom_resources_delete_owner_admin on public.classroom_resources;
create policy classroom_resources_delete_owner_admin on public.classroom_resources
for delete to authenticated
using (public.is_active_user() and (public.owns_classroom(classroom_id) or public.is_admin()));

drop policy if exists reports_select_reporter_admin on public.reports;
create policy reports_select_reporter_admin on public.reports
for select to authenticated
using (public.is_active_user() and (reporter_id = (select auth.uid()) or public.is_admin()));
