begin;
alter table public.atm_ai_sessions add column conversation_id uuid;
alter table public.atm_ai_task_context add column conversation_id uuid;
create or replace function public.atm_ai_guided_fields(p_actor uuid,p_op text,p_data jsonb,p_target text default null) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare d jsonb:=coalesce(p_data,'{}'); spec jsonb:=public.wa_operation_catalog()->p_op; field text; question text; options jsonb:='[]'; result jsonb;
 actor_level integer; actor_org integer; owner_id uuid:=p_actor; owner_org integer; matches uuid[]; value text; section_id integer;
 old_role text:=current_user; old_claims text:=current_setting('request.jwt.claims',true); old_sub text:=current_setting('request.jwt.claim.sub',true);
begin
 select u.org_unit_id,r.level into actor_org,actor_level from public.users u join public.roles r on r.id=u.role_id where u.id=p_actor and u.status='aktif';
 if actor_level is null or spec is null or actor_level<(spec->>'minimumRole')::integer then return jsonb_build_object('ok',false,'message','Aksi berada di luar hak akses Anda.');end if;
 for field in select jsonb_object_keys(d) loop if not (spec->'fields')?field then return jsonb_build_object('ok',false,'message','Isian tidak tersedia untuk aksi ini.');end if;end loop;
 field:=null;
 <<dates>> begin
  if p_op in ('task_create','task_duplicate','task_deadline','task_update') then
   for value in select key from jsonb_each_text(d) where key in ('mulai','tenggat') loop
    if d->>value !~ '^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}$' then
     d:=jsonb_set(d,array[value],to_jsonb(public.wa_natural_timestamp(d->>value)));
     if d is null or d->value='null'::jsonb then d:=coalesce(d,p_data)-value;field:=value;question:='Kapan '||case value when 'mulai' then 'mulainya' else 'tenggatnya' end||'? Balas seperti “besok jam 8 pagi” atau tanggal dan jam WIB.';exit dates;end if;
    end if;
    begin perform (d->>value)::timestamp;exception when invalid_datetime_format or datetime_field_overflow then d:=d-value;field:=value;question:='Tanggal atau jam itu belum valid. Kapan '||value||' yang benar?';exit dates;end;
   end loop;
   if d?'mulai' and d?'tenggat' and (d->>'tenggat')::timestamp<=(d->>'mulai')::timestamp then d:=d-'tenggat';field:='tenggat';question:='Tenggat harus setelah waktu mulai. Kapan tenggat barunya?';exit dates;end if;
  end if;
 end dates;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',p_actor,'role','authenticated')::text,true);perform set_config('request.jwt.claim.sub',p_actor::text,true);perform set_config('role','authenticated',true);
 <<guided>> begin
  if field is not null then exit guided;end if;
  if p_op in ('task_create','task_duplicate','template_create','task_reassign') and d?'pic' and lower(d->>'pic')<>'saya' then
   select array_agg(u.id) into matches from public.users u join public.roles r on r.id=u.role_id where u.status='aktif' and r.level>=2 and (lower(u.name)=lower(btrim(d->>'pic')) or lower(u.email)=lower(btrim(d->>'pic')));
   if coalesce(cardinality(matches),0)<>1 then d:=d-'pic';field:='pic';question:='PIC belum cocok dengan satu akun aktif. Siapa PIC-nya? Sebutkan nama lengkap atau email.';exit guided;end if;
   owner_id:=matches[1];
  end if;
  if p_op in ('task_create','task_duplicate','template_create') then
   if actor_level=2 and owner_id<>p_actor then result:=jsonb_build_object('ok',false,'message','Role PIC hanya dapat membuat pekerjaan untuk dirinya sendiri.');exit guided;end if;
   select org_unit_id into owner_org from public.users where id=owner_id;
   if not d?'seksi' and exists(select 1 from public.org_units where id=owner_org and type='section') then d:=d||jsonb_build_object('seksi',owner_org::text);end if;
  end if;
  if p_op='template_create' and d?'judul' and not d?'nama' then d:=d||jsonb_build_object('nama',d->>'judul');end if;
  if d?'seksi' then
   select min(o.id) into section_id from public.org_units o where o.type='section' and (o.id::text=d->>'seksi' or lower(o.name)=lower(btrim(d->>'seksi'))) having count(*)=1;
   if section_id is null then d:=d-'seksi';
   elsif not public.can_manage_org_unit(section_id) then result:=jsonb_build_object('ok',false,'message','Seksi atau PIC berada di luar cakupan pengelolaan akun Anda.');exit guided;end if;
  end if;
  if p_op='template_create' and d?'kategori' and section_id is not null and not exists(select 1 from public.task_categories where org_unit_id=section_id and is_active and lower(name)=lower(btrim(d->>'kategori'))) then d:=d-'kategori';end if;
  select key into field from (select x.value as key,x.n from jsonb_array_elements_text(spec->'required') with ordinality x(value,n)) required where coalesce(btrim(d->>key),'')='' order by n limit 1;
  if p_op='template_create' then
   select key into field from unnest(array['judul','seksi','kategori','frekuensi','hari','mulai','tenggat']) with ordinality x(key,n) where coalesce(btrim(d->>key),'')='' order by n limit 1;
  end if;
  if p_op='task_update' and d='{}'::jsonb then field:='update';end if;
  if p_op='task_create' and field is null and section_id is null then field:='seksi';end if;
  if p_op='task_deadline' and actor_level=2 and coalesce(d->>'alasan','')='' then field:='alasan';end if;
  if p_op='task_review' and lower(d->>'keputusan')='revisi' and coalesce(d->>'komentar','')='' then field:='komentar';end if;
  if p_op like 'template_%' then
   if d?'frekuensi' and d->>'frekuensi' not in ('weekly','monthly') then field:='frekuensi';d:=d-'frekuensi';end if;
   for value in select key from jsonb_each_text(d) where key in ('hari','mulai','tenggat') loop
    if d->>value !~ '^[0-9]+$' then field:=value;d:=d-value;exit;end if;
   end loop;
   if d?'hari' and ((d->>'hari')::integer<1 or (d->>'hari')::integer>case when d->>'frekuensi'='weekly' then 7 else 31 end) then d:=d-'hari';field:='hari';end if;
   if d?'mulai' and (d->>'mulai')::integer not between 0 and 365 then d:=d-'mulai';field:='mulai';end if;
   if d?'tenggat' and ((d->>'tenggat')::integer not between 1 and 366 or (d?'mulai' and (d->>'tenggat')::integer<=(d->>'mulai')::integer)) then d:=d-'tenggat';field:='tenggat';end if;
  end if;
 end guided;
 if result is null then
  if field='seksi' then
   select coalesce(jsonb_agg(jsonb_build_object('label',o.name,'value',o.id::text) order by o.id),'[]') into options from public.org_units o where o.type='section' and public.can_manage_org_unit(o.id);
  elsif field='kategori' and section_id is not null then
   select coalesce(jsonb_agg(jsonb_build_object('label',c.name,'value',c.name) order by c.name),'[]') into options from public.task_categories c where c.org_unit_id=section_id and c.is_active;
  elsif field='frekuensi' then options:='[{"label":"Mingguan","value":"weekly"},{"label":"Bulanan","value":"monthly"}]';end if;
  question:=coalesce(question,case field
   when 'judul' then 'Apa judul tugasnya? Balas dengan judul saja.' when 'nama' then 'Apa nama yang ingin digunakan?'
   when 'pic' then 'Siapa PIC tujuannya? Sebutkan nama atau email.' when 'alasan' then 'Apa alasan pemindahan atau perubahan ini?'
   when 'seksi' then 'Tugas ini untuk seksi mana? Sebutkan nama seksi atau pilih nomor di bawah.'
   when 'kategori' then case when jsonb_array_length(options)=0 then 'Belum ada kategori aktif pada seksi ini. Sebutkan kategori yang sudah tersedia, atau buat kategori melalui halaman Kategori Tasks.' else 'Kategori tugasnya yang mana? Pilih nomor atau sebutkan namanya.' end
   when 'frekuensi' then 'Tugas ini berulang mingguan atau bulanan?'
   when 'hari' then case when d->>'frekuensi'='weekly' then 'Setiap hari apa? Misalnya “setiap Senin”.' else 'Setiap tanggal berapa dalam sebulan? Misalnya “tanggal 5”.' end
   when 'mulai' then case when p_op like 'template_%' then 'Mulai berapa hari setelah jadwal? Misalnya “hari yang sama” atau “satu hari setelah jadwal”.' else 'Kapan mulai? Misalnya “besok jam 8 pagi”.' end
   when 'tenggat' then case when p_op like 'template_%' then 'Tenggat berapa hari setelah jadwal? Misalnya “dua hari setelah jadwal”.' else 'Kapan tenggatnya? Misalnya “lusa jam 4 sore”.' end
   when 'update' then 'Bagian mana yang ingin diubah? Misalnya “ganti PIC-nya menjadi Nata”, “ganti judul jadi ...”, atau prioritas/tenggat.'
   when 'progres' then 'Berapa persen progresnya sekarang?' when 'komentar' then 'Apa isi komentar atau alasan revisinya?'
   when 'deskripsi' then 'Apa deskripsi yang ingin dicatat?' when 'penerima' then 'Siapa yang dimintai bantuan? Sebutkan nama atau email.'
   else 'Mohon lengkapi '||coalesce(spec->'fields'->>field,field)||'.' end);
  if field is not null and jsonb_array_length(options)>0 then select question||E'\n'||string_agg(x.n||'. '||(x.value->>'label'),E'\n' order by x.n) into question from jsonb_array_elements(options) with ordinality x(value,n);end if;
  result:=jsonb_build_object('ok',true,'data',d,'field',field,'question',question,'options',options);
 end if;
 perform set_config('role',old_role,true);perform set_config('request.jwt.claims',coalesce(old_claims,''),true);perform set_config('request.jwt.claim.sub',coalesce(old_sub,''),true);
 return result;
