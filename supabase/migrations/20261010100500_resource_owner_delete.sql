-- Let resource owners remove their own metadata records, matching Storage object ownership.
insert into storage.buckets (id, name, public, file_size_limit)
values ('resources', 'resources', false, 20971520)
on conflict (id) do update set public = false, file_size_limit = 20971520;

drop policy if exists resources_delete_admin on public.resources;
drop policy if exists resources_delete_owner_admin on public.resources;
create policy resources_delete_owner_admin on public.resources
for delete to authenticated
using (uploader_id = (select auth.uid()) or public.is_admin());
