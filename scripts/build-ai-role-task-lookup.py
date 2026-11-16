from pathlib import Path
import re
root=Path('supabase/migrations');base=(root/'20261116105757_ai_conversation_grounding.sql').read_text();target=next(root.glob('*_ai_role_task_lookup.sql'))
turn=re.search(r'create or replace function public\.atm_ai_turn\(.*?end \$\$;',base,re.S).group(0)
helper=r"""
-- Owner lookup only narrows the authenticated task scope; it never grants access.
create or replace function public.atm_ai_task_lookup(p_actor uuid,p_query text default '',p_mode text default 'list',p_page integer default 1,p_pic text default null)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare result jsonb; rows jsonb; owner_ids uuid[]; v_owner_id uuid; owner_name text; q text:=coalesce(p_query,'');
 old_role text:=current_user; old_claims text:=current_setting('request.jwt.claims',true); old_sub text:=current_setting('request.jwt.claim.sub',true);
begin
 if not exists(select 1 from public.users where id=p_actor and status='aktif') then return jsonb_build_object('ok',false,'message','Akun tidak aktif.');end if;
 if nullif(btrim(p_pic),'') is null then return jsonb_build_object('ok',true,'rows',public.atm_ai_task_page(p_actor,p_query,p_mode,p_page));end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',p_actor,'role','authenticated')::text,true);
 perform set_config('request.jwt.claim.sub',p_actor::text,true);perform set_config('role','authenticated',true);
 select array_agg(u.id) into owner_ids from public.users u where u.status='aktif' and (lower(btrim(u.name))=lower(btrim(p_pic)) or lower(u.email)=lower(btrim(p_pic)) or u.id::text=p_pic);
 if coalesce(cardinality(owner_ids),0)=0 then
  result:=jsonb_build_object('ok',false,'message','PIC tidak ditemukan. Sebutkan nama lengkap atau email PIC.');
 elsif cardinality(owner_ids)>1 then
  result:=jsonb_build_object('ok',false,'message','Ada beberapa PIC dengan nama yang sama. Sebutkan email PIC agar tidak salah memilih.');
 else
  v_owner_id:=owner_ids[1];select name into owner_name from public.users where id=v_owner_id;
  if lower(btrim(q))=lower(btrim(p_pic)) then q:='';end if;
  if p_mode='report' then
   select jsonb_build_object('total',count(*),'done',count(*) filter(where status='Done'),'review',count(*) filter(where status='Review'),'overdue',count(*) filter(where status<>'Done' and due_date<now())) into rows from public.tasks where tasks.owner_id=v_owner_id and (q='' or position(lower(q) in lower(title))>0);
  else
   select coalesce(jsonb_agg(x),'[]') into rows from (
    select t.id,t.title,t.status,t.progress_pct,to_char(t.due_date at time zone 'Asia/Jakarta','DD/MM/YYYY HH24:MI') as due,t.owner_id=p_actor as mine
    from public.tasks t where t.owner_id=v_owner_id
     and (q='' or position(lower(q) in lower(t.title))>0 or t.id::text=lower(q))
     and (p_mode not in ('mine','mine_calendar','mine_open') or t.owner_id=p_actor)
     and (p_mode not in ('mine_open','open') or t.status<>'Done')
     and (p_mode<>'review' or (t.status='Review' and t.reviewer_id=p_actor))
     and (p_mode not in ('calendar','mine_calendar') or (t.status<>'Done' and t.due_date>=now() and t.due_date<now()+interval '7 days'))
    order by t.due_date,t.id limit 6 offset (greatest(1,least(9999,coalesce(p_page,1)))-1)*5
   ) x;
  end if;
  result:=jsonb_build_object('ok',true,'rows',rows,'pic',owner_name,'owner',v_owner_id);
 end if;
 perform set_config('role',old_role,true);perform set_config('request.jwt.claims',coalesce(old_claims,''),true);perform set_config('request.jwt.claim.sub',coalesce(old_sub,''),true);
 -- Unqualified “lihat tugas X” may name a task instead. An explicit PIC request
 -- has an empty query, so a missing person is never broadened to all tasks.
 if coalesce(cardinality(owner_ids),0)=0 and nullif(btrim(p_query),'') is not null then return jsonb_build_object('ok',true,'rows',public.atm_ai_task_page(p_actor,p_query,p_mode,p_page));end if;
 return result;
end $$;
revoke all on function public.atm_ai_task_lookup(uuid,text,text,integer,text) from public,anon,authenticated;
grant execute on function public.atm_ai_task_lookup(uuid,text,text,integer,text) to service_role;
"""
turn=turn.replace("where value->>'id'=target;", "where value->>'id'=target or (p_payload->>'exact'='true' and lower(value->>'title')=lower(target));")
turn=turn.replace('elsif coalesce(jsonb_array_length(candidates),0)>20 then','elsif coalesce(jsonb_array_length(candidates),0)>10 then')
needle="   candidates:=public.atm_ai_task_page(actor,left(coalesce(p_payload->>'query',''),200),coalesce(p_payload->>'mode','list'),page_no);"
assert needle in turn
turn=turn.replace(needle,"   r:=public.atm_ai_task_lookup(actor,left(coalesce(p_payload->>'query',''),200),coalesce(p_payload->>'mode','list'),page_no,left(p_payload->>'pic',200));\n   if r->>'ok'='true' then\n   candidates:=r->'rows';")
turn=turn.replace("   if jsonb_typeof(candidates)='array' then msg:=msg", "   if r?'pic' then msg:='Tugas PIC: '||(r->>'pic')||case when p_payload->>'mode' in ('mine_open','open') then ' — masih open' else '' end;end if;\n   if jsonb_typeof(candidates)='array' then msg:=msg")
turn=turn.replace("else 'daftar tugas' end||case when p_payload", "else 'daftar tugas' end||case when r?'pic' then ' milik '||(r->>'pic') else '' end||case when p_payload")
turn=turn.replace("'path',case when p_payload->>'mode' in ('mine','mine_open')", "'path',case when r?'owner' then '/tasks?owner='||(r->>'owner') when p_payload->>'mode' in ('mine','mine_open')")
needle="   if more then insert into public.atm_ai_sessions(user_id,channel,payload,phone,linked_at,expires_at) values(actor,p_channel,jsonb_build_object('lastRead',p_payload||jsonb_build_object('page',page_no)),p_phone,link_time,now()+interval '15 minutes');end if;"
assert needle in turn
turn=turn.replace(needle,needle+"\n   else r:=r||jsonb_build_object('path','/tasks');end if;")
target.write_text('begin;\n'+helper+'\n'+turn+"\nnotify pgrst,'reload schema';\ncommit;\n")
