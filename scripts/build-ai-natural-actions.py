from pathlib import Path
import re,json
root=Path('supabase/migrations')
target=next(root.glob('*_ai_natural_task_actions.sql'))
old=(root/'20261116102741_whatsapp_create_guidance.sql').read_text()
def fn(s,n):
 return re.search(r'create (?:or replace )?function public\.'+n+r'\(.*?end \$\$;',s,re.S|re.I).group(0).replace('create function','create or replace function',1)
catalog=re.search(r'\$json\$(.*?)\$json\$',(root/'20261113101843_whatsapp_full_operations.sql').read_text(),re.S).group(1)
c=json.loads(catalog);c['task_progress']={'label':'Ubah progres','entity':'tasks','minimumRole':2,'fields':{'progres':'Persentase bilangan bulat 0–100'},'required':['progres'],'task':True}
cat="create or replace function public.wa_operation_catalog() returns jsonb language sql immutable security invoker set search_path='' as $catalog$ select $json$"+json.dumps(c,ensure_ascii=False)+"$json$::jsonb $catalog$;"
apply=fn(old,'wa_apply_operation')
apply=apply.replace("   when 'task_status' then", """   when 'task_progress' then
    if v_row.owner_id<>p_actor then raise exception 'Hanya PIC tugas yang dapat memperbarui progres';end if;
    if coalesce(p_data->>'progres','') !~ '^(100|[1-9]?[0-9])$' then raise exception 'Progres harus bilangan bulat 0–100';end if;
    if v_row.status not in ('To do','In progress','Revisi') then raise exception 'Progres hanya dapat diubah pada tugas aktif; status review atau selesai mengikuti alur persetujuan';end if;
    if exists(select 1 from public.wbs_items where task_id=v_task) then raise exception 'Progres tugas ini dihitung dari WBS. Perbarui penyelesaian item WBS agar progres tetap konsisten';end if;
    update public.tasks set progress_pct=(p_data->>'progres')::integer where id=v_task and owner_id=p_actor returning id into v_id;
   when 'task_status' then""")
