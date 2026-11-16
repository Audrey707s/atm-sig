from pathlib import Path
import re
root=Path('supabase/migrations');base=(root/'20261116121257_ai_task_context_and_delete_cleanup.sql').read_text();target=next(root.glob('*_ai_guided_conversation.sql'))
turn=re.search(r'create or replace function public\.atm_ai_turn\(.*?end \$\$;',base,re.S).group(0)
turn=turn.replace('selected_owner text;', 'selected_owner text; guided jsonb; missing text; thread_id uuid; max_requests integer;')
needle=" if p_kind='reserve' then"
turn=turn.replace(needle,r""" thread_id:=case when p_channel='web' and p_payload->>'threadId' ~ '^[a-f0-9-]{36}$' then (p_payload->>'threadId')::uuid else null end;
 if p_channel='web' and not(p_kind='reserve' and coalesce(p_payload->>'contextChannel','')='whatsapp') then
  delete from public.atm_ai_sessions where user_id=actor and channel=p_channel and conversation_id is distinct from thread_id;
  delete from public.atm_ai_task_context where user_id=actor and channel=p_channel and conversation_id is distinct from thread_id;
 end if;
 max_requests:=case when p_payload->>'local'='true' then 30 else 8 end;
"""+needle)
turn=turn.replace('lim<=8','lim<=max_requests')
# Preserve the intended operation when the selected task is still missing.
needle="if context_error is not null then r:=jsonb_build_object('ok',false,'message',context_error);"
replacement=r"""if context_error is not null then
    if (spec->>'task')::boolean and (target is null or p_payload->>'context'='true') then
     insert into public.atm_ai_sessions(user_id,channel,operation,payload,phone,linked_at,expires_at) values(actor,p_channel,op,jsonb_build_object('guided',true,'field','target','data',coalesce(p_payload->'data','{}'),'pic',p_payload->>'pic','exact',p_payload->'exact'),p_phone,link_time,now()+interval '15 minutes');
     r:=jsonb_build_object('ok',true,'message','Tugas mana yang dimaksud? Sebutkan judul dan pemiliknya. Permintaan '||(spec->>'label')||' tetap saya simpan.');
    else r:=jsonb_build_object('ok',false,'message',context_error);end if;"""
turn=turn.replace(needle,replacement,1)
# Generic missing fields are collected one at a time for the same operation/target.
needle="    if op='task_update' and coalesce(p_payload->'data','{}')='{}'::jsonb then"
turn=turn.replace(needle,r"""    guided:=public.atm_ai_guided_fields(actor,op,coalesce(p_payload->'data','{}'),target);
    p_payload:=p_payload||jsonb_build_object('data',coalesce(guided->'data',p_payload->'data','{}'));
    if guided->>'ok' is distinct from 'true' then r:=guided;
    elsif nullif(guided->>'field','') is not null then
     insert into public.atm_ai_sessions(user_id,channel,operation,target,payload,phone,linked_at,expires_at)
      values(actor,p_channel,op,target,jsonb_build_object('guided',true,'field',guided->>'field','data',guided->'data','pic',p_payload->>'pic','exact',p_payload->'exact','options',guided->'options'),p_phone,link_time,now()+interval '15 minutes');
     r:=jsonb_build_object('ok',true,'message',coalesce(case when selected_owner is not null then 'Tugas terpilih: '||(candidates->0->>'title')||' — PIC: '||selected_owner||E'\n' end,'')||(guided->>'question'),'path',case when target is not null and (spec->>'task')::boolean then '/tasks/'||target when op like 'template_%' then '/tasks/recurring' else '/tasks/new' end);
    else
"""+needle)
# Keep a repairable draft instead of dropping all fields on a validation failure.
needle="    else r:=r||jsonb_build_object('message',coalesce(r->>'error','Isian belum valid.'));end if;"
turn=turn.replace(needle,r"""    else
     missing:=case when coalesce(r->>'error','') ~* 'PIC' then 'pic' when coalesce(r->>'error','') ~* 'kategori' then 'kategori' when coalesce(r->>'error','') ~* 'seksi' then 'seksi' when coalesce(r->>'error','') ~* 'tenggat|tanggal' then 'tenggat' else 'update' end;
     insert into public.atm_ai_sessions(user_id,channel,operation,target,payload,phone,linked_at,expires_at) values(actor,p_channel,op,target,jsonb_build_object('guided',true,'field',missing,'data',p_payload->'data','pic',p_payload->>'pic','exact',p_payload->'exact'),p_phone,link_time,now()+interval '15 minutes');
     r:=r||jsonb_build_object('message',coalesce(r->>'error','Isian belum valid.')||' Isian lain tetap tersimpan. Sebutkan perbaikan '||missing||' atau ketik BATAL.');
    end if;""")
# One extra wrapper around all guided operations, before the existing edit branch.
needle="    end if;\n   end if;\n   end if;\n  end if;\n elsif p_kind='read'"
assert needle in turn
turn=turn.replace(needle,"    end if;\n    end if;\n   end if;\n   end if;\n  end if;\n elsif p_kind='read'")
# Bind durable drafts/selections to the actual web thread; WhatsApp remains phone-bound.
turn=turn.replace(" if p_channel='whatsapp' then\n  msg:=coalesce", " update public.atm_ai_sessions set conversation_id=thread_id where user_id=actor and channel=p_channel;\n update public.atm_ai_task_context set conversation_id=thread_id where user_id=actor and channel=p_channel;\n if p_channel='whatsapp' then\n  msg:=coalesce")
# Prefer a uniquely named title when the caller also specified the current PIC.
turn=turn.replace("(p_payload->>'exact'='true' and lower(value->>'title')=lower(target))", "((p_payload->>'exact'='true' or (nullif(p_payload->>'pic','') is not null and op in ('task_reassign','task_update','task_delete'))) and lower(value->>'title')=lower(target))")
helper=Path('scripts/ai-guided-fields.sql').read_text()
setup="alter table public.atm_ai_sessions add column conversation_id uuid;\nalter table public.atm_ai_task_context add column conversation_id uuid;\n"
target.write_text('begin;\n'+setup+helper+'\n'+turn+"\nnotify pgrst,'reload schema';\ncommit;\n")
