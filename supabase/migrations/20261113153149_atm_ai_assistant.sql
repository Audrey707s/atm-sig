begin;
create table public.atm_ai_sessions (
 user_id uuid not null references public.users(id) on delete cascade,
 channel text not null check(channel in ('web','whatsapp')),
 token uuid, operation text, target text, payload jsonb, version text,
 phone text, linked_at timestamptz, expires_at timestamptz,
 primary key(user_id,channel)
);
alter table public.atm_ai_sessions enable row level security;
revoke all on public.atm_ai_sessions from public,anon,authenticated;
grant select,insert,update,delete on public.atm_ai_sessions to service_role;
create table public.atm_ai_limits (
 user_id uuid not null references public.users(id) on delete cascade,
 window_start timestamptz not null, requests integer not null default 0,
 context_web jsonb not null default '[]', context_whatsapp jsonb not null default '[]', context_at timestamptz,
 primary key(user_id)
);
alter table public.atm_ai_limits enable row level security;
revoke all on public.atm_ai_limits from public,anon,authenticated;
grant select,insert,update,delete on public.atm_ai_limits to service_role;

-- Reuses the established central task scope. No raw rows or arbitrary SQL go to the model.
create function public.atm_ai_tasks(p_actor uuid,p_query text default '',p_mode text default 'list') returns jsonb
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
    and (p_mode<>'mine' or t.owner_id=p_actor)
    and (p_mode<>'review' or (t.status='Review' and t.reviewer_id=p_actor))
    and (p_mode<>'calendar' or (t.status<>'Done' and t.due_date>=now() and t.due_date<now()+interval '7 days'))
   order by t.due_date,t.id limit 21
  ) x;
 end if;
 perform set_config('role',old_role,true);perform set_config('request.jwt.claims',coalesce(old_claims,''),true);perform set_config('request.jwt.claim.sub',coalesce(old_sub,''),true);
 return result;
end $$;
revoke all on function public.atm_ai_tasks(uuid,text,text) from public,anon,authenticated;
grant execute on function public.atm_ai_tasks(uuid,text,text) to service_role;

