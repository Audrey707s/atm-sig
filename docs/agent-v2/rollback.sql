-- Optional, destructive removal of v2 private state. First switch the flag off and redeploy.
begin;
do $$begin if exists(select 1 from pg_namespace where nspname='cron') then execute $q$select cron.unschedule(jobid) from cron.job where jobname='atm-agent-retention'$q$;end if;end$$;
drop function if exists public.atm_agent_execute(uuid,text,text,text,uuid,text,jsonb,text,text,text,timestamptz);
drop function if exists public.atm_agent_claim(uuid,text,text,text,text,text,timestamptz);
drop function if exists public.atm_agent_identity(uuid,text,text,text,timestamptz);
drop function if exists public.atm_agent_candidates(uuid,text);
drop function if exists public.atm_agent_purge();
drop table if exists public.atm_agent_traces,public.atm_agent_requests,public.atm_agent_sessions;
commit;
