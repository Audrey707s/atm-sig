from pathlib import Path
import re
root=Path('supabase/migrations');base=(root/'20261116114447_ai_pic_pagination_hint.sql').read_text();target=next(root.glob('*_ai_task_context_and_delete_cleanup.sql'))
turn=re.search(r'create or replace function public\.atm_ai_turn\(.*?end \$\$;',base,re.S).group(0)
setup=r"""
create table public.atm_ai_task_context (
 user_id uuid not null references public.users(id) on delete cascade,
 channel text not null check(channel in ('web','whatsapp')),
 task_id uuid references public.tasks(id) on delete set null,
 choices jsonb not null default '[]' check(jsonb_typeof(choices)='array' and jsonb_array_length(choices)<=21),
 phone text, linked_at timestamptz, expires_at timestamptz not null,
 primary key(user_id,channel)
);
alter table public.atm_ai_task_context enable row level security;
revoke all on public.atm_ai_task_context from public,anon,authenticated;
grant select,insert,update,delete on public.atm_ai_task_context to service_role;
"""
guard=(root/'028_reminder_recipient_guard.sql').read_text().split('DROP TRIGGER')[0]
needle="  IF NEW.task_id IS NULL THEN"
assert needle in guard
guard=guard.replace(needle,r"""  -- Task deletion legitimately clears the notification FK. Only allow that
  -- cleanup when the actual parent no longer exists, without changing recipient
  -- or reminder type. The privileged lookup prevents RLS-hidden parents from
  -- being mistaken for deleted parents; normal reminder validation stays strict.
  IF TG_OP='UPDATE' AND NEW.task_id IS NULL AND OLD.task_id IS NOT NULL
    AND NEW.user_id IS NOT DISTINCT FROM OLD.user_id
    AND NEW.type IS NOT DISTINCT FROM OLD.type
    AND NOT EXISTS(SELECT 1 FROM public.tasks WHERE id=OLD.task_id)
  THEN RETURN NEW; END IF;

"""+needle)
turn=turn.replace('more boolean;', 'more boolean; ctx public.atm_ai_task_context%rowtype; from_selection boolean:=false; context_error text; batch jsonb; lookup_page integer; target_owner text; selected_owner text;')
needle=" if p_channel='whatsapp' and p_kind<>'reserve' then"
turn=turn.replace(needle," select * into ctx from public.atm_ai_task_context where user_id=actor and channel=p_channel and expires_at>now() and (p_channel='web' or (phone=p_phone and linked_at=link_time)) for update;\n"+needle)
start=turn.index(" if p_kind='select' then");end=turn.index(" if p_kind in ('confirm','cancel')",start)
turn=turn[:start]+r""" if p_kind='select' then
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
"""+turn[end:]
turn=turn.replace("if jsonb_array_length(history)=1 then candidates:=history;end if;", "if p_payload->>'exact'='true' or jsonb_array_length(history)=1 then candidates:=history;end if;")
# Clear context on cancellation and successful deletion, never on ordinary clarifications.
turn=turn.replace(" elsif p_kind='cancel' then", " elsif p_kind='cancel' then\n  delete from public.atm_ai_task_context where user_id=actor and channel=p_channel;")
turn=turn.replace("   if (r->>'ok')::boolean then\n    insert into public.audit_logs", "   if (r->>'ok')::boolean then\n    if s.operation='task_delete' then delete from public.atm_ai_task_context where user_id=actor and channel=p_channel;end if;\n    insert into public.audit_logs")
start=turn.index(" elsif p_kind='propose' then");end=turn.index(" elsif p_kind='read' then",start)
prop=turn[start:end]
prop=prop.replace("  spec:=public.wa_operation_catalog()->op;", "  delete from public.atm_ai_task_context where user_id=actor and channel=p_channel;\n  spec:=public.wa_operation_catalog()->op;")
needle="  else\n   candidates:=null;"
assert needle in prop
prop=prop.replace(needle,r"""  else
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
   if context_error is not null then r:=jsonb_build_object('ok',false,'message',context_error);
   else
   candidates:=null;""")