-- Service-only boundary. Web actor comes from getUser, WhatsApp actor is resolved here
-- from the verified phone; neither the model nor the browser chooses that actor.
create function public.atm_ai_turn(p_actor uuid,p_channel text,p_kind text,p_payload jsonb default '{}',p_token text default null,p_phone text default null,p_receipt text default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare actor uuid:=p_actor; lv integer; link_time timestamptz; s public.atm_ai_sessions%rowtype; r jsonb; spec jsonb; target text:=nullif(p_payload->>'target',''); candidates jsonb; tok uuid; msg text; lim integer; ins text; op text:=p_payload->>'operation'; f text; inserted text; history jsonb;
begin
 if p_channel not in ('web','whatsapp') or octet_length(p_payload::text)>16000 then raise exception 'Invalid request';end if;
 if p_channel='whatsapp' then
  if p_phone !~ '^[1-9][0-9]{7,14}$' or p_receipt !~ '^[a-f0-9]{64}$' then raise exception 'Invalid message';end if;
  select l.user_id,l.linked_at into actor,link_time from public.whatsapp_links l join public.users u on u.id=l.user_id and u.status='aktif' where l.phone=p_phone and l.notifications_enabled and l.linked_at is not null for update of l;
  if actor is distinct from p_actor or link_time is distinct from nullif(p_payload->>'linkGeneration','')::timestamptz then return jsonb_build_object('ok',false,'message','Koneksi berubah. Kirim ulang pesan dari nomor terhubung.');end if;
  if actor is null then return jsonb_build_object('ok',false,'message','Hubungkan akun aktif melalui Profil ATM, lalu ketik MULAI.');end if;
 end if;
 select ro.level into lv from public.users u join public.roles ro on ro.id=u.role_id where u.id=actor and u.status='aktif';
 if lv is null then return jsonb_build_object('ok',false,'message','Akun tidak aktif atau sesi telah berakhir.');end if;
 perform pg_advisory_xact_lock(hashtextextended('atm-ai:'||actor::text,0));
 if p_channel='whatsapp' then
  if exists(select 1 from public.whatsapp_receipts where id=p_receipt) then return jsonb_build_object('duplicate',true);end if;
  insert into public.whatsapp_receipts(id,sender) values(p_receipt,p_phone) on conflict do nothing returning id into inserted;
  if inserted is null then return jsonb_build_object('duplicate',true);end if;
 end if;
 if p_kind='reserve' then
  insert into public.atm_ai_limits(user_id,window_start,requests) values(actor,date_trunc('minute',now()),1)
   on conflict(user_id) do update set window_start=case when atm_ai_limits.window_start<date_trunc('minute',now()) then date_trunc('minute',now()) else atm_ai_limits.window_start end,requests=case when atm_ai_limits.window_start<date_trunc('minute',now()) then 1 else atm_ai_limits.requests+1 end returning requests into lim;
  if lim<=8 and length(coalesce(p_payload->>'message','')) between 1 and 4000 then
   select case when context_at>now()-interval '15 minutes' then case when p_payload->>'contextChannel'='whatsapp' then context_whatsapp else context_web end else '[]'::jsonb end into history from public.atm_ai_limits where user_id=actor;
   history:=coalesce(history,'[]')||jsonb_build_array(left(p_payload->>'message',3000));
   select coalesce(jsonb_agg(value order by n),'[]') into history from jsonb_array_elements(history) with ordinality x(value,n) where n>jsonb_array_length(history)-4;
   update public.atm_ai_limits set context_web=case when p_payload->>'contextChannel'='whatsapp' then context_web else history end,context_whatsapp=case when p_payload->>'contextChannel'='whatsapp' then history else context_whatsapp end,context_at=now() where user_id=actor;
  end if;
  return jsonb_build_object('ok',lim<=8,'history',coalesce(history,'[]'));
 end if;
 if p_channel='whatsapp' and p_kind<>'reserve' then
  delete from public.whatsapp_action_sessions where user_id=actor;
  delete from public.whatsapp_chat_sessions where user_id=actor;
  delete from public.whatsapp_confirmations where user_id=actor;
 end if;
 if p_kind in ('confirm','cancel') then update public.atm_ai_limits set context_web=case when p_channel='web' then '[]'::jsonb else context_web end,context_whatsapp=case when p_channel='whatsapp' then '[]'::jsonb else context_whatsapp end where user_id=actor;end if;
 if p_kind='confirm' then
  select * into s from public.atm_ai_sessions where user_id=actor and channel=p_channel for update;
  delete from public.atm_ai_sessions where user_id=actor and channel=p_channel;
  if s.token is null or s.expires_at<=now() or (p_channel='web' and s.token::text is distinct from p_token) or (p_channel='whatsapp' and (s.phone is distinct from p_phone or s.linked_at is distinct from link_time)) then
   r:=jsonb_build_object('ok',false,'message','Konfirmasi tidak valid atau kedaluwarsa. Kirim ulang permintaan.');
  else
   r:=public.wa_safe_operation(actor,s.operation,s.target,s.payload,false,s.version);
   msg:=case when (r->>'ok')::boolean then 'Berhasil: '||(r->>'label')||' — '||(r->>'subject') else coalesce(r->>'error','Perubahan tidak disimpan.') end;
   if (r->>'ok')::boolean then
    insert into public.audit_logs(user_id,action,object,new_value) values(actor,'ai_'||p_channel||'_'||s.operation,coalesce(r->>'id','operation'),'Confirmed by user');
   end if;
   r:=r||jsonb_build_object('message',msg,'changed',coalesce((r->>'ok')::boolean,false));
  end if;
 elsif p_kind='cancel' then
  delete from public.atm_ai_sessions where user_id=actor and channel=p_channel;
  r:=jsonb_build_object('ok',true,'message','Perubahan yang belum disimpan dibatalkan.');
 elsif p_kind='propose' then
  -- Every new intent invalidates the older preview, including invalid replacements.
  delete from public.atm_ai_sessions where user_id=actor and channel=p_channel;
  spec:=public.wa_operation_catalog()->op;
  if spec is null or lv<(spec->>'minimumRole')::integer then r:=jsonb_build_object('ok',false,'message','Permintaan berada di luar hak akses Anda.');
  else
   if target is not null and spec->>'entity' in ('tasks','wbs','supports','requirements') and (spec->>'task')::boolean then
    candidates:=public.atm_ai_tasks(actor,target,'list');
    if jsonb_array_length(candidates)=1 then target:=candidates->0->>'id';else target:=null;end if;
   end if;
   if target is null and ((spec->>'task')::boolean or op not in ('task_create','category_create','template_create','org_create','notification_all','profile_name')) then
    r:=jsonb_build_object('ok',false,'message','Tugas/data belum cocok secara unik. Gunakan judul lengkap atau ID dari daftar yang dapat Anda akses.');
   else
    r:=public.wa_safe_operation(actor,op,target,coalesce(p_payload->'data','{}'),true,null);
    if (r->>'ok')::boolean then
     tok:=gen_random_uuid();
     insert into public.atm_ai_sessions(user_id,channel,token,operation,target,payload,version,phone,linked_at,expires_at) values(actor,p_channel,tok,op,target,coalesce(p_payload->'data','{}'),r->>'version',p_phone,link_time,now()+interval '5 minutes');
     msg:='Pratinjau: '||(r->>'label')||' — '||(r->>'subject');
     for f in select key||': '||value from jsonb_each_text(coalesce(p_payload->'data','{}')) loop msg:=msg||E'\n'||f;end loop;
     r:=r||jsonb_build_object('message',msg||E'\nBelum disimpan. Konfirmasi dalam 5 menit atau batalkan.','pending',true,'token',tok);
    else r:=r||jsonb_build_object('message',coalesce(r->>'error','Isian belum valid.'));end if;
   end if;
  end if;
 elsif p_kind='read' then
  delete from public.atm_ai_sessions where user_id=actor and channel=p_channel;
  if p_payload->>'entity'='tasks' then
   r:=jsonb_build_object('ok',true,'rows',public.atm_ai_tasks(actor,left(coalesce(p_payload->>'query',''),200),coalesce(p_payload->>'mode','list')),'path','/tasks','message','Tugas dalam cakupan akses Anda');
  else
   r:=public.wa_read_feature(actor,p_payload->>'entity',nullif(p_payload->>'task','')::uuid,greatest(1,least(1000,coalesce((p_payload->>'page')::integer,1))));
   r:=r||jsonb_build_object('message',case when (r->>'ok')::boolean then 'Data dalam cakupan akses Anda' else coalesce(r->>'error','Akses ditolak.') end);
  end if;
 elsif p_kind='reply' then
  delete from public.atm_ai_sessions where user_id=actor and channel=p_channel;
  r:=jsonb_build_object('ok',true,'message',left(p_payload->>'message',2500),'path',p_payload->>'path');
 else raise exception 'Invalid action';end if;
 if p_channel='whatsapp' then
  msg:=coalesce(r->>'message','Permintaan tidak dapat diproses.');
  if jsonb_typeof(r->'rows')='array' then
   for candidates in select value from jsonb_array_elements(r->'rows') limit 5 loop
    msg:=msg||E'\n\n'||coalesce(candidates->>'title',candidates->>'label','Data')||E'\n'||coalesce(candidates->>'status',candidates->>'details','')||E'\nID: '||(candidates->>'id');
   end loop;
   if jsonb_array_length(r->'rows')=0 then msg:=msg||E'\nTidak ada hasil.';end if;
  elsif jsonb_typeof(r->'rows')='object' then msg:=msg||E'\nTotal: '||(r->'rows'->>'total')||' · Selesai: '||(r->'rows'->>'done')||' · Review: '||(r->'rows'->>'review')||' · Lewat tenggat: '||(r->'rows'->>'overdue');end if;
  if r->>'pending'='true' then msg:=msg||E'\nKetik YA untuk menyimpan atau BATAL.';end if;
  msg:=left(msg,3000);
  if r->>'path' like '/%' and r->>'path' not like '//%' then msg:=msg||E'\n\nhttps://atm-sig.vercel.app'||(r->>'path');end if;
  insert into public.whatsapp_outbox(receipt_id,user_id,phone,body) values(p_receipt,actor,p_phone,left(msg,3500));
 end if;
 return r;
end $$;
revoke all on function public.atm_ai_turn(uuid,text,text,jsonb,text,text,text) from public,anon,authenticated;
grant execute on function public.atm_ai_turn(uuid,text,text,jsonb,text,text,text) to service_role;
notify pgrst,'reload schema';
commit;
