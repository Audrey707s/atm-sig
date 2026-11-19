begin;
create or replace function public.atm_eval_manage(p_actor uuid,p_action text,p_revision text,p_cases jsonb default '[]',p_run uuid default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r public.atm_eval_runs%rowtype; rows jsonb;
begin
 if not exists(select 1 from public.users u join public.roles ro on ro.id=u.role_id where u.id=p_actor and u.status='aktif' and ro.level>=5) then raise exception 'Evaluation access denied';end if;
 if p_action not in ('status','start','pause','resume','retry','new') or p_revision !~ '^[a-f0-9]{40}$' then raise exception 'Invalid evaluation command';end if;
 perform pg_advisory_xact_lock(hashtextextended('atm-eval-owner:'||p_actor::text,0));
 if p_run is not null then
  select * into r from public.atm_eval_runs where id=p_run and user_id=p_actor for update;
  if not found then raise exception 'Evaluation not owned';end if;
 else select * into r from public.atm_eval_runs where user_id=p_actor order by (status in ('queued','running','waiting')) desc,(status='paused' and exists(select 1 from public.atm_eval_cases c where c.run_id=atm_eval_runs.id and c.status='done')) desc,created_at desc,id desc limit 1 for update;end if;
 if p_action='new' or (p_action='start' and r.id is null) then
  if jsonb_typeof(p_cases)<>'array' or jsonb_array_length(p_cases) not between 1 and 200 or octet_length(p_cases::text)>12000 then raise exception 'Invalid manifest';end if;
  if exists(select 1 from jsonb_array_elements(p_cases) x where jsonb_typeof(x)<>'string' or length(x#>>'{}') not between 1 and 40) then raise exception 'Invalid case';end if;
  update public.atm_eval_runs set status='canceled',reason='Digantikan oleh evaluasi baru',updated_at=now() where user_id=p_actor and status in ('queued','running','waiting');
  insert into public.atm_eval_runs(user_id,revision) values(p_actor,p_revision) returning * into r;
  insert into public.atm_eval_cases(run_id,case_id,ordinal) select r.id,x#>>'{}',n from jsonb_array_elements(p_cases) with ordinality a(x,n);
 elsif r.id is not null then
  if p_action='pause' then update public.atm_eval_runs set status='paused',reason='Dijeda pengguna',updated_at=now() where id=r.id;
  elsif p_action in ('resume','retry','start') then
   if p_action='retry' and r.revision<>p_revision then raise exception 'Revision changed: start a new run';end if;
   if p_action='retry' then update public.atm_eval_cases set status='pending',result=null,lease=null,lease_until=null,attempts=0 where run_id=r.id and status='done' and result->>'status' in ('FAIL','ERROR');end if;
   if exists(select 1 from public.atm_eval_cases where run_id=r.id and status<>'done') then update public.atm_eval_runs set status='queued',reason='',next_at=now(),updated_at=now() where id=r.id;end if;
  end if;
  select * into r from public.atm_eval_runs where id=r.id;
 end if;
 if r.id is null then return jsonb_build_object('run',null,'results','[]'::jsonb);end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',case_id,'ordinal',ordinal,'state',status,'attempts',attempts,'lastAttempt',last_attempt,'leaseUntil',lease_until,'result',result) order by ordinal),'[]') into rows from public.atm_eval_cases where run_id=r.id;
 return jsonb_build_object('run',to_jsonb(r),'results',rows,'serverTime',now(),'workerLastSeen',(select max(last_seen) from public.atm_eval_worker_config));
end $$;

commit;
