begin;
create table public.atm_eval_runs(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references public.users(id) on delete cascade,
 revision text not null check(revision ~ '^[a-f0-9]{40}$'),status text not null default 'queued' check(status in ('queued','running','waiting','paused','completed','completed_with_errors','canceled')),
 reason text not null default '',next_at timestamptz not null default now(),created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create unique index atm_eval_one_active on public.atm_eval_runs(user_id) where status in ('queued','running','waiting');
create index atm_eval_runs_owner on public.atm_eval_runs(user_id,created_at desc);
create table public.atm_eval_cases(
 run_id uuid not null references public.atm_eval_runs(id) on delete cascade,case_id text not null,ordinal integer not null,
 status text not null default 'pending' check(status in ('pending','processing','retry','done')),attempts integer not null default 0,
 lease uuid,lease_until timestamptz,last_attempt timestamptz,result jsonb,history jsonb not null default '[]',primary key(run_id,case_id)
);
create index atm_eval_attempt_rate on public.atm_eval_cases(last_attempt);
create table public.atm_eval_worker_config(id boolean primary key default true check(id),url text not null,secret text not null,last_seen timestamptz);
alter table public.atm_eval_runs enable row level security;
alter table public.atm_eval_cases enable row level security;
alter table public.atm_eval_worker_config enable row level security;
revoke all on public.atm_eval_runs,public.atm_eval_cases,public.atm_eval_worker_config from public,anon,authenticated;
grant all on public.atm_eval_runs,public.atm_eval_cases to service_role;
revoke all on public.atm_eval_worker_config from service_role;
grant select(last_seen),update(last_seen) on public.atm_eval_worker_config to service_role;

create function public.atm_eval_manage(p_actor uuid,p_action text,p_revision text,p_cases jsonb default '[]',p_run uuid default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r public.atm_eval_runs%rowtype; rows jsonb;
begin
 if not exists(select 1 from public.users u join public.roles ro on ro.id=u.role_id where u.id=p_actor and u.status='aktif' and ro.level>=5) then raise exception 'Evaluation access denied';end if;
 if p_action not in ('status','start','pause','resume','retry','new') or p_revision !~ '^[a-f0-9]{40}$' then raise exception 'Invalid evaluation command';end if;
 perform pg_advisory_xact_lock(hashtextextended('atm-eval-owner:'||p_actor::text,0));
 if p_run is not null then
  select * into r from public.atm_eval_runs where id=p_run and user_id=p_actor for update;
  if not found then raise exception 'Evaluation not owned';end if;
 else select * into r from public.atm_eval_runs where user_id=p_actor order by created_at desc,id desc limit 1 for update;end if;
 if p_action in ('start','new') and (r.id is null or r.revision<>p_revision or p_action='new') then
  if jsonb_typeof(p_cases)<>'array' or jsonb_array_length(p_cases) not between 1 and 200 or octet_length(p_cases::text)>12000 then raise exception 'Invalid manifest';end if;
  if exists(select 1 from jsonb_array_elements(p_cases) x where jsonb_typeof(x)<>'string' or length(x#>>'{}') not between 1 and 40) then raise exception 'Invalid case';end if;
  update public.atm_eval_runs set status='canceled',reason='Digantikan oleh evaluasi baru',updated_at=now() where user_id=p_actor and status in ('queued','running','waiting');
  insert into public.atm_eval_runs(user_id,revision) values(p_actor,p_revision) returning * into r;
  insert into public.atm_eval_cases(run_id,case_id,ordinal) select r.id,x#>>'{}',n from jsonb_array_elements(p_cases) with ordinality a(x,n);
 elsif r.id is not null then
  if p_action='pause' then update public.atm_eval_runs set status='paused',reason='Dijeda pengguna',updated_at=now() where id=r.id;
  elsif p_action in ('resume','retry','start') then
   if r.revision<>p_revision then raise exception 'Revision changed: start a new run';end if;
   if p_action='retry' then update public.atm_eval_cases set status='pending',result=null,lease=null,lease_until=null,attempts=0 where run_id=r.id and status='done' and result->>'status' in ('FAIL','ERROR');end if;
   if exists(select 1 from public.atm_eval_cases where run_id=r.id and status<>'done') then update public.atm_eval_runs set status='queued',reason='',next_at=now(),updated_at=now() where id=r.id;end if;
  end if;
  select * into r from public.atm_eval_runs where id=r.id;
 end if;
 if r.id is null then return jsonb_build_object('run',null,'results','[]'::jsonb);end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',case_id,'ordinal',ordinal,'state',status,'attempts',attempts,'lastAttempt',last_attempt,'leaseUntil',lease_until,'result',result) order by ordinal),'[]') into rows from public.atm_eval_cases where run_id=r.id;
 return jsonb_build_object('run',to_jsonb(r),'results',rows,'serverTime',now(),'workerLastSeen',(select max(last_seen) from public.atm_eval_worker_config));
end $$;

create function public.atm_eval_claim(p_revision text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.atm_eval_runs%rowtype;c public.atm_eval_cases%rowtype;tok uuid:=gen_random_uuid();
begin
 perform pg_advisory_xact_lock(hashtextextended('atm-eval-worker',0));
 update public.atm_eval_worker_config set last_seen=now();
 update public.atm_eval_runs set status='paused',reason='Versi preview berubah. Mulai evaluasi baru untuk versi terbaru.',updated_at=now() where revision<>p_revision and status in ('queued','running','waiting');
 update public.atm_eval_runs owned_run set status='paused',reason='Akun tidak aktif atau hak evaluasi berubah',updated_at=now() where status in ('queued','running','waiting') and not exists(select 1 from public.users u join public.roles ro on ro.id=u.role_id where u.id=owned_run.user_id and u.status='aktif' and ro.level>=5);
 if (select count(*) from public.atm_eval_cases where last_attempt>now()-interval '60 seconds')>=2 then return null;end if;
 select * into r from public.atm_eval_runs j where j.revision=p_revision and j.status in ('queued','running','waiting') and j.next_at<=now() and not exists(select 1 from public.atm_eval_cases a where a.run_id=j.id and a.status='processing' and a.lease_until>now()) order by j.created_at,j.id limit 1 for update skip locked;
 if r.id is null then return null;end if;
 select * into c from public.atm_eval_cases where run_id=r.id and status<>'done' order by ordinal limit 1 for update;
 if c.case_id is not null and c.attempts>=5 then
  update public.atm_eval_cases set status='done',lease=null,lease_until=null,result=jsonb_build_object('id',c.case_id,'revision',r.revision,'status','ERROR','reason','Worker terputus berulang kali. Kasus dapat diuji ulang.') where run_id=r.id and case_id=c.case_id;
  update public.atm_eval_runs set status='queued',reason='Memulihkan kasus terputus',next_at=now(),updated_at=now() where id=r.id;
  return null;
 end if;
 if c.case_id is null then
  update public.atm_eval_runs set status=case when exists(select 1 from public.atm_eval_cases where run_id=r.id and result->>'status'='ERROR') then 'completed_with_errors' else 'completed' end,reason='',updated_at=now() where id=r.id;
  return null;
 end if;
 update public.atm_eval_cases set status='processing',lease=tok,lease_until=now()+interval '90 seconds',attempts=attempts+1,last_attempt=now() where run_id=r.id and case_id=c.case_id;
 update public.atm_eval_runs set status='running',reason='Memproses '||c.case_id,updated_at=now() where id=r.id;
 return jsonb_build_object('run',r.id,'actor',r.user_id,'revision',r.revision,'caseId',c.case_id,'lease',tok,'attempt',c.attempts+1);
end $$;

create function public.atm_eval_finish(p_run uuid,p_case text,p_lease uuid,p_result jsonb,p_retry boolean default false,p_delay integer default 60) returns boolean
language plpgsql security invoker set search_path='' as $$
declare c public.atm_eval_cases%rowtype;r public.atm_eval_runs%rowtype;outcome jsonb;
begin
 select * into r from public.atm_eval_runs where id=p_run for update;
 select * into c from public.atm_eval_cases where run_id=p_run and case_id=p_case for update;
 if c.run_id is null or p_lease is null or c.lease is distinct from p_lease or c.lease_until<=now() or c.status<>'processing' or r.status not in ('running','queued','waiting') then return false;end if;
 if jsonb_typeof(p_result) is distinct from 'object' or coalesce(p_result->>'status','') not in ('PASS','FAIL','REVIEW','ERROR','RETRY') or octet_length(p_result::text)>30000 then raise exception 'Invalid evaluation result';end if;
 outcome:=p_result||jsonb_build_object('id',p_case,'revision',r.revision,'finishedAt',now());
 if p_retry and c.attempts<5 then
  update public.atm_eval_cases set status='retry',lease=null,lease_until=null,history=history||jsonb_build_array(outcome) where run_id=p_run and case_id=p_case;
  update public.atm_eval_runs set status='waiting',reason=coalesce(p_result->>'reason','Menunggu percobaan ulang'),next_at=now()+make_interval(secs=>greatest(30,least(3600,p_delay))),updated_at=now() where id=p_run;
 else
  if p_retry then outcome:=outcome||jsonb_build_object('status','ERROR','reason','Layanan belum tersedia setelah 5 percobaan. Kasus ini dapat diuji ulang.');end if;
  update public.atm_eval_cases set status='done',result=outcome,lease=null,lease_until=null,history=history||jsonb_build_array(outcome) where run_id=p_run and case_id=p_case;
  update public.atm_eval_runs set status=case when p_result->>'errorKind'='configuration' then 'paused' when exists(select 1 from public.atm_eval_cases where run_id=p_run and status<>'done') then 'queued' when exists(select 1 from public.atm_eval_cases where run_id=p_run and result->>'status'='ERROR') then 'completed_with_errors' else 'completed' end,reason=case when p_result->>'errorKind'='configuration' then p_result->>'reason' else '' end,next_at=now(),updated_at=now() where id=p_run;
 end if;
 return true;
end $$;

create function public.atm_eval_tick() returns void language plpgsql security invoker set search_path='' as $$
declare c public.atm_eval_worker_config%rowtype;
begin
 delete from public.atm_eval_runs where created_at<now()-interval '30 days';
 if not exists(select 1 from public.atm_eval_runs where status in ('queued','running','waiting') and next_at<=now()) then return;end if;
 select * into c from public.atm_eval_worker_config where id;
 if c.secret is null then return;end if;
 perform net.http_post(url:=c.url,headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||c.secret),body:='{}'::jsonb,timeout_milliseconds:=55000);
end $$;
revoke all on function public.atm_eval_manage(uuid,text,text,jsonb,uuid),public.atm_eval_claim(text),public.atm_eval_finish(uuid,text,uuid,jsonb,boolean,integer),public.atm_eval_tick() from public,anon,authenticated;
grant execute on function public.atm_eval_manage(uuid,text,text,jsonb,uuid),public.atm_eval_claim(text),public.atm_eval_finish(uuid,text,uuid,jsonb,boolean,integer) to service_role;
do $$begin if exists(select 1 from pg_namespace where nspname='cron') and exists(select 1 from pg_namespace where nspname='net') then execute $q$select cron.schedule('atm-agent-evaluation-worker','* * * * *','select public.atm_eval_tick()')$q$;end if;end$$;
notify pgrst,'reload schema';
commit;
