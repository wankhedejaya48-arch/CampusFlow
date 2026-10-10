-- Stage D Step 3: harden and complete the existing resource_requests table.
-- Preserve existing rows and fields; add only UI-backed name/count fields.

alter table public.resource_requests
  add column if not exists requester_name text not null default 'CampusFlow Member',
  add column if not exists responses integer not null default 0;

update public.resource_requests r
set requester_name = coalesce(nullif(p.name, ''), 'CampusFlow Member')
from public.profiles p
where p.id = r.requester_id and r.requester_name = 'CampusFlow Member';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.resource_requests'::regclass
      and conname = 'resource_requests_responses_nonnegative'
  ) then
    alter table public.resource_requests
      add constraint resource_requests_responses_nonnegative check (responses >= 0);
  end if;
end;
$$;

create index if not exists requests_requester_idx
  on public.resource_requests (requester_id, created_at desc);
create index if not exists requests_status_idx
  on public.resource_requests (status, created_at desc);

create or replace function public.enforce_resource_request_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_active_user() then
    raise exception 'An active signed-in profile is required';
  end if;

  if tg_op = 'INSERT' then
    if new.requester_id <> auth.uid() then
      raise exception 'A request must belong to the authenticated user';
    end if;
    select coalesce(nullif(p.name, ''), 'CampusFlow Member')
      into new.requester_name
      from public.profiles p where p.id = auth.uid();
    if not found then raise exception 'An active profile is required to create a request'; end if;
    new.status := 'open';
    new.responses := 0;
    new.created_at := now();
    new.updated_at := now();
  else
    if new.requester_id is distinct from old.requester_id then
      raise exception 'Request ownership cannot be changed';
    end if;
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
create trigger resource_requests_enforce_fields
before insert or update on public.resource_requests
for each row execute function public.enforce_resource_request_fields();

alter table public.resource_requests enable row level security;

drop policy if exists requests_select_authorized on public.resource_requests;
create policy requests_select_authorized on public.resource_requests
for select to authenticated
using (
  public.is_active_user()
  and (
    requester_id = (select auth.uid())
    or public.is_admin()
    or exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.role = 'teacher' and p.account_status = 'active'
    )
  )
);

drop policy if exists requests_insert_self on public.resource_requests;
create policy requests_insert_self on public.resource_requests
for insert to authenticated
with check (public.is_active_user() and requester_id = (select auth.uid()));

drop policy if exists requests_update_owner_admin on public.resource_requests;
create policy requests_update_owner_admin on public.resource_requests
for update to authenticated
using (public.is_active_user() and (public.is_admin() or requester_id = (select auth.uid())))
with check (public.is_active_user() and (public.is_admin() or requester_id = (select auth.uid())));

drop policy if exists requests_delete_owner_admin on public.resource_requests;
create policy requests_delete_owner_admin on public.resource_requests
for delete to authenticated
using (public.is_active_user() and (public.is_admin() or requester_id = (select auth.uid())));
