-- Self-service profile editing. The authenticated caller can update only their
-- own display name; role, organization, email, status, and supervisor stay locked.
create or replace function public.update_my_profile(p_name text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_old_name text;
  v_name text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if char_length(v_name) < 2 or char_length(v_name) > 100 then
    raise exception 'Name must contain 2 to 100 characters' using errcode = '22023';
  end if;

  select u.name into v_old_name
  from public.users u
  where u.id = v_user_id and u.status = 'aktif'
  for update;

  if not found then
    raise exception 'Active profile not found' using errcode = '42501';
  end if;

  if v_old_name is distinct from v_name then
    update public.users set name = v_name where id = v_user_id;
    insert into public.audit_logs(user_id, action, object, old_value, new_value)
    values (v_user_id, 'update_own_profile', 'users:' || v_user_id, v_old_name, v_name);
  end if;

  return v_name;
end;
$$;

revoke all on function public.update_my_profile(text) from public, anon;
grant execute on function public.update_my_profile(text) to authenticated;
