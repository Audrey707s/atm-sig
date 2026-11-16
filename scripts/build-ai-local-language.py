from pathlib import Path
import re
root=Path('supabase/migrations')
base=(root/'20261116155418_ai_guided_conversation.sql').read_text()
helper=re.search(r'create or replace function public.atm_ai_guided_fields\(.*?grant execute on function public.atm_ai_guided_fields\(.*?;',base,re.S).group(0)
helper=helper.replace("if not d?'seksi' and exists","if (spec->'fields')?'seksi' and not d?'seksi' and exists")
helper=helper.replace("if p_op='task_update' and d='{}'::jsonb", "if p_op in ('task_update','category_update','template_update','org_update') and d='{}'::jsonb")
helper=helper.replace("if p_op='task_create' and field is null", "if p_op='org_create' and d->>'tipe' in ('unit','section') and coalesce(d->>'induk','')='' then field:='induk';end if;\n  if p_op='task_create' and field is null")
helper=helper.replace("if field='seksi' then", "if field='induk' and p_op like 'org_%' then\n   select coalesce(jsonb_agg(jsonb_build_object('label',o.name,'value',o.id::text) order by o.id),'[]') into options from public.org_units o where o.type=case when d->>'tipe'='section' then 'unit'::public.org_unit_type else 'department'::public.org_unit_type end and public.can_manage_org_unit(o.id);\n  elsif field='seksi' then")
helper=helper.replace("when 'judul' then", "when 'induk' then 'Di bawah organisasi mana? Sebutkan ID induk atau pilih nomor.'\n   when 'judul' then")
turn=re.search(r'create or replace function public.atm_ai_turn\(.*?end \$\$;',base,re.S).group(0)
turn=turn.replace("lower(value->>'title')=lower(target)","lower(coalesce(value->>'title',value->>'label'))=lower(target)")
needle="    else r:=jsonb_build_object('ok',false,'message','Tidak ditemukan data yang cocok dalam hak akses Anda. Coba kata kunci lain atau lihat daftar tugas. Belum ada perubahan.');end if;"
replacement="""    else
     insert into public.atm_ai_sessions(user_id,channel,operation,payload,phone,linked_at,expires_at) values(actor,p_channel,op,jsonb_build_object('guided',true,'field','target','data',coalesce(p_payload->'data','{}'),'pic',p_payload->>'pic','exact',p_payload->'exact'),p_phone,link_time,now()+interval '15 minutes');
     r:=jsonb_build_object('ok',false,'message','Tidak ditemukan data dalam hak akses Anda. Sebutkan nama atau ID '||(spec->>'entity')||' yang dimaksud. Aksi '||(spec->>'label')||' tetap tersimpan; belum ada perubahan.');end if;"""
assert needle in turn;turn=turn.replace(needle,replacement)
needle="   r:=public.wa_read_feature(actor,p_payload->>'entity',nullif(p_payload->>'task','')::uuid,greatest(1,least(1000,coalesce((p_payload->>'page')::integer,1))));"
replacement="""   selected:=nullif(p_payload->>'task','');context_error:=null;
   if p_payload->>'entity' in ('wbs','supports','requirements','comments') then
    if nullif(btrim(p_payload->>'query'),'') is not null then
     candidates:=public.atm_ai_tasks(actor,p_payload->>'query','list');
     select coalesce(jsonb_agg(value),'[]') into history from jsonb_array_elements(candidates) where lower(value->>'title')=lower(p_payload->>'query') or value->>'id'=p_payload->>'query';
     if jsonb_array_length(history)=1 then candidates:=history;end if;
     if jsonb_array_length(candidates)=1 then selected:=candidates->0->>'id';else context_error:='Tugas belum cocok dengan satu hasil. Sebutkan judul lebih lengkap atau ID tugas untuk melihat data terkait.';end if;
    elsif selected is null then selected:=ctx.task_id::text;end if;
   end if;
   if context_error is null then
    r:=public.wa_read_feature(actor,p_payload->>'entity',selected::uuid,greatest(1,least(1000,coalesce((p_payload->>'page')::integer,1))));
   else r:=jsonb_build_object('ok',false,'error',context_error);end if;"""
assert needle in turn;turn=turn.replace(needle,replacement)
target=next(root.glob('*_ai_local_language.sql'))
target.write_text('-- Local language conversations: preserve missing targets and guide all edit forms.\nbegin;\n'+helper+'\n'+turn+'\ncommit;\n')
