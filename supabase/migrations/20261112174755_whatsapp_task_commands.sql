begin;
-- A confirmation is a proposed change, never an alternate authentication token.
create table public.whatsapp_confirmations (
  user_id uuid primary key references public.users(id) on delete cascade,
  phone text not null,
  linked_at timestamptz not null,
  token text not null,
  task_id uuid not null references public.tasks(id) on delete cascade,
  task_version text not null,
  progress_pct integer not null check(progress_pct between 0 and 100),
  expires_at timestamptz not null
);
alter table public.whatsapp_confirmations enable row level security;
revoke all on public.whatsapp_confirmations from public,anon,authenticated;
grant select,insert,update,delete on public.whatsapp_confirmations to service_role;

create function public.wa_receive_task(p_id text,p_sender text,p_command text,p_hash text default null,p_args jsonb default '{}'::jsonb)
returns text language plpgsql security invoker set search_path='' as $$
declare
  actor uuid; link_time timestamptz; opted_in boolean; actor_level integer;
  inserted text; reply text; task_row public.tasks%rowtype;
  proposed public.whatsapp_confirmations%rowtype;
  page_no integer; token text; pct integer; target uuid; line text; count_all integer;
  old_claims text; old_sub text; result text;
begin
  if p_command in ('link','help','stop','start','disconnect') then
    if p_command <> 'help' then
      select user_id into actor from public.whatsapp_links where phone=p_sender for update;
      result:=public.wa_receive(p_id,p_sender,p_command,p_hash);
      if p_command in ('stop','disconnect') then delete from public.whatsapp_confirmations where user_id=actor; end if;
      return result;
    end if;
  elsif p_command not in ('tasks','reviews','detail','report','calendar','progress','confirm','cancel') then
    raise exception 'Invalid command';
  end if;
  if p_id is null or p_id !~ '^[a-f0-9]{64}$' or p_sender is null or p_sender !~ '^[1-9][0-9]{7,14}$' then raise exception 'Invalid message'; end if;
  -- Serialize commands for each linked account, including unlink/relink races.
  select l.user_id,l.linked_at,l.notifications_enabled,r.level into actor,link_time,opted_in,actor_level
    from public.whatsapp_links l join public.users u on u.id=l.user_id and u.status='aktif'
      join public.roles r on r.id=u.role_id where l.phone=p_sender for update of l;
  if exists(select 1 from public.whatsapp_receipts where id=p_id) then return 'duplicate'; end if;
  if (select count(*) from public.whatsapp_receipts where sender=p_sender and received_at>now()-interval '1 minute')>=10 then return 'rate_limited'; end if;
  insert into public.whatsapp_receipts(id,sender) values(p_id,p_sender) on conflict do nothing returning id into inserted;
  if inserted is null then return 'duplicate'; end if;
  if p_command='help' then
    reply:=E'ATM-SIG\nTUGAS [halaman]: tugas saya\nREVIEW [halaman]: tugas untuk saya tinjau\nDETAIL <ID>: detail tugas\nLAPORAN: ringkasan tugas saya\nKALENDER: tenggat 7 hari (WIB)\nPROGRES <ID> <0-100>: siapkan perubahan\nKONFIRMASI <kode>: simpan perubahan\nBATAL: batalkan perubahan\nSTOP / MULAI: atur notifikasi\nPUTUS: putuskan koneksi\n\nSalin ID dari daftar tugas. Pembuatan tugas, keputusan review, WBS, support, dan unggah bukti masih melalui web: https://atm-sig.vercel.app/tasks';
  elsif actor is null then reply:='Hubungkan akun dahulu melalui Profil ATM: https://atm-sig.vercel.app/account';
  elsif not opted_in then reply:='Ketik MULAI sebelum menggunakan perintah tugas melalui WhatsApp.';
  elsif p_command='cancel' then
    delete from public.whatsapp_confirmations where user_id=actor;
    reply:='Perubahan yang belum disimpan dibatalkan.';
  elsif p_command in ('tasks','reviews','calendar') then
    if coalesce(p_args->>'page','1') !~ '^[0-9]{1,4}$' then raise exception 'Invalid page'; end if;
    page_no:=(coalesce(p_args->>'page','1'))::integer;
    if page_no not between 1 and 1000 then raise exception 'Invalid page'; end if;
    reply:=case when p_command='reviews' then 'Tugas untuk saya tinjau' when p_command='calendar' then 'Tenggat 7 hari (WIB)' else 'Tugas saya' end || ' - halaman '||page_no;
    count_all:=0;
    for task_row in select t.* from public.tasks t
      where (case when p_command='reviews' then t.reviewer_id=actor and t.status='Review' else t.owner_id=actor end)
        and (p_command<>'calendar' or (t.status<>'Done' and (t.due_date at time zone 'Asia/Jakarta')::date between (now() at time zone 'Asia/Jakarta')::date and (now() at time zone 'Asia/Jakarta')::date+6))
      order by t.due_date,t.id limit 5 offset (page_no-1)*5
    loop
      count_all:=count_all+1;
      line:=left(regexp_replace(task_row.title,E'[\n\r]+',' ','g'),180);
      reply:=reply||E'\n\n'||line||E'\nID: '||task_row.id||E'\n'||task_row.status||' | '||task_row.progress_pct||'% | '||to_char(task_row.due_date at time zone 'Asia/Jakarta','DD/MM/YYYY HH24:MI')||' WIB';
    end loop;
    if count_all=0 then reply:=reply||E'\nTidak ada tugas pada halaman ini.';
    elsif count_all=5 then reply:=reply||E'\n\nHalaman berikut: '||case when p_command='reviews' then 'REVIEW' when p_command='calendar' then 'KALENDER' else 'TUGAS' end||' '||(page_no+1); end if;
  elsif p_command='report' then
    select E'Ringkasan tugas saya\nTotal: '||count(*)||E'\nSelesai: '||count(*) filter(where status='Done')||E'\nBerjalan: '||count(*) filter(where status='In progress')||E'\nBelum dimulai: '||count(*) filter(where status='To do')||E'\nReview: '||count(*) filter(where status='Review')||E'\nBlocked: '||count(*) filter(where status='Blocked')||E'\nRevisi: '||count(*) filter(where status='Revisi')||E'\nLewat tenggat: '||count(*) filter(where status<>'Done' and due_date<=now()) into reply
    from public.tasks where owner_id=actor;
  elsif p_command='confirm' then
    select * into proposed from public.whatsapp_confirmations where user_id=actor for update;
    if not found or proposed.token is distinct from p_args->>'token' then reply:='Kode konfirmasi tidak valid. Kirim ulang perintah PROGRES.';
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
  else
    target:=(p_args->>'taskId')::uuid;
    select * into task_row from public.tasks where id=target and (owner_id=actor or reviewer_id=actor) for update;
    if not found then reply:='Tugas tidak ditemukan atau di luar akses chat Anda.';
    elsif p_command='detail' then
      reply:=left(task_row.title,300)||E'\nID: '||task_row.id||E'\nStatus: '||task_row.status||E'\nProgres: '||task_row.progress_pct||E'%\nPrioritas: '||task_row.priority||E'\nTenggat: '||to_char(task_row.due_date at time zone 'Asia/Jakarta','DD/MM/YYYY HH24:MI')||E' WIB\nhttps://atm-sig.vercel.app/tasks/'||task_row.id;
    elsif task_row.owner_id<>actor or actor_level<2 then reply:='Hanya PIC tugas yang dapat memperbarui progres.';
    else
      pct:=(p_args->>'progress')::integer;
      if pct is null or pct not between 0 and 100 then raise exception 'Invalid progress'; end if;
      token:=left(replace(gen_random_uuid()::text,'-',''),12);
      insert into public.whatsapp_confirmations(user_id,phone,linked_at,token,task_id,task_version,progress_pct,expires_at)
      values(actor,p_sender,link_time,token,task_row.id,md5(to_jsonb(task_row)::text),pct,now()+interval '5 minutes')
      on conflict(user_id) do update set phone=excluded.phone,linked_at=excluded.linked_at,token=excluded.token,task_id=excluded.task_id,task_version=excluded.task_version,progress_pct=excluded.progress_pct,expires_at=excluded.expires_at;
      reply:='Konfirmasi perubahan progres'||E'\n'||left(task_row.title,180)||E'\n'||task_row.progress_pct||'% → '||pct||E'%\nKetik KONFIRMASI '||token||E' dalam 5 menit untuk menyimpan, atau BATAL. Status tugas tidak berubah.';
    end if;
  end if;
  -- Generic help/denial does not contain private data and can be acknowledged
  -- even when the sender has not linked or has stopped notifications.
  insert into public.whatsapp_outbox(receipt_id,user_id,phone,body)
  values(p_id,case when p_command='help' or actor is null or not opted_in then null else actor end,p_sender,reply);
  return 'queued';
end $$;
revoke all on function public.wa_receive_task(text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.wa_receive_task(text,text,text,text,jsonb) to service_role;
commit;
