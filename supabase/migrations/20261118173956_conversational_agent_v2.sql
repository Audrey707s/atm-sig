begin;
-- Private orchestration state. No browser grants or permissive RLS policies.
create table public.atm_agent_sessions (
 user_id uuid not null references public.users(id) on delete cascade,
 channel text not null check(channel in ('web','whatsapp')), scope text not null,
 fingerprint text not null, memory jsonb not null default '{}',
 lease uuid, lease_until timestamptz, expires_at timestamptz not null default now()+interval '30 days',
 primary key(user_id,channel,scope)
);
create table public.atm_agent_requests (
 user_id uuid not null references public.users(id) on delete cascade,
 channel text not null, request_id text not null check(length(request_id) between 16 and 128),
 scope text not null, body_hash text not null, fingerprint text not null,
 lease uuid not null, result jsonb, created_at timestamptz not null default now(),
 primary key(user_id,channel,request_id)
);
create index atm_agent_requests_retention on public.atm_agent_requests(created_at);
create table public.atm_agent_traces (
 id bigint generated always as identity primary key,
 user_id uuid not null references public.users(id) on delete cascade,
 channel text not null, operation text, model text,
 input_tokens integer not null default 0 check(input_tokens>=0),
 output_tokens integer not null default 0 check(output_tokens>=0),
 latency_ms integer not null default 0 check(latency_ms>=0), outcome text not null,
 created_at timestamptz not null default now()
);
create index atm_agent_traces_retention on public.atm_agent_traces(created_at);
alter table public.atm_agent_sessions enable row level security;
alter table public.atm_agent_requests enable row level security;
alter table public.atm_agent_traces enable row level security;
revoke all on public.atm_agent_sessions,public.atm_agent_requests,public.atm_agent_traces from public,anon,authenticated;
grant all on public.atm_agent_sessions,public.atm_agent_requests,public.atm_agent_traces to service_role;
grant usage,select on sequence public.atm_agent_traces_id_seq to service_role;

-- Returns only a fingerprint, never another user's records. Reset context on scope changes.
create function public.atm_agent_identity(p_actor uuid,p_channel text,p_scope text,p_phone text,p_generation timestamptz)
returns text language plpgsql security invoker set search_path='' as $$
declare fingerprint text;
begin
 if p_channel not in ('web','whatsapp') or not exists(select 1 from public.users where id=p_actor and status='aktif') then raise exception 'Inactive identity';end if;
 if p_channel='web' and p_scope<>'default' and not exists(select 1 from public.ai_chat_threads where id::text=p_scope and user_id=p_actor) then raise exception 'Conversation not owned';end if;
 if p_channel='whatsapp' and (p_scope is distinct from p_phone or not exists(select 1 from public.whatsapp_links where user_id=p_actor and phone=p_phone and linked_at=p_generation and notifications_enabled)) then raise exception 'Link changed';end if;
 select md5(coalesce((select string_agg(id::text||':'||role_id::text||':'||org_unit_id::text||':'||coalesce(supervisor_id::text,'')||':'||status||':'||name,',' order by id) from public.users),'')||coalesce((select string_agg(id::text||':'||owner_id::text||':'||org_unit_id::text||':'||coalesce(reviewer_id::text,'')||':'||assigner_id::text,',' order by id) from public.tasks),'')||coalesce((select string_agg(id::text||':'||coalesce(parent_id::text,''),',' order by id) from public.org_units),'')) into fingerprint;
 return md5(fingerprint||coalesce(p_generation::text,''));
end $$;

