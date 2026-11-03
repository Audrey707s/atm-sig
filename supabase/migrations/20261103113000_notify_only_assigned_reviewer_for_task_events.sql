-- Task progress/review notifications go only to the explicitly assigned reviewer.
-- Deadline approval notifications keep their separate SM/GM/Super Admin routing.
create or replace function public.notify_task_supervisors(
  p_task_id uuid,
  p_type text,
  p_title text,
  p_body text,
  p_include_direct_reviewer boolean
) returns void
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
begin
  if p_include_direct_reviewer then
    insert into public.notifications (user_id, task_id, type, title, body)
    select task_row.reviewer_id, task_row.id, p_type, p_title, p_body
    from public.tasks task_row
    join public.users reviewer on reviewer.id = task_row.reviewer_id
    where task_row.id = p_task_id
      and task_row.reviewer_id is not null
      and reviewer.status = 'aktif'
      and reviewer.id <> task_row.owner_id;
    return;
  end if;

  insert into public.notifications (user_id, task_id, type, title, body)
  select distinct recipients.user_id, task_row.id, p_type, p_title, p_body
  from public.tasks task_row
  join public.org_units task_unit on task_unit.id = task_row.org_unit_id
  cross join lateral (
    select sm.id as user_id
    from public.users sm
    join public.roles role on role.id = sm.role_id and role.level = 4
    where sm.org_unit_id = case
      when task_unit.type = 'section' then task_unit.parent_id
      else task_unit.id
    end
    union
    select user_row.id
    from public.users user_row
    join public.roles role on role.id = user_row.role_id
    where role.level in (5, 6)
  ) recipients
  join public.users recipient on recipient.id = recipients.user_id
  where task_row.id = p_task_id
    and recipient.status = 'aktif'
    and recipient.id <> task_row.owner_id;
end;
$function$;
