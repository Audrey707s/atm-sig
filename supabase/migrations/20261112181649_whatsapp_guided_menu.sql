begin;
create table public.whatsapp_chat_sessions (
  user_id uuid primary key references public.users(id) on delete cascade,
  phone text not null,
  linked_at timestamptz not null,
  context jsonb not null check(jsonb_typeof(context)='object' and octet_length(context::text)<=10000),
  expires_at timestamptz not null
);
alter table public.whatsapp_chat_sessions enable row level security;
revoke all on public.whatsapp_chat_sessions from public,anon,authenticated;
grant select,insert,update,delete on public.whatsapp_chat_sessions to service_role;

-- Use the same central scope rule as the web, with an active actor obtained
-- from the verified phone link. Claims remain transaction-local and restored.
create function public.wa_scoped_tasks(p_actor uuid) returns setof public.tasks
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare old_claims text; old_sub text; actor_level integer;
begin
  select r.level into actor_level from public.users u join public.roles r on r.id=u.role_id where u.id=p_actor and u.status='aktif';
  if actor_level is null then return; end if;
  old_claims:=current_setting('request.jwt.claims',true);old_sub:=current_setting('request.jwt.claim.sub',true);
  perform set_config('request.jwt.claim.sub',p_actor::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',p_actor,'role','authenticated')::text,true);
  return query select t.* from public.tasks t
    where (t.owner_id=p_actor or t.reviewer_id=p_actor or (actor_level>=3 and public.can_access_task_scope(t.org_unit_id,t.owner_id,t.reviewer_id)));
  perform set_config('request.jwt.claim.sub',coalesce(old_sub,''),true);
  perform set_config('request.jwt.claims',coalesce(old_claims,''),true);
end $$;
revoke all on function public.wa_scoped_tasks(uuid) from public,anon,authenticated;
grant execute on function public.wa_scoped_tasks(uuid) to service_role;

create function public.wa_receive_guided(p_id text,p_sender text,p_command text,p_hash text default null,p_args jsonb default '{}'::jsonb)
returns text language plpgsql security invoker set search_path='' as $$
declare
  actor uuid; link_time timestamptz; opted_in boolean; actor_level integer;
  actor_name text; actor_email text; actor_role text; scope_label text;
  inserted text; reply text; task_row public.tasks%rowtype;
  proposed public.whatsapp_confirmations%rowtype;
  page_no integer; token text; pct integer; target uuid; line text; count_all integer; total_count integer; overdue_count integer;
  old_claims text; old_sub text; result text; cmd text:=p_command; args jsonb:=coalesce(p_args,'{}'::jsonb);
  ctx jsonb; next_ctx jsonb; ids jsonb:='[]'::jsonb; choice integer; mine boolean:=false;
begin
  if p_id is null or p_id !~ '^[a-f0-9]{64}$' or p_sender is null or p_sender !~ '^[1-9][0-9]{7,14}$' then raise exception 'Invalid message'; end if;
  if cmd is null or cmd not in ('link','help','stop','start','disconnect','tasks','reviews','detail','report','calendar','progress','confirm','cancel','choice','next','back','approve','mine','progress_list','progress_prompt','identity','settings') then raise exception 'Invalid command'; end if;
  select l.user_id,l.linked_at,l.notifications_enabled,r.level,u.name,u.email,r.name into actor,link_time,opted_in,actor_level,actor_name,actor_email,actor_role
    from public.whatsapp_links l join public.users u on u.id=l.user_id and u.status='aktif'
      join public.roles r on r.id=u.role_id where l.phone=p_sender for update of l;
  if exists(select 1 from public.whatsapp_receipts where id=p_id) then return 'duplicate'; end if;
  if cmd in ('link','stop','start','disconnect') then
    result:=public.wa_receive(p_id,p_sender,cmd,p_hash);
    if cmd in ('stop','disconnect') then
      delete from public.whatsapp_confirmations where user_id=actor;
      delete from public.whatsapp_chat_sessions where user_id=actor;
    end if;
    return result;
  end if;
  if (select count(*) from public.whatsapp_receipts where sender=p_sender and received_at>now()-interval '1 minute')>=10 then return 'rate_limited'; end if;
  insert into public.whatsapp_receipts(id,sender) values(p_id,p_sender) on conflict do nothing returning id into inserted;
  if inserted is null then return 'duplicate'; end if;
  select context into ctx from public.whatsapp_chat_sessions where user_id=actor and phone=p_sender and linked_at=link_time and expires_at>now();
  scope_label:=case when actor_level>=5 then 'Semua tugas' when actor_level>=3 then 'Tugas dalam cakupan tim Anda' else 'Tugas saya' end;
  if cmd='choice' then
    choice:=(args->>'choice')::integer;
    if choice=0 and coalesce(ctx->>'kind','')<>'progress_value' then cmd:='help';
    elsif ctx->>'kind'='list' and choice between 1 and jsonb_array_length(ctx->'ids') then
      cmd:=case when ctx->>'mode'='progress' then 'progress_prompt' else 'detail' end;
      args:=jsonb_build_object('taskId',ctx->'ids'->>(choice-1));
    elsif ctx->>'kind'='detail' and choice=1 then cmd:='progress_prompt';args:=jsonb_build_object('taskId',ctx->>'taskId');
    elsif ctx->>'kind'='progress_value' and choice between 0 and 100 then cmd:='progress';args:=jsonb_build_object('taskId',ctx->>'taskId','progress',choice);
    elsif ctx->>'kind'='confirm' and choice=1 then cmd:='confirm';args:=jsonb_build_object('token',ctx->>'token');
    elsif ctx->>'kind'='confirm' and choice=2 then cmd:='cancel';
    elsif ctx is null or ctx->>'kind'='menu' then
      cmd:=case choice when 1 then 'tasks' when 2 then 'reviews' when 3 then 'report' when 4 then 'calendar' when 5 then 'mine' when 6 then 'progress_list' when 7 then 'identity' when 8 then 'settings' else 'help' end;args:='{}'::jsonb;
    else cmd:='help'; end if;
  elsif cmd in ('next','back') then
    if ctx->>'kind'='list' then
      args:=jsonb_build_object('page',greatest(1,least(1000,(ctx->>'page')::integer+case when cmd='next' then 1 else -1 end)));
      cmd:=ctx->>'command';
    else cmd:='help'; end if;
  elsif cmd='approve' then
    if ctx->>'kind'='confirm' then cmd:='confirm';args:=jsonb_build_object('token',ctx->>'token');else cmd:='help';end if;
  end if;
  if cmd='mine' or cmd='progress_list' then mine:=true; end if;
  if cmd='help' then
    reply:=E'🔴 *ATM-SIG | Asisten Tugas*\n\nBalas *angka* atau *satu kata*:\n1️⃣ *TUGAS* — tugas sesuai hak akses\n2️⃣ *REVIEW* — antrean tinjauan\n3️⃣ *LAPORAN* — ringkasan tugas\n4️⃣ *KALENDER* — tenggat 7 hari\n5️⃣ *SAYA* — tugas dengan Anda sebagai PIC\n6️⃣ *PROGRES* — perbarui progres tugas saya\n7️⃣ *AKUN* — akun ATM yang terhubung\n8️⃣ *NOTIF* — pengaturan notifikasi\n\n💬 Contoh: kirim *1* atau *TUGAS*. Setelah daftar muncul, balas nomor tugas untuk membuka detail. Angka diketik lalu dikirim, bukan tombol interaktif.\n🏠 Ketik *MENU* kapan saja untuk kembali.\n\nPembuatan tugas, keputusan review, WBS, support, dan bukti: https://atm-sig.vercel.app/tasks';
    next_ctx:=jsonb_build_object('kind','menu');
  elsif actor is null then reply:=E'🔗 *Akun belum terhubung*\nHubungkan akun melalui Profil ATM: https://atm-sig.vercel.app/account';
  elsif not opted_in then reply:='Ketik MULAI sebelum menggunakan perintah tugas melalui WhatsApp.';
  elsif cmd='identity' then
    reply:=E'👤 *Akun ATM terhubung*\n'||actor_name||E'\n'||actor_email||E'\nPeran: '||actor_role||E'\nCakupan: '||scope_label||E'\n\nTugas sebagai PIC: '||(select count(*) from public.tasks where owner_id=actor)||E'\nTugas dapat dilihat: '||(select count(*) from public.wa_scoped_tasks(actor))||E'\n\nJika akun berbeda, putuskan koneksi melalui Profil, lalu hubungkan dari akun ATM yang benar.\n🏠 MENU — kembali';
    next_ctx:=jsonb_build_object('kind','menu');
  elsif cmd='settings' then
    reply:=E'🔔 *Notifikasi WhatsApp*\nAktif untuk akun ini.\n\n*STOP* — hentikan notifikasi\n*MULAI* — aktifkan kembali\n*PUTUS* — lepas hubungan akun\n*MENU* — menu utama';next_ctx:=jsonb_build_object('kind','menu');
  elsif cmd='cancel' then
    delete from public.whatsapp_confirmations where user_id=actor;
    reply:=E'✅ Perubahan yang belum disimpan dibatalkan.\n🏠 MENU — kembali';next_ctx:=jsonb_build_object('kind','menu');
  elsif cmd in ('tasks','reviews','calendar','mine','progress_list') then
    if coalesce(args->>'page','1') !~ '^[0-9]{1,4}$' then raise exception 'Invalid page'; end if;
    page_no:=(coalesce(args->>'page','1'))::integer;if page_no not between 1 and 1000 then raise exception 'Invalid page';end if;
    select count(*) into total_count from public.wa_scoped_tasks(actor) t where
      (not mine or t.owner_id=actor) and
      (cmd<>'reviews' or (t.status='Review' and (actor_level>=5 or t.reviewer_id=actor))) and
      (cmd<>'calendar' or (t.status<>'Done' and (t.due_date at time zone 'Asia/Jakarta')::date between (now() at time zone 'Asia/Jakarta')::date and (now() at time zone 'Asia/Jakarta')::date+6));
    reply:=case when cmd='reviews' then '🔎 *Antrean Review*' when cmd='calendar' then '🗓 *Tenggat 7 Hari*' when mine then '👤 *Tugas Saya*' else '📋 *Daftar Tugas*' end||E'\nCakupan: '||case when mine then 'Anda sebagai PIC' else scope_label end||E'\nTotal: '||total_count||' · Halaman '||page_no;
    count_all:=0;
    for task_row in select t.* from public.wa_scoped_tasks(actor) t where
      (not mine or t.owner_id=actor) and
      (cmd<>'reviews' or (t.status='Review' and (actor_level>=5 or t.reviewer_id=actor))) and
      (cmd<>'calendar' or (t.status<>'Done' and (t.due_date at time zone 'Asia/Jakarta')::date between (now() at time zone 'Asia/Jakarta')::date and (now() at time zone 'Asia/Jakarta')::date+6))
      order by t.due_date,t.id limit 5 offset (page_no-1)*5
    loop
      count_all:=count_all+1;ids:=ids||jsonb_build_array(task_row.id);
      line:=left(regexp_replace(task_row.title,E'[\n\r]+',' ','g'),150);
      reply:=reply||E'\n\n*'||count_all||'. '||line||E'*\nPIC: '||coalesce((select name from public.users where id=task_row.owner_id),'—')||E'\n'||task_row.status||' · '||task_row.progress_pct||E'%\n📅 '||to_char(task_row.due_date at time zone 'Asia/Jakarta','DD/MM/YYYY HH24:MI')||' WIB';
    end loop;
    if count_all=0 then
      reply:=reply||case when mine then E'\n\nBelum ada tugas yang menetapkan Anda sebagai PIC. Ketik TUGAS untuk melihat cakupan akses Anda.' when cmd='reviews' then E'\n\nTidak ada tugas berstatus Review dalam antrean ini.' when cmd='calendar' then E'\n\nTidak ada tenggat dalam 7 hari ke depan. Tugas lewat tenggat tetap dapat dilihat melalui TUGAS.' else E'\n\nTidak ada tugas pada halaman ini.' end;
    else reply:=reply||case when cmd='progress_list' then E'\n\n✍️ Balas nomor tugas untuk mengubah progres.' else E'\n\n🔎 Balas nomor tugas untuk membuka detail.' end;end if;
    if page_no*5<total_count then reply:=reply||E'\n➡️ LANJUT — halaman berikutnya';end if;
    if page_no>1 then reply:=reply||E'\n⬅️ KEMBALI — halaman sebelumnya';end if;
    reply:=reply||E'\n🏠 MENU — menu utama';
    next_ctx:=jsonb_build_object('kind','list','ids',ids,'command',cmd,'mode',case when cmd='progress_list' then 'progress' else 'detail' end,'page',page_no);
  elsif cmd='report' then
    select E'📊 *Laporan Tugas*\nCakupan: '||scope_label||E'\n\nTotal: '||count(*)||E'\n✅ Selesai: '||count(*) filter(where status='Done')||E'\n▶️ Berjalan: '||count(*) filter(where status='In progress')||E'\n⏳ Belum dimulai: '||count(*) filter(where status='To do')||E'\n🔎 Review: '||count(*) filter(where status='Review')||E'\n⛔ Blocked: '||count(*) filter(where status='Blocked')||E'\n📝 Revisi: '||count(*) filter(where status='Revisi')||E'\n⚠️ Lewat tenggat: '||count(*) filter(where status<>'Done' and due_date<=now())||E'\n\n🏠 MENU — kembali' into reply from public.wa_scoped_tasks(actor);
    next_ctx:=jsonb_build_object('kind','menu');
  elsif cmd='confirm' then
    select * into proposed from public.whatsapp_confirmations where user_id=actor for update;
    if not found or proposed.token is distinct from args->>'token' then reply:='Kode konfirmasi tidak valid. Kirim ulang perintah PROGRES.';
    elsif proposed.expires_at<=now() or proposed.phone<>p_sender or proposed.linked_at<>link_time then
      delete from public.whatsapp_confirmations where user_id=actor;
      reply:='Konfirmasi kedaluwarsa. Kirim ulang perintah PROGRES.';
    else
      select * into task_row from public.tasks where id=proposed.task_id and owner_id=actor for update;
      if not found or actor_level<2 or md5(to_jsonb(task_row)::text)<>proposed.task_version then
        reply:='Tugas atau hak akses berubah. Perubahan tidak disimpan; periksa DETAIL lalu kirim ulang PROGRES.';
      else
        -- Reuse the existing owner/audit/progress/notification triggers with a
        -- transaction-local actor derived ONLY from the verified phone link.
        old_claims:=current_setting('request.jwt.claims',true);
        old_sub:=current_setting('request.jwt.claim.sub',true);
        begin
          perform set_config('request.jwt.claim.sub',actor::text,true);
          perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
          update public.tasks set progress_pct=proposed.progress_pct where id=task_row.id and owner_id=actor;
          reply:='Progres tersimpan: '||proposed.progress_pct||E'%\n'||left(task_row.title,180)||E'\nhttps://atm-sig.vercel.app/tasks/'||task_row.id;
        exception when raise_exception or check_violation or insufficient_privilege then
          reply:='Perubahan ditolak oleh aturan tugas ATM. Periksa tugas melalui web.';
        end;
        perform set_config('request.jwt.claim.sub',coalesce(old_sub,''),true);
        perform set_config('request.jwt.claims',coalesce(old_claims,''),true);
      end if;
      delete from public.whatsapp_confirmations where user_id=actor;
    end if;
    delete from public.whatsapp_chat_sessions where user_id=actor;
  else
    target:=(args->>'taskId')::uuid;
    select * into task_row from public.wa_scoped_tasks(actor) where id=target;
    if not found then reply:='Tugas tidak ditemukan atau di luar akses chat Anda.';next_ctx:=jsonb_build_object('kind','menu');
    elsif cmd='detail' then
      reply:=E'📌 *Detail Tugas*\n*'||left(task_row.title,250)||E'*\nPIC: '||coalesce((select name from public.users where id=task_row.owner_id),'—')||E'\nStatus: '||task_row.status||E'\nProgres: '||task_row.progress_pct||E'%\nPrioritas: '||task_row.priority||E'\nTenggat: '||to_char(task_row.due_date at time zone 'Asia/Jakarta','DD/MM/YYYY HH24:MI')||E' WIB\n🔗 https://atm-sig.vercel.app/tasks/'||task_row.id;
      if task_row.owner_id=actor and actor_level>=2 then reply:=reply||E'\n\n*1* — ubah progres tugas ini';end if;
      reply:=reply||E'\n🏠 MENU — kembali';next_ctx:=jsonb_build_object('kind','detail','taskId',task_row.id);
    elsif task_row.owner_id<>actor or actor_level<2 then reply:='Hanya PIC tugas yang dapat memperbarui progres.';next_ctx:=jsonb_build_object('kind','menu');
    elsif cmd='progress_prompt' then
      reply:=E'✍️ *Perbarui Progres*\n'||left(task_row.title,180)||E'\nProgres sekarang: '||task_row.progress_pct||E'%\n\nBalas angka 0–100, misalnya *50*. Ini belum menyimpan perubahan.\nBATAL — batalkan · MENU — menu utama';
      next_ctx:=jsonb_build_object('kind','progress_value','taskId',task_row.id);
    else
      -- The preview version is rechecked under a row lock by the confirmation.
      pct:=(args->>'progress')::integer;
      if pct is null or pct not between 0 and 100 then raise exception 'Invalid progress';end if;
      token:=left(replace(gen_random_uuid()::text,'-',''),12);
      insert into public.whatsapp_confirmations(user_id,phone,linked_at,token,task_id,task_version,progress_pct,expires_at)
      values(actor,p_sender,link_time,token,task_row.id,md5(to_jsonb(task_row)::text),pct,now()+interval '5 minutes')
      on conflict(user_id) do update set phone=excluded.phone,linked_at=excluded.linked_at,token=excluded.token,task_id=excluded.task_id,task_version=excluded.task_version,progress_pct=excluded.progress_pct,expires_at=excluded.expires_at;
      reply:=E'📝 *Konfirmasi Progres*\n'||left(task_row.title,180)||E'\n'||task_row.progress_pct||'% → '||pct||E'%\n\n*1 / YA* — simpan\n*2 / BATAL* — batalkan\n\nBerlaku 5 menit. Status tugas tidak berubah.\nAlternatif: KONFIRMASI '||token;
      next_ctx:=jsonb_build_object('kind','confirm','token',token);
    end if;
  end if;
  if actor is not null and opted_in and next_ctx is not null then
    insert into public.whatsapp_chat_sessions(user_id,phone,linked_at,context,expires_at) values(actor,p_sender,link_time,next_ctx,now()+interval '15 minutes')
    on conflict(user_id) do update set phone=excluded.phone,linked_at=excluded.linked_at,context=excluded.context,expires_at=excluded.expires_at;
  end if;
  insert into public.whatsapp_outbox(receipt_id,user_id,phone,body) values(p_id,case when cmd='help' or actor is null or not opted_in then null else actor end,p_sender,reply);
  return 'queued';
end $$;
revoke all on function public.wa_receive_guided(text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.wa_receive_guided(text,text,text,text,jsonb) to service_role;
commit;
