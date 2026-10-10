-- Stage D Step 1: extend existing classroom tables instead of recreating them.
alter table public.classrooms enable row level security;
alter table public.classroom_members enable row level security;

alter table public.classroom_members
  add column if not exists role text not null default 'student';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.classroom_members'::regclass
      and conname = 'classroom_members_role_check'
  ) then
    alter table public.classroom_members
      add constraint classroom_members_role_check check (role in ('teacher', 'student'));
  end if;
end;
$$;

-- Restore owner membership for classrooms created before roles were stored.
update public.classroom_members m
set role = case when c.teacher_id = m.user_id then 'teacher' else 'student' end
from public.classrooms c
where c.id = m.classroom_id;
insert into public.classroom_members (classroom_id, user_id, role)
select c.id, c.teacher_id, 'teacher' from public.classrooms c
on conflict (classroom_id, user_id) do update set role = 'teacher';

-- Existing unique share_code constraint and membership primary key enforce uniqueness.
create unique index if not exists classrooms_share_code_key on public.classrooms (share_code);
create index if not exists classrooms_teacher_created_idx on public.classrooms (teacher_id, created_at desc);
create index if not exists classroom_members_user_idx on public.classroom_members (user_id, classroom_id);

drop policy if exists classrooms_select_member_owner_admin on public.classrooms;
create policy classrooms_select_member_owner_admin on public.classrooms for select to authenticated
using (public.is_active_user() and (
  teacher_id = (select auth.uid()) or public.is_admin() or public.is_classroom_member(id)
));
drop policy if exists classrooms_insert_teacher on public.classrooms;
drop policy if exists classrooms_update_owner_admin on public.classrooms;
create policy classrooms_update_owner_admin on public.classrooms for update to authenticated
using (public.is_active_user() and (teacher_id = (select auth.uid()) or public.is_admin()))
with check (public.is_active_user() and (teacher_id = (select auth.uid()) or public.is_admin()));
drop policy if exists classrooms_delete_owner_admin on public.classrooms;
create policy classrooms_delete_owner_admin on public.classrooms for delete to authenticated
using (public.is_active_user() and (teacher_id = (select auth.uid()) or public.is_admin()));

drop policy if exists members_select_self_classmates_owner_admin on public.classroom_members;
create policy members_select_self_classmates_owner_admin on public.classroom_members for select to authenticated
using (public.is_active_user() and (
  user_id = (select auth.uid()) or public.is_admin() or
  public.owns_classroom(classroom_id) or public.is_classroom_member(classroom_id)
));
drop policy if exists members_delete_self_owner_admin on public.classroom_members;
create policy members_delete_self_owner_admin on public.classroom_members for delete to authenticated
using (public.is_active_user() and (
  user_id = (select auth.uid()) or public.owns_classroom(classroom_id) or public.is_admin()
));
drop policy if exists members_insert_admin_only on public.classroom_members;
-- No direct INSERT or UPDATE policy: membership and role changes go through guarded RPCs.

drop policy if exists classroom_resources_insert_owner on public.classroom_resources;
create policy classroom_resources_insert_owner on public.classroom_resources for insert to authenticated
with check (public.is_active_user() and shared_by = (select auth.uid()) and public.owns_classroom(classroom_id)
  and exists (select 1 from public.resources r where r.id = resource_id and r.uploader_id = (select auth.uid())));

create or replace function public.create_classroom(
  classroom_name text, classroom_subject text, classroom_department text, classroom_semester smallint
)
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
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'student' and p.account_status = 'active') then
    raise exception 'Only active students may join classrooms';
  end if;
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
