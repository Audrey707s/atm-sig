begin;
create or replace function public.atm_eval_claim(p_revision text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.atm_eval_runs%rowtype;c public.atm_eval_cases%rowtype;tok uuid:=gen_random_uuid();
begin
 perform pg_advisory_xact_lock(hashtextextended('atm-eval-worker',0));
 update public.atm_eval_worker_config set last_seen=now() where last_seen is distinct from now();
 update public.atm_eval_runs set status='paused',reason='Versi preview berubah. Mulai evaluasi baru untuk versi terbaru.',updated_at=now() where revision<>p_revision and status in ('queued','running','waiting');
 update public.atm_eval_runs owned_run set status='paused',reason='Akun tidak aktif atau hak evaluasi berubah',updated_at=now() where status in ('queued','running','waiting') and not exists(select 1 from public.users u join public.roles ro on ro.id=u.role_id where u.id=owned_run.user_id and u.status='aktif' and ro.level>=5);
 if (select count(*) from public.atm_eval_cases where last_attempt>=date_trunc('minute',now()))>=2 then return null;end if;
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

commit;
