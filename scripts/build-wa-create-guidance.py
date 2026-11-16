from pathlib import Path

source = Path('supabase/migrations/20261113101843_whatsapp_full_operations.sql').read_text()
target = Path('supabase/migrations/20261116102741_whatsapp_create_guidance.sql')
helper = r"""
-- Native guided creation works without model inference. Drafts stay private and
-- confirmation, permissions, receipts and the transactional outbox stay unchanged.
create or replace function public.wa_task_create_draft(p_actor uuid,p_previous jsonb,p_text text)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare d jsonb:=coalesce(p_previous,'{}'); incoming jsonb; step text; field text; value text;
 owner_id uuid:=p_actor; owner_org integer; actor_org integer; actor_level integer; choices text;
begin
 if coalesce(d->>'judul','')='' then step:='judul';
 elsif coalesce(d->>'mulai','')='' then step:='mulai';
 elsif coalesce(d->>'tenggat','')='' then step:='tenggat';
 else step:='seksi';end if;
 if btrim(coalesce(p_text,''))<>'' then
  if p_text ~* '^\s*(judul|mulai|tenggat|pic|seksi|kategori|prioritas|evidence|wbs)\s*:' then incoming:=public.wa_parse_form(p_text);
  else incoming:=jsonb_build_object(step,btrim(p_text));end if;
  for field,value in select f.key,f.value from jsonb_each_text(incoming) f loop
   if not ((public.wa_operation_catalog()->'task_create'->'fields')?field) then
    return jsonb_build_object('data',d,'prompt','Field tidak dikenal: '||field||'. Kirim ulang dengan field yang tersedia.');end if;
   if field in ('mulai','tenggat') then
    value:=regexp_replace(value,'\s+WIB$','','i');
    if value !~ '^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}$' then
     return jsonb_build_object('data',d,'prompt','Format '||field||' harus YYYY-MM-DD HH:MM, misalnya '||to_char(now() at time zone 'Asia/Jakarta','YYYY-MM-DD')||' 08:00.');end if;
    begin perform value::timestamp;exception when invalid_datetime_format or datetime_field_overflow then
     return jsonb_build_object('data',d,'prompt','Tanggal '||field||' tidak valid. Kirim ulang tanggal yang benar.');end;
    incoming:=incoming||jsonb_build_object(field,replace(value,'T',' '));
   end if;
  end loop;
  d:=d||incoming;
 end if;
 if coalesce(d->>'judul','')='' then
  return jsonb_build_object('data',d,'prompt',E'✍️ *Buat tugas — 1/3*\nApa judul tugasnya? Balas judul saja.\n\nKirim field sekaligus juga boleh: judul, mulai, tenggat (satu field: isi per baris).\nKetik BATAL untuk membatalkan.');
 elsif length(d->>'judul')>200 then return jsonb_build_object('data',d-'judul','prompt','Judul maksimal 200 karakter. Kirim judul yang lebih singkat.');
 elsif coalesce(d->>'mulai','')='' then
  return jsonb_build_object('data',d,'prompt',E'📅 *Buat tugas — 2/3*\nKapan mulai? Balas YYYY-MM-DD HH:MM (WIB), contoh: '||to_char(now() at time zone 'Asia/Jakarta','YYYY-MM-DD')||' 08:00');
 elsif coalesce(d->>'tenggat','')='' then
  return jsonb_build_object('data',d,'prompt',E'⏰ *Buat tugas — 3/3*\nKapan tenggatnya? Balas YYYY-MM-DD HH:MM (WIB). Harus setelah tanggal mulai.');
 end if;
 if (d->>'tenggat')::timestamp<=(d->>'mulai')::timestamp then
  return jsonb_build_object('data',d-'tenggat','prompt','Tenggat harus setelah tanggal mulai. Kirim tenggat baru dengan format YYYY-MM-DD HH:MM.');end if;
 if d?'pic' and lower(d->>'pic')<>'saya' then select id into owner_id from public.users where lower(email)=lower(d->>'pic') and status='aktif';end if;
 select org_unit_id into owner_org from public.users where id=owner_id;
 if coalesce(d->>'seksi','')='' and not exists(select 1 from public.org_units where id=owner_org and type='section') then
  select u.org_unit_id,r.level into actor_org,actor_level from public.users u join public.roles r on r.id=u.role_id where u.id=p_actor and u.status='aktif';
  select string_agg(id||' — '||name,E'\n' order by id) into choices from
   (select id,name from public.org_units where type='section' and (actor_level>=5 or id=actor_org or (actor_level=4 and parent_id=actor_org)) order by id limit 20) sections;
  return jsonb_build_object('data',d,'prompt',E'🏢 Pilih seksi untuk tugas ini. Balas ID atau nama seksi:\n'||coalesce(choices,'Tidak ada seksi dalam cakupan Anda.')||E'\n\nPIC tetap akun Anda jika tidak diisi. Pilihan tambahan dapat dikirim sebagai pic: email, kategori: nama, atau prioritas: rendah/sedang/tinggi.\n🔗 https://atm-sig.vercel.app/organizations');
 end if;
 return jsonb_build_object('data',d);
end $$;
revoke all on function public.wa_task_create_draft(uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.wa_task_create_draft(uuid,jsonb,text) to service_role;
"""

