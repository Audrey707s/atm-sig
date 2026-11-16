from pathlib import Path
import re
root=Path('supabase/migrations');base=(root/'20261116164754_ai_local_language.sql').read_text()
helper=re.search(r'create or replace function public.atm_ai_guided_fields\(.*?grant execute on function public.atm_ai_guided_fields\(.*?;',base,re.S).group(0)
helper=helper.replace("when 'progres' then","when 'status' then 'Status apa yang diinginkan? Balas Belum Dimulai, Berjalan, Terhambat, Menunggu Review, atau Selesai.' when 'progres' then")
turn=re.search(r'create or replace function public.atm_ai_turn\(.*?end \$\$;',base,re.S).group(0)
turn=turn.replace("missing:=case when coalesce(r->>'error','')", "missing:=case when op='task_status' then 'status' when coalesce(r->>'error','')",1)
guard=(root/'20261031000500_gm_review_override.sql').read_text().split('CREATE OR REPLACE FUNCTION public.require_reviewer_rejection_comment')[0]
needle_guard="  END IF;\n\n  IF NOT allowed_transition"
scoped="""  ELSIF actor_role_level >= 3 AND public.can_manage_org_unit(OLD.org_unit_id) THEN
    allowed_transition :=
      (OLD.status = 'To do' AND NEW.status = 'In progress') OR
      (OLD.status = 'In progress' AND NEW.status IN ('Blocked', 'Review')) OR
      (OLD.status = 'Blocked' AND NEW.status = 'In progress') OR
      (OLD.status = 'Revisi' AND NEW.status = 'In progress');
  END IF;

  IF NOT allowed_transition"""
assert needle_guard in guard
guard=guard.replace(needle_guard,scoped,1)
needle=' update public.atm_ai_sessions set conversation_id=thread_id'
feedback=""" if op='task_status' and r->>'ok'='false' then
  msg:=coalesce(r->>'error','');
  if msg like 'Transisi status task tidak diizinkan: To do -> Blocked%' then
   r:=r||jsonb_build_object('message','Saya memahami permintaan mengubah status menjadi Terhambat. Tugas ini masih Belum Dimulai. Sesuai alur ATM, ubah ke Berjalan dahulu dan pastikan ada permintaan support aktif sebelum menjadi Terhambat. Balas “Berjalan” untuk menyiapkan perubahan itu, atau BATAL. Belum ada perubahan.','path','/tasks/'||target);
  elsif msg like 'Task Blocked wajib memiliki permintaan support%' then
   r:=r||jsonb_build_object('message','Saya memahami status yang diminta: Terhambat. Tugas memerlukan permintaan support aktif terlebih dahulu. PIC dapat mengirim “minta bantuan <nama> untuk tugas <judul>”. Belum ada perubahan.','path','/tasks/'||target);
  elsif msg like 'Transisi status task tidak diizinkan:%' then
   r:=r||jsonb_build_object('message','Perubahan status tersebut belum diizinkan oleh alur tugas saat ini. Belum ada perubahan. Buka detail tugas untuk melihat status dan tindakan yang tersedia, atau sebutkan status lain.','path','/tasks/'||target);
  end if;
 end if;
"""
assert needle in turn;turn=turn.replace(needle,feedback+needle,1)
next(root.glob('*_ai_status_feedback.sql')).write_text('-- Restore web-scoped ordinary transitions without weakening review/evidence/support gates.\n-- Explain status prerequisites while preserving the selected task.\nbegin;\n'+guard+'\n'+helper+'\n'+turn+'\ncommit;\n')
