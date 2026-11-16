from pathlib import Path
import json,re
root=Path('supabase/migrations');base=(root/'20261116104627_ai_natural_task_actions.sql').read_text()
target=next(root.glob('*_ai_conversation_grounding.sql'))
def fn(n):return re.search(r'create or replace function public\.'+n+r'\(.*?end \$\$;',base,re.S|re.I).group(0)
c=json.loads(re.search(r'\$json\$(.*?)\$json\$',base,re.S).group(1))
for spec in c.values():
 for key in ['pic','penerima']:
  if key in spec['fields']:spec['fields'][key]=spec['fields'][key].replace('Email','Nama atau email').replace('email','nama atau email')
 if 'seksi' in spec['fields']:spec['fields']['seksi']=spec['fields']['seksi'].replace('ID seksi','ID atau nama seksi')
cat="create or replace function public.wa_operation_catalog() returns jsonb language sql immutable security invoker set search_path='' as $catalog$ select $json$"+json.dumps(c,ensure_ascii=False)+"$json$::jsonb $catalog$;"
apply=fn('wa_apply_operation')
for field in ['pic','penerima']:
 apply=apply.replace("where lower(email)=lower(p_data->>'"+field+"') and status='aktif'", "where (lower(email)=lower(btrim(p_data->>'"+field+"')) or lower(name)=lower(btrim(p_data->>'"+field+"'))) and status='aktif'")
apply=apply.replace("  perform set_config('role','authenticated',true);", """  perform set_config('role','authenticated',true);
  if p_data?'seksi' and p_data->>'seksi' !~ '^[0-9]+$' then
   select min(id) into v_org from public.org_units where type='section' and lower(name)=lower(btrim(p_data->>'seksi')) having count(*)=1;
   if v_org is null then raise exception 'Nama seksi belum cocok dengan satu seksi. Sebutkan nama lengkap seksi dari Organizations';end if;
   p_data:=p_data||jsonb_build_object('seksi',v_org::text);
  end if;""")
apply=apply.replace('Email PIC harus cocok','Nama atau email PIC harus cocok').replace('Email PIC tujuan tidak cocok','Nama atau email PIC tujuan tidak cocok')
draft=fn('wa_task_create_draft')
draft=draft.replace("select id into owner_id from public.users where lower(email)=lower(d->>'pic') and status='aktif';", "select (array_agg(id))[1] into owner_id from public.users where (lower(email)=lower(btrim(d->>'pic')) or lower(name)=lower(btrim(d->>'pic'))) and status='aktif' having count(*)=1; if owner_id is null then return jsonb_build_object('data',d-'pic','prompt','Nama PIC belum cocok dengan satu akun aktif. Sebutkan nama lengkap atau email PIC.');end if;")
turn=fn('atm_ai_turn').replace("n>jsonb_array_length(history)-4", "n>jsonb_array_length(history)-8")
target.write_text('begin;\n'+cat+'\n'+apply+'\n'+draft+'\n'+turn+"\nnotify pgrst,'reload schema';\ncommit;\n")