tasks=fn((root/'20261113160704_ai_personal_calendar_scope.sql').read_text(),'atm_ai_tasks')
tasks=tasks.replace("('mine','mine_calendar')", "('mine','mine_calendar','mine_open')")
tasks=tasks.replace("    and (p_mode<>'review'", "    and (p_mode not in ('mine_open','open') or t.status<>'Done')\n    and (p_mode<>'review'")
# Separate paged reader. The existing title resolver keeps its bounded 21-row ambiguity check.
paged=tasks.replace('public.atm_ai_tasks(', 'public.atm_ai_task_page(',1).replace("p_mode text default 'list')", "p_mode text default 'list',p_page integer default 1)",1)
paged=paged.replace('limit 21', 'limit 6 offset (greatest(1,least(9999,coalesce(p_page,1)))-1)*5')
resolve=r"""
create or replace function public.atm_ai_named_records(p_actor uuid,p_entity text,p_query text) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare result jsonb; old_role text:=current_user; old_claims text:=current_setting('request.jwt.claims',true); old_sub text:=current_setting('request.jwt.claim.sub',true);
begin
 if not exists(select 1 from public.users where id=p_actor and status='aktif') then return '[]'::jsonb;end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',p_actor,'role','authenticated')::text,true);
 perform set_config('request.jwt.claim.sub',p_actor::text,true);perform set_config('role','authenticated',true);
 select coalesce(jsonb_agg(x),'[]') into result from (
  select id,label from (
   select id::text,name as label from public.task_categories where p_entity='categories'
   union all select id::text,name from public.task_templates where p_entity='templates'
   union all select id::text,name from public.org_units where p_entity='organizations'
   union all select id::text,title from public.wbs_items where p_entity='wbs'
   union all select id::text,description from public.task_supports where p_entity='supports'
   union all select id::text,description from public.evidence_requirements where p_entity='requirements'
   union all select id::text,title from public.notifications where p_entity='notifications' and user_id=p_actor
   union all select r.id::text,t.title from public.task_reminders r join public.tasks t on t.id=r.task_id where p_entity='reminders' and t.owner_id=p_actor
   union all select d.id::text,t.title from public.deadline_change_requests d join public.tasks t on t.id=d.task_id where p_entity='approvals'
  ) accessible where id=lower(p_query) or position(lower(p_query) in lower(label))>0 order by label,id limit 21
 ) x;
 perform set_config('role',old_role,true);perform set_config('request.jwt.claims',coalesce(old_claims,''),true);perform set_config('request.jwt.claim.sub',coalesce(old_sub,''),true);
 return result;
end $$;
revoke all on function public.atm_ai_named_records(uuid,text,text) from public,anon,authenticated;
grant execute on function public.atm_ai_named_records(uuid,text,text) to service_role;
revoke all on function public.atm_ai_task_page(uuid,text,text,integer) from public,anon,authenticated;
grant execute on function public.atm_ai_task_page(uuid,text,text,integer) to service_role;
"""
turn=fn(old,'atm_ai_turn')
turn=turn.replace('history jsonb;', 'history jsonb; choice integer; selected text; page_no integer; more boolean;')
# Numeric selection restores only a server-stored operation, and is revalidated as a new preview.
needle=" if p_kind in ('confirm','cancel') then"
idx=turn.index(needle)
turn=turn[:idx]+r""" if p_kind='select' then
  select * into s from public.atm_ai_sessions where user_id=actor and channel=p_channel for update;
  choice:=case when p_payload->>'choice' ~ '^[1-9][0-9]?$' then (p_payload->>'choice')::integer else 0 end;
  if s.token is null and s.expires_at>now() and jsonb_typeof(s.payload->'choices')='array'
   and (p_channel='web' or (s.phone=p_phone and s.linked_at=link_time)) and choice between 1 and jsonb_array_length(s.payload->'choices') then
   selected:=s.payload->'choices'->(choice-1)->>'id';
   p_payload:=jsonb_build_object('operation',s.operation,'target',selected,'data',s.payload->'data');
   op:=s.operation;target:=selected;p_kind:='propose';
  else p_kind:='reply';p_payload:=jsonb_build_object('message','Pilihan tidak valid atau kedaluwarsa. Kirim ulang judul/kata kunci tugas dan perubahan yang diinginkan.');end if;
 end if;
"""+turn[idx:]
start=turn.index("   if target is not null and spec->>'entity'")
end=turn.index("   if target is null and",start)
turn=turn[:start]+r"""   candidates:=null;
   if target is not null then
    if (spec->>'task')::boolean then candidates:=public.atm_ai_tasks(actor,target,'list');
    elsif spec->>'entity' in ('wbs','supports','requirements','categories','templates','organizations','notifications','reminders','approvals') then
     candidates:=public.atm_ai_named_records(actor,spec->>'entity',target);
    end if;
    if candidates is not null then
     -- Prefer an explicit ID/exact title; otherwise require a unique substring match.
     select coalesce(jsonb_agg(value),'[]') into history from jsonb_array_elements(candidates) where value->>'id'=target;
     if jsonb_array_length(history)=1 then candidates:=history;end if;
     if jsonb_array_length(candidates)=1 then target:=candidates->0->>'id';else target:=null;end if;
    end if;
   end if;
"""+turn[end:]
oldmsg="r:=jsonb_build_object('ok',false,'message','Tugas/data belum cocok secara unik. Gunakan judul lengkap atau ID dari daftar yang dapat Anda akses.');"
newmsg=r"""if coalesce(jsonb_array_length(candidates),0)>1 and jsonb_array_length(candidates)<=20 then
     insert into public.atm_ai_sessions(user_id,channel,operation,payload,phone,linked_at,expires_at)
      values(actor,p_channel,op,jsonb_build_object('data',coalesce(p_payload->'data','{}'),'choices',candidates),p_phone,link_time,now()+interval '5 minutes');
     r:=jsonb_build_object('ok',true,'selection',true,'rows',candidates,'path','/tasks','message','Ada beberapa data yang cocok. Balas nomor pilihan (misalnya “pilih 2”). Perubahan belum disimpan; setelah memilih akan ada pratinjau dan konfirmasi.');
    elsif coalesce(jsonb_array_length(candidates),0)>20 then
     r:=jsonb_build_object('ok',false,'message','Ada lebih dari 20 hasil yang cocok. Tambahkan kata kunci yang lebih spesifik agar saya dapat menampilkan pilihan. Belum ada perubahan.');
    else r:=jsonb_build_object('ok',false,'message','Tidak ditemukan data yang cocok dalam hak akses Anda. Coba kata kunci lain atau lihat daftar tugas. Belum ada perubahan.');end if;"""
