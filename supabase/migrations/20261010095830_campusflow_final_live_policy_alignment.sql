-- CampusFlow baseline: Final live policy alignment and foreign-key indexing
-- 1. Align classroom membership reads to require an active account.
-- 2. Add foreign-key indexes added during live verification to optimize joins and cascading deletes.

-- Classroom membership reads: active account requirement
drop policy if exists members_select_self_classmates_owner_admin on public.classroom_members;
create policy members_select_self_classmates_owner_admin on public.classroom_members
for select to authenticated
using (
  public.is_active_user() and (
    user_id = (select auth.uid())
    or public.is_admin()
    or public.owns_classroom(classroom_id)
    or public.is_classroom_member(classroom_id)
  )
);

-- Foreign-key indexes added during live verification
create index if not exists resources_classroom_idx on public.resources (classroom_id);
create index if not exists announcements_teacher_idx on public.announcements (teacher_id);
create index if not exists classroom_resources_resource_idx on public.classroom_resources (resource_id);
create index if not exists classroom_resources_shared_by_idx on public.classroom_resources (shared_by);
create index if not exists notifications_related_resource_idx on public.notifications (related_resource_id);
create index if not exists notifications_related_classroom_idx on public.notifications (related_classroom_id);
create index if not exists reports_reporter_idx on public.reports (reporter_id);
create index if not exists reports_resolved_by_idx on public.reports (resolved_by);
create index if not exists moderation_logs_admin_idx on public.moderation_logs (admin_id);
