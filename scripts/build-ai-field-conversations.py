from pathlib import Path
import re
root=Path('supabase/migrations');base=(root/'20261116172347_ai_status_feedback.sql').read_text()
turn=re.search(r'create or replace function public.atm_ai_turn\(.*?end \$\$;',base,re.S).group(0)
turn=turn.replace("'data',s.payload->'data'", "'data',s.payload->'data','field',s.payload->>'intentField'")
turn=turn.replace("'guided',true,'field','target'", "'guided',true,'intentField',p_payload->>'field','field','target'")
turn=turn.replace("'data',coalesce(p_payload->'data','{}'),'choices',candidates", "'data',coalesce(p_payload->'data','{}'),'intentField',p_payload->>'field','choices',candidates")
turn=turn.replace("'guided',true,'field',guided->>'field'", "'guided',true,'intentField',p_payload->>'field','field',guided->>'field'")
turn=turn.replace("'guided',true,'field',missing", "'guided',true,'intentField',p_payload->>'field','field',missing")
needle="    p_payload:=p_payload||jsonb_build_object('data',coalesce(guided->'data',p_payload->'data','{}'));"
extra="""    -- A requested field is a bounded hint, never a new permission or data value.
    if op='task_update' and guided->>'ok'='true' and guided->>'field'='update'
      and p_payload->>'field' in ('prioritas','judul','mulai','tenggat')
      and (spec->'fields')?(p_payload->>'field') then
     f:=p_payload->>'field';
     guided:=guided||jsonb_build_object('field',f,'question',case f
      when 'prioritas' then 'Prioritasnya ingin menjadi apa? Balas Tinggi, Sedang, atau Rendah.'
      when 'judul' then 'Apa judul baru yang ingin digunakan?'
      when 'mulai' then 'Kapan waktu mulai yang baru? Misalnya besok jam 8 pagi.'
      when 'tenggat' then 'Kapan tenggat baru? Misalnya lusa jam 4 sore.' end,
      'options',case when f='prioritas' then '[{"label":"Tinggi","value":"tinggi"},{"label":"Sedang","value":"sedang"},{"label":"Rendah","value":"rendah"}]'::jsonb else '[]'::jsonb end);
    end if;
"""
assert needle in turn;turn=turn.replace(needle,extra+needle,1)
next(root.glob('*_ai_field_conversations.sql')).write_text('-- Retain the explicitly requested task field across clarification, selection and both chat channels.\nbegin;\n'+turn+'\ncommit;\n')
