-- Stage D Step 4: reuse the existing favorites relation and preserve rows.
alter table public.favorites
  add column if not exists id uuid not null default gen_random_uuid();

create unique index if not exists favorites_id_key on public.favorites (id);
create index if not exists favorites_user_idx on public.favorites (user_id, created_at desc);
create index if not exists favorites_resource_idx on public.favorites (resource_id);

alter table public.favorites enable row level security;

drop policy if exists favorites_owner_all on public.favorites;
drop policy if exists favorites_select_own on public.favorites;
create policy favorites_select_own on public.favorites
for select to authenticated
using (public.is_active_user() and user_id = (select auth.uid()));

drop policy if exists favorites_insert_own_accessible_resource on public.favorites;
create policy favorites_insert_own_accessible_resource on public.favorites
for insert to authenticated
with check (
  public.is_active_user()
  and user_id = (select auth.uid())
  and exists (select 1 from public.resources r where r.id = resource_id)
);

drop policy if exists favorites_delete_own on public.favorites;
create policy favorites_delete_own on public.favorites
for delete to authenticated
using (public.is_active_user() and user_id = (select auth.uid()));
