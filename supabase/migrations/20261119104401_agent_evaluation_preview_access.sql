begin;
alter table public.atm_eval_worker_config add column headers jsonb not null default '{}', add column access_expires_at timestamptz;
create or replace function public.atm_eval_tick() returns void language plpgsql security invoker set search_path='' as $$
declare c public.atm_eval_worker_config%rowtype;
begin
 delete from public.atm_eval_runs where created_at<now()-interval '30 days';
 if not exists(select 1 from public.atm_eval_runs where status in ('queued','running','waiting') and next_at<=now()) then return;end if;
 select * into c from public.atm_eval_worker_config where id;
 if c.secret is null then return;end if;
 if c.access_expires_at is not null and c.access_expires_at<=now() then
  update public.atm_eval_runs set status='paused',reason='Akses otomatis preview telah kedaluwarsa. Progres tersimpan; akses perlu diperbarui sebelum melanjutkan.',updated_at=now() where status in ('queued','running','waiting');
  return;
 end if;
 perform net.http_post(url:=c.url,headers:=c.headers||jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||c.secret),body:='{}'::jsonb,timeout_milliseconds:=55000);
end $$;
revoke all on function public.atm_eval_tick() from public,anon,authenticated,service_role;
commit;