end $$;
revoke all on function public.atm_ai_guided_fields(uuid,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.atm_ai_guided_fields(uuid,text,jsonb,text) to service_role;

create or replace function public.atm_ai_turn(p_actor uuid,p_channel text,p_kind text,p_payload jsonb default '{}',p_token text default null,p_phone text default null,p_receipt text default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare actor uuid:=p_actor; lv integer; link_time timestamptz; s public.atm_ai_sessions%rowtype; r jsonb; spec jsonb; target text:=nullif(p_payload->>'target',''); candidates jsonb; tok uuid; msg text; lim integer; ins text; op text:=p_payload->>'operation'; f text; inserted text; history jsonb; choice integer; selected text; page_no integer; more boolean; ctx public.atm_ai_task_context%rowtype; from_selection boolean:=false; context_error text; batch jsonb; lookup_page integer; target_owner text; selected_owner text; guided jsonb; missing text; thread_id uuid; max_requests integer;
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
 thread_id:=case when p_channel='web' and p_payload->>'threadId' ~ '^[a-f0-9-]{36}$' then (p_payload->>'threadId')::uuid else null end;
 if p_channel='web' and not(p_kind='reserve' and coalesce(p_payload->>'contextChannel','')='whatsapp') then
  delete from public.atm_ai_sessions where user_id=actor and channel=p_channel and conversation_id is distinct from thread_id;
  delete from public.atm_ai_task_context where user_id=actor and channel=p_channel and conversation_id is distinct from thread_id;
 end if;
 max_requests:=case when p_payload->>'local'='true' then 30 else 8 end;
 if p_kind='reserve' then
  insert into public.atm_ai_limits(user_id,window_start,requests) values(actor,date_trunc('minute',now()),1)
   on conflict(user_id) do update set window_start=case when atm_ai_limits.window_start<date_trunc('minute',now()) then date_trunc('minute',now()) else atm_ai_limits.window_start end,requests=case when atm_ai_limits.window_start<date_trunc('minute',now()) then 1 else atm_ai_limits.requests+1 end returning requests into lim;
  if lim<=max_requests and length(coalesce(p_payload->>'message','')) between 1 and 4000 then
   select case when context_at>now()-interval '15 minutes' then case when p_payload->>'contextChannel'='whatsapp' then context_whatsapp else context_web end else '[]'::jsonb end into history from public.atm_ai_limits where user_id=actor;
   history:=coalesce(history,'[]')||jsonb_build_array(left(p_payload->>'message',3000));
   select coalesce(jsonb_agg(value order by n),'[]') into history from jsonb_array_elements(history) with ordinality x(value,n) where n>jsonb_array_length(history)-8;
   update public.atm_ai_limits set context_web=case when p_payload->>'contextChannel'='whatsapp' then context_web else history end,context_whatsapp=case when p_payload->>'contextChannel'='whatsapp' then history else context_whatsapp end,context_at=now() where user_id=actor;
  end if;
  return jsonb_build_object('ok',lim<=max_requests,'history',coalesce(history,'[]'));
 end if;
 select * into ctx from public.atm_ai_task_context where user_id=actor and channel=p_channel and expires_at>now() and (p_channel='web' or (phone=p_phone and linked_at=link_time)) for update;
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
   selected:=s.payload->'choices'->(choice-1)->>'id';from_selection:=true;
   p_payload:=jsonb_build_object('operation',s.operation,'target',selected,'data',s.payload->'data');
   op:=s.operation;target:=selected;p_kind:='propose';
  elsif s.token is null and choice between 1 and coalesce(jsonb_array_length(ctx.choices),0) then
   selected:=ctx.choices->(choice-1)->>'id';
   candidates:=public.atm_ai_tasks(actor,selected,'list');
   if jsonb_array_length(candidates)=1 then
    update public.atm_ai_task_context set task_id=selected::uuid where user_id=actor and channel=p_channel;
    p_payload:=jsonb_build_object('message','Tugas dipilih: '||(candidates->0->>'title')||'. Apa yang ingin diubah? Anda juga dapat meminta hapus atau melihat detailnya.','path','/tasks/'||selected);
   else
    delete from public.atm_ai_task_context where user_id=actor and channel=p_channel;
    p_payload:=jsonb_build_object('message','Pilihan tidak lagi tersedia dalam akses Anda. Tampilkan daftar tugas terbaru.');
   end if;
   p_kind:='reply';
  else p_kind:='reply';p_payload:=jsonb_build_object('message','Nomor pilihan tidak aktif atau kedaluwarsa. Tampilkan daftar tugas terbaru sebelum memilih.');end if;
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
    if s.operation='task_delete' then delete from public.atm_ai_task_context where user_id=actor and channel=p_channel;end if;
    insert into public.audit_logs(user_id,action,object,new_value) values(actor,'ai_'||p_channel||'_'||s.operation,coalesce(r->>'id','operation'),'Confirmed by user');
   end if;
   r:=r||jsonb_build_object('message',msg,'changed',coalesce((r->>'ok')::boolean,false));
  end if;
 elsif p_kind='cancel' then
  delete from public.atm_ai_task_context where user_id=actor and channel=p_channel;
  delete from public.atm_ai_sessions where user_id=actor and channel=p_channel;
  r:=jsonb_build_object('ok',true,'message','Perubahan yang belum disimpan dibatalkan.');
 elsif p_kind='propose' then
  -- Every new intent invalidates the older preview, including invalid replacements.
  delete from public.atm_ai_sessions where user_id=actor and channel=p_channel;
  delete from public.atm_ai_task_context where user_id=actor and channel=p_channel;
  spec:=public.wa_operation_catalog()->op;
  if spec is null or lv<(spec->>'minimumRole')::integer then r:=jsonb_build_object('ok',false,'message','Permintaan berada di luar hak akses Anda.');
  else
   context_error:=null;
   if (spec->>'task')::boolean then
    if p_payload->>'context'='true' or lower(coalesce(target,'')) in ('itu','ini','terpilih','yang dipilih','yang tadi','ya') then
     if ctx.task_id is not null then target:=ctx.task_id::text;from_selection:=true;
     else context_error:='Belum ada tugas terpilih. Sebutkan judul dan PIC, atau tampilkan daftar lalu pilih nomor.';end if;
    elsif target ~ '^[0-9]+$' and p_payload->>'exact' is distinct from 'true' then
     if length(target)<=2 and target::integer between 1 and coalesce(jsonb_array_length(ctx.choices),0) then
      target:=ctx.choices->(target::integer-1)->>'id';from_selection:=true;
     else context_error:='Nomor tugas tidak aktif. Angka hanya dapat dipakai dari daftar pilihan terbaru; sebutkan judul/PIC atau tampilkan daftar lagi.';end if;
    end if;
   end if;
   if context_error is not null then
    if (spec->>'task')::boolean and (target is null or p_payload->>'context'='true') then
     insert into public.atm_ai_sessions(user_id,channel,operation,payload,phone,linked_at,expires_at) values(actor,p_channel,op,jsonb_build_object('guided',true,'field','target','data',coalesce(p_payload->'data','{}'),'pic',p_payload->>'pic','exact',p_payload->'exact'),p_phone,link_time,now()+interval '15 minutes');
     r:=jsonb_build_object('ok',true,'message','Tugas mana yang dimaksud? Sebutkan judul dan pemiliknya. Permintaan '||(spec->>'label')||' tetap saya simpan.');
    else r:=jsonb_build_object('ok',false,'message',context_error);end if;
   else
   candidates:=null;
   if target is not null then
    if (spec->>'task')::boolean then
     if nullif(btrim(p_payload->>'pic'),'') is null then candidates:=public.atm_ai_tasks(actor,target,'list');
     else
      candidates:='[]'::jsonb;
      batch:=public.atm_ai_task_lookup(actor,'','list',1,left(p_payload->>'pic',200));
      if batch->>'ok' is distinct from 'true' then context_error:=batch->>'message';
      else
      target_owner:=batch->>'owner';
      for lookup_page in 1..5 loop
       batch:=public.atm_ai_task_lookup(actor,target,'list',lookup_page,target_owner);
       if batch->>'ok' is distinct from 'true' or batch->>'owner' is distinct from target_owner then context_error:='PIC tidak lagi tersedia. Periksa nama PIC dan ulangi permintaan.';exit;end if;
       select coalesce(jsonb_agg(value order by n),'[]') into history from jsonb_array_elements(batch->'rows') with ordinality x(value,n) where n<=5;
       candidates:=candidates||history;
       exit when jsonb_array_length(batch->'rows')<=5 or jsonb_array_length(candidates)>20;
      end loop;
      end if;
     end if;
    elsif spec->>'entity' in ('wbs','supports','requirements','categories','templates','organizations','notifications','reminders','approvals') then
     candidates:=public.atm_ai_named_records(actor,spec->>'entity',target);
    end if;
    if candidates is not null then
     -- Prefer an explicit ID/exact title; otherwise require a unique substring match.
     select coalesce(jsonb_agg(value),'[]') into history from jsonb_array_elements(candidates) where value->>'id'=target or ((p_payload->>'exact'='true' or (nullif(p_payload->>'pic','') is not null and op in ('task_reassign','task_update','task_delete'))) and lower(value->>'title')=lower(target));
     if p_payload->>'exact'='true' or jsonb_array_length(history)=1 then candidates:=history;end if;
     if jsonb_array_length(candidates)=1 then target:=candidates->0->>'id';else target:=null;end if;
    end if;
   end if;
   if context_error is not null then r:=jsonb_build_object('ok',false,'message',context_error);
   elsif target is null and ((spec->>'task')::boolean or op not in ('task_create','category_create','template_create','org_create','notification_all','profile_name')) then
    if coalesce(jsonb_array_length(candidates),0)>1 and jsonb_array_length(candidates)<=10 then
     insert into public.atm_ai_sessions(user_id,channel,operation,payload,phone,linked_at,expires_at)
      values(actor,p_channel,op,jsonb_build_object('data',coalesce(p_payload->'data','{}'),'choices',candidates),p_phone,link_time,now()+interval '5 minutes');
     if (spec->>'task')::boolean then insert into public.atm_ai_task_context(user_id,channel,choices,phone,linked_at,expires_at) values(actor,p_channel,candidates,p_phone,link_time,now()+interval '15 minutes');end if;
     r:=jsonb_build_object('ok',true,'selection',true,'rows',candidates,'path','/tasks','message','Ada beberapa data yang cocok. Balas nomor pilihan (misalnya “pilih 2”). Perubahan belum disimpan; setelah memilih akan ada pratinjau dan konfirmasi.');
    elsif coalesce(jsonb_array_length(candidates),0)>10 then
     r:=jsonb_build_object('ok',false,'message','Ada lebih dari 10 hasil yang cocok. Tambahkan kata kunci yang lebih spesifik agar saya dapat menampilkan pilihan. Belum ada perubahan.');
    else r:=jsonb_build_object('ok',false,'message','Tidak ditemukan data yang cocok dalam hak akses Anda. Coba kata kunci lain atau lihat daftar tugas. Belum ada perubahan.');end if;
   else
    if (spec->>'task')::boolean then
     select u.name into selected_owner from public.tasks t join public.users u on u.id=t.owner_id where t.id=target::uuid;
     insert into public.atm_ai_task_context(user_id,channel,task_id,choices,phone,linked_at,expires_at)
      values(actor,p_channel,target::uuid,case when from_selection and coalesce(jsonb_array_length(ctx.choices),0)>0 then ctx.choices else coalesce(candidates,'[]') end,p_phone,link_time,now()+interval '15 minutes');
    end if;
    guided:=public.atm_ai_guided_fields(actor,op,coalesce(p_payload->'data','{}'),target);
    p_payload:=p_payload||jsonb_build_object('data',coalesce(guided->'data',p_payload->'data','{}'));
    if guided->>'ok' is distinct from 'true' then r:=guided;
    elsif nullif(guided->>'field','') is not null then
     insert into public.atm_ai_sessions(user_id,channel,operation,target,payload,phone,linked_at,expires_at)
      values(actor,p_channel,op,target,jsonb_build_object('guided',true,'field',guided->>'field','data',guided->'data','pic',p_payload->>'pic','exact',p_payload->'exact','options',guided->'options'),p_phone,link_time,now()+interval '15 minutes');
     r:=jsonb_build_object('ok',true,'message',coalesce(case when selected_owner is not null then 'Tugas terpilih: '||(candidates->0->>'title')||' — PIC: '||selected_owner||E'\n' end,'')||(guided->>'question'),'path',case when target is not null and (spec->>'task')::boolean then '/tasks/'||target when op like 'template_%' then '/tasks/recurring' else '/tasks/new' end);
    else
    if op='task_update' and coalesce(p_payload->'data','{}')='{}'::jsonb then
     r:=public.wa_safe_operation(actor,op,target,jsonb_build_object('judul',candidates->0->>'title'),true,null);
     if r->>'ok'='true' then
      insert into public.atm_ai_sessions(user_id,channel,operation,target,payload,phone,linked_at,expires_at) values(actor,p_channel,op,target,'{"editDraft":true}',p_phone,link_time,now()+interval '5 minutes');
      r:=jsonb_build_object('ok',true,'message','Tugas terpilih: '||(candidates->0->>'title')||case when selected_owner is not null then ' — PIC: '||selected_owner else '' end||'. Bagian mana yang ingin diubah? Misalnya “ganti judul jadi ...”, prioritas, tanggal mulai, atau tenggat. Belum ada perubahan.','path','/tasks/'||target);
     else r:=r||jsonb_build_object('message',r->>'error');end if;
    else
    r:=public.wa_safe_operation(actor,op,target,coalesce(p_payload->'data','{}'),true,null);
    if (r->>'ok')::boolean then
     tok:=gen_random_uuid();
     insert into public.atm_ai_sessions(user_id,channel,token,operation,target,payload,version,phone,linked_at,expires_at) values(actor,p_channel,tok,op,target,coalesce(p_payload->'data','{}'),r->>'version',p_phone,link_time,now()+interval '5 minutes');
     msg:='Pratinjau: '||(r->>'label')||' — '||(r->>'subject')||case when selected_owner is not null then E'\nPIC: '||selected_owner else '' end;
     for f in select key||': '||value from jsonb_each_text(coalesce(p_payload->'data','{}')) loop msg:=msg||E'\n'||f;end loop;
     r:=r||jsonb_build_object('message',msg||E'\nBelum disimpan. Konfirmasi dalam 5 menit atau batalkan.','pending',true,'token',tok);
    else
     missing:=case when coalesce(r->>'error','') ~* 'PIC' then 'pic' when coalesce(r->>'error','') ~* 'kategori' then 'kategori' when coalesce(r->>'error','') ~* 'seksi' then 'seksi' when coalesce(r->>'error','') ~* 'tenggat|tanggal' then 'tenggat' else 'update' end;
     insert into public.atm_ai_sessions(user_id,channel,operation,target,payload,phone,linked_at,expires_at) values(actor,p_channel,op,target,jsonb_build_object('guided',true,'field',missing,'data',p_payload->'data','pic',p_payload->>'pic','exact',p_payload->'exact'),p_phone,link_time,now()+interval '15 minutes');
     r:=r||jsonb_build_object('message',coalesce(r->>'error','Isian belum valid.')||' Isian lain tetap tersimpan. Sebutkan perbaikan '||missing||' atau ketik BATAL.');
    end if;
    end if;
    end if;
   end if;
   end if;
  end if;
 elsif p_kind='read' then
  delete from public.atm_ai_task_context where user_id=actor and channel=p_channel;
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

   if jsonb_typeof(candidates)='array' and jsonb_array_length(candidates)>0 then
    insert into public.atm_ai_task_context(user_id,channel,task_id,choices,phone,linked_at,expires_at)
     values(actor,p_channel,case when jsonb_array_length(candidates)=1 then (candidates->0->>'id')::uuid else null end,candidates,p_phone,link_time,now()+interval '15 minutes');
   end if;
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
 update public.atm_ai_sessions set conversation_id=thread_id where user_id=actor and channel=p_channel;
 update public.atm_ai_task_context set conversation_id=thread_id where user_id=actor and channel=p_channel;
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
