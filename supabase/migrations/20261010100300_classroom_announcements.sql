-- Stage D Step 2: persist classroom announcements using the existing table.
-- teacher_id remains the database author field for compatibility with the
-- existing schema; the frontend maps it to the semantic authorId property.

alter table public.announcements
  add column if not exists updated_at timestamptz not null default now();

create index if not exists announcements_classroom_idx
  on public.announcements (classroom_id, created_at desc);

create or replace function public.set_announcement_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.set_announcement_updated_at() from public, anon, authenticated;
drop trigger if exists announcements_set_updated_at on public.announcements;
create trigger announcements_set_updated_at
before update on public.announcements
for each row execute function public.set_announcement_updated_at();

alter table public.announcements enable row level security;

drop policy if exists announcements_select_members on public.announcements;
create policy announcements_select_members on public.announcements
for select to authenticated
using (
  public.is_active_user()
  and (public.is_admin() or public.owns_classroom(classroom_id) or public.is_classroom_member(classroom_id))
);

drop policy if exists announcements_insert_owner on public.announcements;
create policy announcements_insert_owner on public.announcements
for insert to authenticated
with check (
  public.is_active_user()
  and teacher_id = (select auth.uid())
  and public.owns_classroom(classroom_id)
  and exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'teacher' and p.account_status = 'active'
  )
);

drop policy if exists announcements_update_owner_admin on public.announcements;
create policy announcements_update_owner_admin on public.announcements
for update to authenticated
using (public.is_active_user() and (public.owns_classroom(classroom_id) or public.is_admin()))
with check (
  public.is_active_user()
  and (public.is_admin() or (public.owns_classroom(classroom_id) and teacher_id = (select auth.uid())))
);

drop policy if exists announcements_delete_owner_admin on public.announcements;
create policy announcements_delete_owner_admin on public.announcements
for delete to authenticated
using (public.is_active_user() and (public.owns_classroom(classroom_id) or public.is_admin()));