def function(name):
    start = source.index('create function public.' + name + '(')
    end = source.index('end $$;', start) + len('end $$;')
    return source[start:end].replace('create function', 'create or replace function', 1)

apply = function('wa_apply_operation')
old = "   v_org:=coalesce((p_data->>'seksi')::integer,(v_before->>'org_unit_id')::integer,v_user.org_unit_id);"
new = """   if nullif(btrim(p_data->>'seksi'),'') is null then v_org:=coalesce((v_before->>'org_unit_id')::integer,v_user.org_unit_id);
   elsif btrim(p_data->>'seksi') ~ '^[0-9]+$' then v_org:=(p_data->>'seksi')::integer;
   else
    select min(id) into v_org from public.org_units where type='section' and lower(name)=lower(btrim(p_data->>'seksi'))
     having count(*)=1;
    if v_org is null then raise exception 'Nama seksi tidak cocok secara unik. Pilih ID dari ORGANISASI';end if;
   end if;"""
assert old in apply
apply = apply.replace(old,new)

receive = function('wa_receive_full')
old = "    if not exists(select 1 from jsonb_object_keys(spec->'fields')) then"
new = """    if op='task_create' then
     result:=public.wa_task_create_draft(actor,'{}','');
     next_st:=next_st||jsonb_build_object('draft',result->'data');reply:=result->>'prompt';
    elsif not exists(select 1 from jsonb_object_keys(spec->'fields')) then"""
assert old in receive
receive = receive.replace(old,new)
receive = receive.replace("v_path:=case spec->>'entity'", "v_path:=case when op='task_create' then '/tasks/new' else case spec->>'entity'", 1)
receive = receive.replace("coalesce('/tasks/'||task_id::text,'/tasks/new') end;", "coalesce('/tasks/'||task_id::text,'/tasks/new') end end;", 1)
old = "  begin data:=public.wa_parse_form(p_text);result:=public.wa_safe_operation(actor,st->>'op',st->>'target',data,true);"
new = """  begin
   if st->>'op'='task_create' then
    result:=public.wa_task_create_draft(actor,st->'draft',p_text);data:=result->'data';
    next_st:=st||jsonb_build_object('draft',data);
   else data:=public.wa_parse_form(p_text);end if;
   if st->>'op'='task_create' and result?'prompt' then reply:=result->>'prompt';
   else
   result:=public.wa_safe_operation(actor,st->>'op',st->>'target',data,true);"""
assert old in receive
receive = receive.replace(old,new)
old = "  exception when raise_exception then reply:='❌ '||SQLERRM;end;"
assert old in receive
receive = receive.replace(old, "   end if;\n" + old)
# Preserve the already deployed sender limiter when replacing the function.
old = " if p_id is null or p_id !~"
new = """ if (select count(*) from public.whatsapp_receipts where sender=p_sender and received_at>now()-interval '1 minute')>=30 and p_command not in ('stop','disconnect') then return 'rate_limited';end if;
 if p_id is null or p_id !~"""
assert old in receive
receive = receive.replace(old,new)
ai_source = Path('supabase/migrations/20261113160217_atm_ai_assistant.sql').read_text()
ai_start = ai_source.index('create function public.atm_ai_turn(')
ai_end = ai_source.index('end $$;', ai_start) + len('end $$;')
ai = ai_source[ai_start:ai_end].replace('create function','create or replace function',1)
old = "'path','/tasks','message','Tugas dalam cakupan akses Anda'"
new = """'path',case p_payload->>'mode' when 'mine' then '/tasks?mine=1' when 'review' then '/review-inbox' else '/tasks' end,
     'message',case p_payload->>'mode' when 'mine' then 'Tugas saya sebagai PIC' when 'review' then 'Tugas untuk saya tinjau sebagai reviewer yang ditugaskan' else 'Daftar tugas sesuai hak akses Anda' end"""
assert old in ai
ai = ai.replace(old,new)
target.write_text('begin;\n'+helper+'\n'+apply+'\n'+receive+'\n'+ai+"\nnotify pgrst,'reload schema';\ncommit;\n")