assert oldmsg in turn
turn=turn.replace(oldmsg,newmsg)
# Read pages with deadlines, explicit continuation and no silent truncation.
start=turn.index("   r:=jsonb_build_object('ok',true,'rows',public.atm_ai_tasks(")
end=turn.index('\n  else',start)
turn=turn[:start]+r"""   page_no:=case when p_payload->>'page' ~ '^[1-9][0-9]{0,3}$' then (p_payload->>'page')::integer else 1 end;
   candidates:=public.atm_ai_task_page(actor,left(coalesce(p_payload->>'query',''),200),coalesce(p_payload->>'mode','list'),page_no);
   more:=case when jsonb_typeof(candidates)='array' then jsonb_array_length(candidates)>5 else false end;
   if more then select jsonb_agg(value order by n) into candidates from jsonb_array_elements(candidates) with ordinality x(value,n) where n<=5;end if;
   msg:=case p_payload->>'mode' when 'mine' then 'Tugas saya sebagai PIC' when 'mine_open' then 'Tugas saya yang masih open' when 'open' then 'Tugas open sesuai hak akses Anda' when 'review' then 'Tugas yang ditugaskan untuk saya review' else 'Daftar tugas sesuai hak akses Anda' end;
   if jsonb_typeof(candidates)='array' then msg:=msg||' — halaman '||page_no||case when more then E'\nMasih ada tugas berikutnya. Ketik “'||case when p_payload->>'mode' in ('mine','mine_open') then 'tugas saya' when p_payload->>'mode'='review' then 'review saya' else 'daftar tugas' end||case when p_payload->>'mode' in ('mine_open','open') then ' open' else '' end||case when coalesce(p_payload->>'query','')<>'' then '” atau gunakan “cari tugas '||(p_payload->>'query')||' halaman '||(page_no+1)||'” untuk hasil berikutnya.' else ' halaman '||(page_no+1)||'”.' end else '' end;end if;
   r:=jsonb_build_object('ok',true,'rows',candidates,'hasMore',more,'page',page_no,'path',case when p_payload->>'mode' in ('mine','mine_open') then '/tasks?mine=1' when p_payload->>'mode'='review' then '/review-inbox' else '/tasks' end,'message',msg);
"""+turn[end:]
turn=turn.replace("  else\n   r:=public.wa_read_feature", "   if more then insert into public.atm_ai_sessions(user_id,channel,payload,phone,linked_at,expires_at) values(actor,p_channel,jsonb_build_object('lastRead',p_payload||jsonb_build_object('page',page_no)),p_phone,link_time,now()+interval '15 minutes');end if;\n  else\n   r:=public.wa_read_feature")
turn=turn.replace("Masih ada tugas berikutnya. Ketik “", "Masih ada tugas berikutnya. Ketik LANJUT atau “")
# Number all candidate rows, including >5 matches, within Fonnte's body limit.
turn=turn.replace("   for candidates in select value from jsonb_array_elements(r->'rows') limit 5 loop", "   choice:=0;\n   for candidates in select value from jsonb_array_elements(r->'rows') limit 20 loop\n    choice:=choice+1;")
turn=turn.replace("coalesce(candidates->>'title',candidates->>'label','Data')", "choice||'. '||left(coalesce(candidates->>'title',candidates->>'label','Data'),80)")
turn=turn.replace("||E'\\nID: '||(candidates->>'id')", "||case when candidates?'due' then E'\\nTenggat: '||(candidates->>'due')||' WIB' else '' end||case when candidates?'progress_pct' then ' · '||(candidates->>'progress_pct')||'%' else '' end||E'\\nID: '||(candidates->>'id')")
# Ambiguous choices max 10 to guarantee every displayed option fits message budget.
turn=turn.replace('jsonb_array_length(candidates)<=20','jsonb_array_length(candidates)<=10').replace('jsonb_array_length(candidates)>20','jsonb_array_length(candidates)>10').replace('lebih dari 20 hasil','lebih dari 10 hasil')
dates=Path('scripts/ai-natural-dates.sql').read_text()
draft=fn(old,'wa_task_create_draft')
draft=draft.replace("value:=regexp_replace(value,'\\s+WIB$','','i');", "value:=public.wa_natural_timestamp(value);")
draft=draft.replace("if value !~", "if value is null or value !~")
draft=draft.replace("Format '||field||' harus YYYY-MM-DD HH:MM, misalnya ", "Kapan '||field||'? Balas misalnya “besok jam 8 pagi” atau ")
draft=draft.replace("Balas YYYY-MM-DD HH:MM (WIB), contoh: ", "Balas misalnya “besok jam 8 pagi” atau tanggal dan jam WIB: ")
draft=draft.replace("Balas YYYY-MM-DD HH:MM (WIB). Harus", "Balas misalnya “lusa jam 4 sore” atau tanggal dan jam WIB. Harus")
target.write_text('begin;\n'+cat+'\n'+apply+'\n'+tasks+'\n'+paged+'\n'+resolve+'\n'+dates+'\n'+draft+'\n'+turn+"\nnotify pgrst,'reload schema';\ncommit;\n")
