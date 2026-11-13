begin;
create or replace function public.atm_ai_tasks(p_actor uuid,p_query text default '',p_mode text default 'list') returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare result jsonb; old_role text:=current_user; old_claims text:=current_setting('request.jwt.claims',true); old_sub text:=current_setting('request.jwt.claim.sub',true);
begin
 if not exists(select 1 from public.users where id=p_actor and status='aktif') then return '[]'::jsonb;end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',p_actor,'role','authenticated')::text,true);
 perform set_config('request.jwt.claim.sub',p_actor::text,true);perform set_config('role','authenticated',true);
 if p_mode='report' then
  select jsonb_build_object('total',count(*),'done',count(*) filter(where status='Done'),'review',count(*) filter(where status='Review'),'overdue',count(*) filter(where status<>'Done' and due_date<now())) into result from public.tasks;
 else
  select coalesce(jsonb_agg(x),'[]') into result from (
   select t.id,t.title,t.status,t.progress_pct,to_char(t.due_date at time zone 'Asia/Jakarta','DD/MM/YYYY HH24:MI') as due,t.owner_id=p_actor as mine
   from public.tasks t
   where (coalesce(p_query,'')='' or position(lower(p_query) in lower(t.title))>0 or t.id::text=lower(p_query))
    and (p_mode not in ('mine','mine_calendar') or t.owner_id=p_actor)
    and (p_mode<>'review' or (t.status='Review' and t.reviewer_id=p_actor))
    and (p_mode not in ('calendar','mine_calendar') or (t.status<>'Done' and t.due_date>=now() and t.due_date<now()+interval '7 days'))
   order by t.due_date,t.id limit 21
  ) x;
 end if;
 perform set_config('role',old_role,true);perform set_config('request.jwt.claims',coalesce(old_claims,''),true);perform set_config('request.jwt.claim.sub',coalesce(old_sub,''),true);
 return result;
end $$;
notify pgrst,'reload schema';
commit;