needle="if (spec->>'task')::boolean then candidates:=public.atm_ai_tasks(actor,target,'list');"
assert needle in prop
prop=prop.replace(needle,r"""if (spec->>'task')::boolean then
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
     end if;""")
# Wrap the resulting resolution error without losing its precise PIC feedback.
needle="   if target is null and ((spec->>'task')::boolean"
prop=prop.replace(needle,"   if context_error is not null then r:=jsonb_build_object('ok',false,'message',context_error);\n   elsif target is null and ((spec->>'task')::boolean")
needle="     r:=jsonb_build_object('ok',true,'selection',true"
prop=prop.replace(needle,"     if (spec->>'task')::boolean then insert into public.atm_ai_task_context(user_id,channel,choices,phone,linked_at,expires_at) values(actor,p_channel,candidates,p_phone,link_time,now()+interval '15 minutes');end if;\n"+needle)
needle="    r:=public.wa_safe_operation(actor,op,target,coalesce(p_payload->'data','{}'),true,null);"
assert needle in prop
prop=prop.replace(needle,r"""    if (spec->>'task')::boolean then
     select u.name into selected_owner from public.tasks t join public.users u on u.id=t.owner_id where t.id=target::uuid;
     insert into public.atm_ai_task_context(user_id,channel,task_id,choices,phone,linked_at,expires_at)
      values(actor,p_channel,target::uuid,case when from_selection and coalesce(jsonb_array_length(ctx.choices),0)>0 then ctx.choices else coalesce(candidates,'[]') end,p_phone,link_time,now()+interval '15 minutes');
    end if;
    if op='task_update' and coalesce(p_payload->'data','{}')='{}'::jsonb then
     r:=public.wa_safe_operation(actor,op,target,jsonb_build_object('judul',candidates->0->>'title'),true,null);
     if r->>'ok'='true' then
      insert into public.atm_ai_sessions(user_id,channel,operation,target,payload,phone,linked_at,expires_at) values(actor,p_channel,op,target,'{"editDraft":true}',p_phone,link_time,now()+interval '5 minutes');
      r:=jsonb_build_object('ok',true,'message','Tugas terpilih: '||(candidates->0->>'title')||case when selected_owner is not null then ' — PIC: '||selected_owner else '' end||'. Bagian mana yang ingin diubah? Misalnya “ganti judul jadi ...”, prioritas, tanggal mulai, atau tenggat. Belum ada perubahan.','path','/tasks/'||target);
     else r:=r||jsonb_build_object('message',r->>'error');end if;
    else
    r:=public.wa_safe_operation(actor,op,target,coalesce(p_payload->'data','{}'),true,null);""")
# Close the edit-specific branch and context-error branch before the original outer role check.
assert prop.endswith('   end if;\n  end if;\n')
prop=prop[:-len('   end if;\n  end if;\n')]+'    end if;\n   end if;\n   end if;\n  end if;\n'
turn=turn[:start]+prop+turn[end:]
# Lists replace previous selections, including one-page lists. Single task reads select that task.
turn=turn.replace(" elsif p_kind='read' then\n", " elsif p_kind='read' then\n  delete from public.atm_ai_task_context where user_id=actor and channel=p_channel;\n")
needle="   if more then insert into public.atm_ai_sessions"
turn=turn.replace(needle,r"""   if jsonb_typeof(candidates)='array' and jsonb_array_length(candidates)>0 then
    insert into public.atm_ai_task_context(user_id,channel,task_id,choices,phone,linked_at,expires_at)
     values(actor,p_channel,case when jsonb_array_length(candidates)=1 then (candidates->0->>'id')::uuid else null end,candidates,p_phone,link_time,now()+interval '15 minutes');
   end if;
"""+needle)
turn=turn.replace("     msg:='Pratinjau: '||(r->>'label')||' — '||(r->>'subject');", "     msg:='Pratinjau: '||(r->>'label')||' — '||(r->>'subject')||case when selected_owner is not null then E'\\nPIC: '||selected_owner else '' end;")
target.write_text('begin;\n'+setup+'\n'+guard+'\n'+turn+"\nnotify pgrst,'reload schema';\ncommit;\n")
