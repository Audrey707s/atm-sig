-- Keep the application email aligned only after Supabase Auth commits a
-- confirmed address. Pending email_change never updates the application row.
create schema if not exists private;
revoke all on schema private from public;

create or replace function private.sync_confirmed_account_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is distinct from old.email
     and new.email is not null
     and new.email_confirmed_at is not null then
    update public.users set email = new.email where id = new.id;
    if found then
      insert into public.audit_logs(user_id, action, object, old_value, new_value)
      values (new.id, 'update_verified_email', 'users:' || new.id, old.email, new.email);
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.sync_confirmed_account_email() from public, anon, authenticated;

create trigger atm_sync_confirmed_account_email
  after update of email on auth.users
  for each row execute function private.sync_confirmed_account_email();