create function public.atm_agent_claim(p_actor uuid,p_channel text,p_scope text,p_request text,p_hash text,p_phone text default null,p_generation timestamptz default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.atm_agent_sessions%rowtype; r public.atm_agent_requests%rowtype; fp text; tok uuid:=gen_random_uuid(); mem jsonb;
begin
 fp:=public.atm_agent_identity(p_actor,p_channel,p_scope,p_phone,p_generation);
 if length(p_request) not between 16 and 128 or p_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid request identity';end if;
 perform pg_advisory_xact_lock(hashtextextended('atm-agent:'||p_actor::text||':'||p_channel,0));
 -- Bounded retention, also applicable when cron is unavailable.
 delete from public.atm_agent_requests where user_id=p_actor and created_at<now()-interval '30 days';
 delete from public.atm_agent_traces where user_id=p_actor and created_at<now()-interval '30 days';
 delete from public.atm_agent_sessions where user_id=p_actor and expires_at<now();
 select * into r from public.atm_agent_requests where user_id=p_actor and channel=p_channel and request_id=p_request;
 if r.request_id is not null and (r.body_hash<>p_hash or r.scope<>p_scope) then raise exception 'Request identity reused';end if;
 if r.result is not null then
  return jsonb_build_object('cached',case when r.fingerprint=fp then r.result else jsonb_build_object('ok',false,'duplicate',true,'message','Permintaan sudah diproses. Hak akses berubah; buka data terbaru.') end);
 end if;
 if exists(select 1 from public.atm_agent_sessions where user_id=p_actor and channel=p_channel and lease_until>now()) then raise exception 'Conversation busy, retry';end if;
 if (select count(*) from public.atm_agent_requests where user_id=p_actor and created_at>now()-interval '1 minute')>=12 and r.request_id is null then raise exception 'Conversation rate limited';end if;
 select * into s from public.atm_agent_sessions where user_id=p_actor and channel=p_channel and scope=p_scope for update;
 mem:=case when s.fingerprint=fp then s.memory else '{}'::jsonb end;
 mem:=coalesce(mem,'{}');
 insert into public.atm_agent_sessions(user_id,channel,scope,fingerprint,memory,lease,lease_until) values(p_actor,p_channel,p_scope,fp,mem,tok,now()+interval '60 seconds')
 on conflict(user_id,channel,scope) do update set fingerprint=fp,memory=mem,lease=tok,lease_until=now()+interval '60 seconds',expires_at=now()+interval '30 days';
 insert into public.atm_agent_requests(user_id,channel,scope,request_id,body_hash,fingerprint,lease) values(p_actor,p_channel,p_scope,p_request,p_hash,fp,tok)
 on conflict(user_id,channel,request_id) do update set lease=tok,fingerprint=fp;
 -- Restore only backend-produced draft snapshots belonging to this conversation.
 delete from public.atm_ai_sessions where user_id=p_actor and channel=p_channel;
 delete from public.atm_ai_task_context where user_id=p_actor and channel=p_channel;
 if (mem->'draft'->>'expires_at')::timestamptz>now() then
  insert into public.atm_ai_sessions select x.* from jsonb_populate_record(null::public.atm_ai_sessions,mem->'draft') x where x.user_id=p_actor and x.channel=p_channel;
 end if;
 if (mem->'context'->>'expires_at')::timestamptz>now() then
  insert into public.atm_ai_task_context select x.* from jsonb_populate_record(null::public.atm_ai_task_context,mem->'context') x where x.user_id=p_actor and x.channel=p_channel;
 end if;
 return jsonb_build_object('lease',tok,'memory',mem);
end $$;

-- Execution, audit, WA receipt/outbox and replay result commit together.
create function public.atm_agent_execute(p_actor uuid,p_channel text,p_scope text,p_request text,p_lease uuid,p_kind text,p_payload jsonb,p_token text default null,p_phone text default null,p_receipt text default null,p_generation timestamptz default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.atm_agent_sessions%rowtype; r jsonb; fp text; mem jsonb; draft jsonb; ctx jsonb; recent jsonb; item jsonb; previews jsonb:='[]'; batch_token uuid; messages text:=''; step_num integer:=0; all_ready boolean:=true; step_result jsonb; target_table text;
begin
 if p_channel='whatsapp' and p_receipt is distinct from p_request then raise exception 'Receipt mismatch';end if;
 fp:=public.atm_agent_identity(p_actor,p_channel,p_scope,p_phone,p_generation);
 perform pg_advisory_xact_lock(hashtextextended('atm-agent:'||p_actor::text||':'||p_channel,0));
 select * into s from public.atm_agent_sessions where user_id=p_actor and channel=p_channel and scope=p_scope for update;
 if s.lease is distinct from p_lease or s.lease_until<=now() or s.fingerprint is distinct from fp then raise exception 'Stale execution lease';end if;
 if not exists(select 1 from public.atm_agent_requests where user_id=p_actor and channel=p_channel and scope=p_scope and request_id=p_request and lease=p_lease and result is null) then raise exception 'Request already finalized';end if;
 if p_kind not in ('propose','read','confirm','cancel','reply','select','batch') then raise exception 'Invalid action';end if;
 if p_kind='batch' then
  if jsonb_typeof(p_payload->'steps')<>'array' or jsonb_array_length(p_payload->'steps') not between 2 and 5 then raise exception 'Invalid batch';end if;
  if p_channel='whatsapp' and exists(select 1 from public.whatsapp_receipts where id=p_receipt) then raise exception 'Receipt already exists';end if;
  for item in select value from jsonb_array_elements(p_payload->'steps') loop
   if item->>'kind' not in ('read','propose') then raise exception 'Invalid batch action';end if;
   if step_num>0 and p_channel='whatsapp' then delete from public.whatsapp_outbox where receipt_id=p_receipt;delete from public.whatsapp_receipts where id=p_receipt;end if;
   step_num:=step_num+1;
   r:=public.atm_ai_turn(p_actor,p_channel,item->>'kind',item||case when p_channel='web' and p_scope<>'default' then jsonb_build_object('threadId',p_scope) else jsonb_build_object('linkGeneration',p_generation) end,null,p_phone,p_receipt);
   messages:=messages||case when messages='' then '' else E'\n\n' end||step_num||'. '||coalesce(r->>'message','Tidak dapat diproses.');
   if item->>'kind'='propose' then
    if r->>'pending' is distinct from 'true' then all_ready:=false;exit;end if;
    select to_jsonb(x) into draft from public.atm_ai_sessions x where user_id=p_actor and channel=p_channel;
    previews:=previews||jsonb_build_array(draft);
   elsif r->>'ok' is distinct from 'true' then all_ready:=false;exit;
   end if;
  end loop;
  if all_ready and jsonb_array_length(previews)>0 then
   batch_token:=gen_random_uuid();
   s.memory:=s.memory||jsonb_build_object('batch',previews,'batchToken',batch_token,'batchExpires',now()+interval '5 minutes','queued',null);
   r:=jsonb_build_object('ok',true,'pending',true,'token',batch_token,'message',messages||E'\n\nSemua perubahan akan disimpan bersama setelah konfirmasi.','path',coalesce(r->>'path','/tasks'));
  else
   s.memory:=(s.memory-'batch'-'batchToken'-'batchExpires')||jsonb_build_object('queued',case when not all_ready then p_payload->'steps' else null end);
   r:=r||jsonb_build_object('message',messages||case when not all_ready then E'\nBelum ada perubahan pada permintaan ini. Lengkapi tindakan yang belum valid sebelum melanjutkan.' else '' end);
  end if;
  if p_channel='whatsapp' then update public.whatsapp_outbox set body=left(r->>'message',3000)||case when r->>'pending'='true' then E'\nKetik YA untuk menyimpan semuanya atau BATAL.' else '' end||E'\nhttps://atm-sig.vercel.app/tasks' where receipt_id=p_receipt;end if;
 elsif p_kind='confirm' and jsonb_typeof(s.memory->'batch')='array' then
  if (s.memory->>'batchExpires')::timestamptz<=now() or (p_channel='web' and s.memory->>'batchToken' is distinct from p_token) then
   r:=jsonb_build_object('ok',false,'message','Konfirmasi kedaluwarsa atau tidak valid. Belum ada perubahan.');
  else
   begin
    -- Lock existing targets before checking all versions. Repeated edits to one task
    -- must not compare later steps to the pre-batch snapshot after our own write.
    for item in select value from jsonb_array_elements(s.memory->'batch') order by value->>'target' loop
     target_table:=case public.wa_operation_catalog()->(item->>'operation')->>'entity' when 'tasks' then 'tasks' when 'wbs' then 'wbs_items' when 'supports' then 'task_supports' when 'requirements' then 'evidence_requirements' when 'approvals' then 'deadline_change_requests' when 'categories' then 'task_categories' when 'templates' then 'task_templates' when 'organizations' then 'org_units' when 'notifications' then 'notifications' when 'reminders' then 'task_reminders' else null end;
     if (public.wa_operation_catalog()->(item->>'operation')->>'task')::boolean then target_table:='tasks';end if;
     if target_table is not null and item->>'target' is not null then execute format('select 1 from public.%I where id::text=$1 for update',target_table) using item->>'target';end if;
    end loop;
    for item in select value from jsonb_array_elements(s.memory->'batch') loop
     step_result:=public.wa_safe_operation(p_actor,item->>'operation',item->>'target',item->'payload',true,item->>'version');
     if step_result->>'ok' is distinct from 'true' then raise exception using errcode='P0001',message='Batch validation failed';end if;
    end loop;
    for item in select value from jsonb_array_elements(s.memory->'batch') loop
     step_result:=public.wa_safe_operation(p_actor,item->>'operation',item->>'target',item->'payload',false,null);
     if step_result->>'ok' is distinct from 'true' then raise exception using errcode='P0001',message='Batch validation failed';end if;
     insert into public.audit_logs(user_id,action,object,new_value) values(p_actor,'ai_'||p_channel||'_'||(item->>'operation'),coalesce(step_result->>'id','operation'),'AI batch confirmed by user');
     messages:=messages||case when messages='' then '' else E'\n' end||'• '||coalesce(step_result->>'label','Perubahan')||' — '||coalesce(step_result->>'subject','');
    end loop;
    r:=jsonb_build_object('ok',true,'changed',true,'message','Berhasil disimpan bersama:'||E'\n'||messages,'path',coalesce(step_result->>'path','/tasks'));
   exception when others then
    r:=jsonb_build_object('ok',false,'changed',false,'message','Seluruh perubahan dibatalkan karena salah satu data atau izin berubah. Tampilkan data terbaru lalu coba kembali.','path','/tasks');
   end;
  end if;
  s.memory:=s.memory-'batch'-'batchToken'-'batchExpires';
  perform public.atm_ai_turn(p_actor,p_channel,'reply',r||case when p_channel='web' and p_scope<>'default' then jsonb_build_object('threadId',p_scope) else jsonb_build_object('linkGeneration',p_generation) end,null,p_phone,p_receipt);
 else
  if p_kind in ('cancel','propose','read','select') then s.memory:=s.memory-'batch'-'batchToken'-'batchExpires';end if;
  r:=public.atm_ai_turn(p_actor,p_channel,p_kind,p_payload||case when p_channel='web' and p_scope<>'default' then jsonb_build_object('threadId',p_scope) else jsonb_build_object('linkGeneration',p_generation) end,p_token,p_phone,p_receipt);
 end if;

 -- Narrow, server-owned auto-apply policy; high-impact writes always retain preview.
 if p_kind='propose' and p_payload->>'exact'='true' and r->>'pending'='true' and (
   (p_payload->>'operation'='task_update' and (select count(*) from jsonb_object_keys(p_payload->'data'))=1 and p_payload->'data'?'prioritas')
   or (p_payload->>'operation'='task_progress' and p_payload->'data'->>'progres' ~ '^[0-9]{1,2}$')
 ) then
  if p_channel='whatsapp' then
   delete from public.whatsapp_outbox where receipt_id=p_receipt;
   delete from public.whatsapp_receipts where id=p_receipt;
  end if;
  r:=public.atm_ai_turn(p_actor,p_channel,'confirm',p_payload||case when p_channel='web' and p_scope<>'default' then jsonb_build_object('threadId',p_scope) else jsonb_build_object('linkGeneration',p_generation) end,r->>'token',p_phone,p_receipt);
 end if;
 if p_kind='reply' and (s.memory->'draft'->>'expires_at')::timestamptz>now() then
  insert into public.atm_ai_sessions select x.* from jsonb_populate_record(null::public.atm_ai_sessions,s.memory->'draft') x where x.user_id=p_actor and x.channel=p_channel on conflict(user_id,channel) do nothing;
 end if;
 select to_jsonb(x) into draft from public.atm_ai_sessions x where user_id=p_actor and channel=p_channel;
 select to_jsonb(x) into ctx from public.atm_ai_task_context x where user_id=p_actor and channel=p_channel;
 mem:=coalesce(s.memory,'{}')||jsonb_build_object('draft',draft,'context',ctx,'activeTask',ctx->>'task_id','activePIC',(select u.name from public.tasks t join public.users u on u.id=t.owner_id where t.id::text=ctx->>'task_id'));
 if p_kind='read' then mem:=mem||jsonb_build_object('filters',jsonb_strip_nulls(jsonb_build_object('entity',p_payload->>'entity','mode',p_payload->>'mode','query',p_payload->>'query','pic',p_payload->>'pic')));end if;
 -- Keep no raw tool arguments in observability. A bounded private conversational window is separate.
 recent:=coalesce(mem->'recent','[]')||jsonb_build_array(jsonb_build_object('role','user','text',left(coalesce(p_payload->>'_message',''),3000)),jsonb_build_object('role','assistant','text',left(coalesce(r->>'message',''),3000)));
 select coalesce(jsonb_agg(value order by n),'[]') into recent from jsonb_array_elements(recent) with ordinality x(value,n) where n>jsonb_array_length(recent)-12;
 mem:=mem||jsonb_build_object('recent',recent,'summary',jsonb_build_object('activeTask',ctx->>'task_id','operation',draft->>'operation','field',draft->'payload'->>'field','verifiedChanged',r->>'changed'));
 update public.atm_agent_requests set result=r where user_id=p_actor and channel=p_channel and request_id=p_request and lease=p_lease;
 update public.atm_agent_sessions set memory=mem,lease=null,lease_until=null,expires_at=now()+interval '30 days' where user_id=p_actor and channel=p_channel and scope=p_scope;
 insert into public.atm_agent_traces(user_id,channel,operation,model,input_tokens,output_tokens,latency_ms,outcome) values(p_actor,p_channel,left(p_payload->>'operation',80),left(p_payload->>'_model',100),least(1000000,greatest(0,coalesce((p_payload->>'_input')::integer,0))),least(1000000,greatest(0,coalesce((p_payload->>'_output')::integer,0))),least(120000,greatest(0,coalesce((p_payload->>'_latency')::integer,0))),case when r->>'changed'='true' then 'changed' when r->>'ok'='false' then 'denied' when r->>'pending'='true' then 'confirmation' else 'read_or_clarify' end);
 return r;
end $$;
-- Retrieval impersonates the real authenticated actor; matching never widens RLS.
create function public.atm_agent_candidates(p_actor uuid,p_query text default '') returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare result jsonb; old_role text:=current_user; old_claims text:=current_setting('request.jwt.claims',true); old_sub text:=current_setting('request.jwt.claim.sub',true);
begin
 if not exists(select 1 from public.users where id=p_actor and status='aktif') then return '[]'::jsonb;end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',p_actor,'role','authenticated')::text,true);
 perform set_config('request.jwt.claim.sub',p_actor::text,true);perform set_config('role','authenticated',true);
 select coalesce(jsonb_agg(x),'[]') into result from (
  select t.id,t.title,u.name as pic,rv.name as reviewer,o.name as organization,t.status,t.priority,to_char(t.due_date at time zone 'Asia/Jakarta','YYYY-MM-DD HH24:MI') as due
  from public.tasks t left join public.users u on u.id=t.owner_id left join public.users rv on rv.id=t.reviewer_id left join public.org_units o on o.id=t.org_unit_id
  where coalesce(p_query,'')='' or position(lower(p_query) in lower(t.title))>0 or to_tsvector('simple',t.title)@@plainto_tsquery('simple',p_query)
  order by (lower(t.title)=lower(p_query)) desc,t.due_date,t.id limit 30
 ) x;
 perform set_config('role',old_role,true);perform set_config('request.jwt.claims',coalesce(old_claims,''),true);perform set_config('request.jwt.claim.sub',coalesce(old_sub,''),true);
 return result;
end $$;
create function public.atm_agent_purge() returns void language sql security invoker set search_path='' as $$
 delete from public.atm_agent_requests where created_at<now()-interval '30 days';
 delete from public.atm_agent_traces where created_at<now()-interval '30 days';
 delete from public.atm_agent_sessions where expires_at<now();
$$;
revoke all on function public.atm_agent_candidates(uuid,text),public.atm_agent_purge() from public,anon,authenticated;
grant execute on function public.atm_agent_candidates(uuid,text),public.atm_agent_purge() to service_role;
revoke all on function public.atm_agent_identity(uuid,text,text,text,timestamptz),public.atm_agent_claim(uuid,text,text,text,text,text,timestamptz),public.atm_agent_execute(uuid,text,text,text,uuid,text,jsonb,text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.atm_agent_identity(uuid,text,text,text,timestamptz),public.atm_agent_claim(uuid,text,text,text,text,text,timestamptz),public.atm_agent_execute(uuid,text,text,text,uuid,text,jsonb,text,text,text,timestamptz) to service_role;
do $$begin if exists(select 1 from pg_namespace where nspname='cron') then execute $q$select cron.schedule('atm-agent-retention','17 19 * * *','select public.atm_agent_purge()')$q$;end if;end$$;
notify pgrst,'reload schema';
commit;
