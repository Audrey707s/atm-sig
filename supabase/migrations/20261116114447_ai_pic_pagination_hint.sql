begin;
create or replace function public.atm_ai_turn(p_actor uuid,p_channel text,p_kind text,p_payload jsonb default '{}',p_token text default null,p_phone text default null,p_receipt text default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare actor uuid:=p_actor; lv integer; link_time timestamptz; s public.atm_ai_sessions%rowtype; r jsonb; spec jsonb; target text:=nullif(p_payload->>'target',''); candidates jsonb; tok uuid; msg text; lim integer; ins text; op text:=p_payload->>'operation'; f text; inserted text; history jsonb; choice integer; selected text; page_no integer; more boolean;
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
   select coalesce(jsonb_agg(value order by n),'[]') into history from jsonb_array_elements(history) with ordinality x(value,n) where n>jsonb_array_length(history)-8;
   update public.atm_ai_limits set context_web=case when p_payload->>'contextChannel'='whatsapp' then context_web else history end,context_whatsapp=case when p_payload->>'contextChannel'='whatsapp' then history else context_whatsapp end,context_at=now() where user_id=actor;
  end if;
  return jsonb_build_object('ok',lim<=8,'history',coalesce(history,'[]'));
 end if;
 if p_channel='whatsapp' and p_kind<>'reserve' then
  delete from public.whatsapp_action_sessions where user_id=actor;
  delete from public.whatsapp_chat_sessions where user_id=actor;
  delete from public.whatsapp_confirmations where user_id=actor;
 end if;
 if p_kind='select' then
  select * into s from public.atm_ai_sessions where user_id=actor and channel=p_channel for update;
  choice:=case when p_payload->>'choice' ~ '^[1-9][0-9]?$' then (p_payload->>'choice')::integer else 0 end;
  if s.token is null and s.expires_at>now() and jsonb_typeof(s.payload->'choices')='array'
   and (p_channel='web' or (s.phone=p_phone and s.linked_at=link_time)) and choice between 1 and jsonb_array_length(s.payload->'choices') then
   selected:=s.payload->'choices'->(choice-1)->>'id';
   p_payload:=jsonb_build_object('operation',s.operation,'target',selected,'data',s.payload->'data');
   op:=s.operation;target:=selected;p_kind:='propose';
  else p_kind:='reply';p_payload:=jsonb_build_object('message','Pilihan tidak valid atau kedaluwarsa. Kirim ulang judul/kata kunci tugas dan perubahan yang diinginkan.');end if;
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
   candidates:=null;
   if target is not null then
    if (spec->>'task')::boolean then candidates:=public.atm_ai_tasks(actor,target,'list');
    elsif spec->>'entity' in ('wbs','supports','requirements','categories','templates','organizations','notifications','reminders','approvals') then
     candidates:=public.atm_ai_named_records(actor,spec->>'entity',target);
    end if;
    if candidates is not null then
     -- Prefer an explicit ID/exact title; otherwise require a unique substring match.
     select coalesce(jsonb_agg(value),'[]') into history from jsonb_array_elements(candidates) where value->>'id'=target or (p_payload->>'exact'='true' and lower(value->>'title')=lower(target));
     if jsonb_array_length(history)=1 then candidates:=history;end if;
     if jsonb_array_length(candidates)=1 then target:=candidates->0->>'id';else target:=null;end if;
    end if;
   end if;
   if target is null and ((spec->>'task')::boolean or op not in ('task_create','category_create','template_create','org_create','notification_all','profile_name')) then
    if coalesce(jsonb_array_length(candidates),0)>1 and jsonb_array_length(candidates)<=10 then
     insert into public.atm_ai_sessions(user_id,channel,operation,payload,phone,linked_at,expires_at)
      values(actor,p_channel,op,jsonb_build_object('data',coalesce(p_payload->'data','{}'),'choices',candidates),p_phone,link_time,now()+interval '5 minutes');
     r:=jsonb_build_object('ok',true,'selection',true,'rows',candidates,'path','/tasks','message','Ada beberapa data yang cocok. Balas nomor pilihan (misalnya “pilih 2”). Perubahan belum disimpan; setelah memilih akan ada pratinjau dan konfirmasi.');
    elsif coalesce(jsonb_array_length(candidates),0)>10 then
     r:=jsonb_build_object('ok',false,'message','Ada lebih dari 10 hasil yang cocok. Tambahkan kata kunci yang lebih spesifik agar saya dapat menampilkan pilihan. Belum ada perubahan.');
    else r:=jsonb_build_object('ok',false,'message','Tidak ditemukan data yang cocok dalam hak akses Anda. Coba kata kunci lain atau lihat daftar tugas. Belum ada perubahan.');end if;
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
   page_no:=case when p_payload->>'page' ~ '^[1-9][0-9]{0,3}$' then (p_payload->>'page')::integer else 1 end;
   r:=public.atm_ai_task_lookup(actor,left(coalesce(p_payload->>'query',''),200),coalesce(p_payload->>'mode','list'),page_no,left(p_payload->>'pic',200));
   if r->>'ok'='true' then
   candidates:=r->'rows';
   more:=case when jsonb_typeof(candidates)='array' then jsonb_array_length(candidates)>5 else false end;
   if more then select jsonb_agg(value order by n) into candidates from jsonb_array_elements(candidates) with ordinality x(value,n) where n<=5;end if;
   msg:=case p_payload->>'mode' when 'mine' then 'Tugas saya sebagai PIC' when 'mine_open' then 'Tugas saya yang masih open' when 'open' then 'Tugas open sesuai hak akses Anda' when 'review' then 'Tugas yang ditugaskan untuk saya review' else 'Daftar tugas sesuai hak akses Anda' end;
   if r?'pic' then msg:='Tugas PIC: '||(r->>'pic')||case when p_payload->>'mode' in ('mine_open','open') then ' — masih open' else '' end;end if;
   if jsonb_typeof(candidates)='array' then msg:=msg||' — halaman '||page_no||case when more then E'\nMasih ada tugas berikutnya. Ketik LANJUT atau “'||case when p_payload->>'mode' in ('mine','mine_open') then 'tugas saya' when p_payload->>'mode'='review' then 'review saya' else 'daftar tugas' end||case when r?'pic' then ' milik '||(r->>'pic') else '' end||case when p_payload->>'mode' in ('mine_open','open') then ' open' else '' end||case when r?'pic' then ' halaman '||(page_no+1)||'”.' when coalesce(p_payload->>'query','')<>'' then '” atau gunakan “cari tugas '||(p_payload->>'query')||' halaman '||(page_no+1)||'” untuk hasil berikutnya.' else ' halaman '||(page_no+1)||'”.' end else '' end;end if;
   r:=jsonb_build_object('ok',true,'rows',candidates,'hasMore',more,'page',page_no,'path',case when r?'owner' then '/tasks?owner='||(r->>'owner') when p_payload->>'mode' in ('mine','mine_open') then '/tasks?mine=1' when p_payload->>'mode'='review' then '/review-inbox' else '/tasks' end,'message',msg);

   if more then insert into public.atm_ai_sessions(user_id,channel,payload,phone,linked_at,expires_at) values(actor,p_channel,jsonb_build_object('lastRead',p_payload||jsonb_build_object('page',page_no)),p_phone,link_time,now()+interval '15 minutes');end if;
   else r:=r||jsonb_build_object('path','/tasks');end if;
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
   choice:=0;
   for candidates in select value from jsonb_array_elements(r->'rows') limit 20 loop
    choice:=choice+1;
    msg:=msg||E'\n\n'||choice||'. '||left(coalesce(candidates->>'title',candidates->>'label','Data'),80)||E'\n'||coalesce(candidates->>'status',candidates->>'details','')||case when candidates?'due' then E'\nTenggat: '||(candidates->>'due')||' WIB' else '' end||case when candidates?'progress_pct' then ' · '||(candidates->>'progress_pct')||'%' else '' end||E'\nID: '||(candidates->>'id');
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
notify pgrst,'reload schema';
commit;
