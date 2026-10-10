-- Atomic counter updates for active users who can access the resource.
create or replace function public.increment_resource_counter(target_resource_id uuid, counter_name text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare updated_count bigint;
begin
  if auth.uid() is null or not public.is_active_user() then
    raise exception 'An active signed-in profile is required';
  end if;
  if counter_name not in ('views', 'downloads') then
    raise exception 'Unsupported resource counter';
  end if;

  update public.resources r
  set views = r.views + case when counter_name = 'views' then 1 else 0 end,
      downloads = r.downloads + case when counter_name = 'downloads' then 1 else 0 end,
      updated_at = now()
  where r.id = target_resource_id and (
    public.is_admin() or r.uploader_id = auth.uid() or
    (r.status = 'approved' and r.visibility = 'public') or
    (r.status = 'approved' and r.visibility = 'department' and exists (
      select 1 from public.profiles p where p.id = auth.uid() and p.department = r.department
    )) or
    (r.status = 'approved' and r.visibility = 'classroom' and r.classroom_id is not null and
      (public.is_classroom_member(r.classroom_id) or public.owns_classroom(r.classroom_id))) or
    exists (select 1 from public.classroom_resources cr where cr.resource_id = r.id and
      (public.is_classroom_member(cr.classroom_id) or public.owns_classroom(cr.classroom_id)))
  )
  returning case when counter_name = 'views' then r.views else r.downloads end into updated_count;

  if updated_count is null then
    raise exception 'Resource not found or not accessible';
  end if;
  return updated_count;
end;
$$;
revoke all on function public.increment_resource_counter(uuid, text) from public, anon;
grant execute on function public.increment_resource_counter(uuid, text) to authenticated;
