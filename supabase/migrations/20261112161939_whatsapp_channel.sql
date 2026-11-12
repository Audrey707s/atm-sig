begin;
create table public.whatsapp_links (
  user_id uuid primary key references public.users(id) on delete cascade,
  phone text unique check (phone ~ '^[1-9][0-9]{7,14}$'),
  code_hash text unique,
  code_expires_at timestamptz,
  linked_at timestamptz,
  notifications_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  check ((code_hash is null) = (code_expires_at is null))
);
create table public.whatsapp_receipts (
  id text primary key check (id ~ '^[a-f0-9]{64}$'),
  sender text not null check (sender ~ '^[1-9][0-9]{7,14}$'),
  received_at timestamptz not null default now()
);
create index whatsapp_receipts_sender_time on public.whatsapp_receipts(sender,received_at desc);
create table public.whatsapp_outbox (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid unique references public.notifications(id) on delete cascade,
  receipt_id text unique references public.whatsapp_receipts(id) on delete cascade,
  user_id uuid references public.users(id) on delete cascade,
  phone text not null check (phone ~ '^[1-9][0-9]{7,14}$'),
  body text not null check (length(body) between 1 and 4000),
  state text not null default 'pending' check (state in ('pending','sending','accepted','unknown','cancelled')),
  provider_ids text[],
  created_at timestamptz not null default now(),
  attempted_at timestamptz,
  accepted_at timestamptz
);
create index whatsapp_outbox_pending on public.whatsapp_outbox(created_at) where state='pending';
alter table public.whatsapp_links enable row level security;
alter table public.whatsapp_receipts enable row level security;
alter table public.whatsapp_outbox enable row level security;
revoke all on public.whatsapp_links,public.whatsapp_receipts,public.whatsapp_outbox from public,anon,authenticated;
grant select,insert,update,delete on public.whatsapp_links,public.whatsapp_receipts,public.whatsapp_outbox to service_role;

create function public.wa_link_phone(p_hash text,p_phone text) returns uuid
language plpgsql security invoker set search_path='' as $$
declare found_user uuid;
begin
  if p_phone !~ '^[1-9][0-9]{7,14}$' then return null; end if;
  update public.whatsapp_links l set phone=p_phone, code_hash=null,code_expires_at=null,
    linked_at=now(),notifications_enabled=true
  where l.code_hash=p_hash and l.code_expires_at>now() and l.phone is null
    and exists(select 1 from public.users u where u.id=l.user_id and u.status='aktif')
  returning l.user_id into found_user;
  return found_user;
end $$;

create function public.wa_enqueue_notifications() returns integer
language plpgsql security invoker set search_path='' as $$
declare added integer;
begin
  insert into public.whatsapp_outbox(notification_id,user_id,phone,body)
  select n.id,n.user_id,l.phone,
    left(coalesce(n.title,'ATM-SIG')||E'\n'||coalesce(n.body,'')||E'\nhttps://atm-sig.vercel.app/notifications',4000)
  from public.notifications n join public.whatsapp_links l on l.user_id=n.user_id
    join public.users u on u.id=n.user_id and u.status='aktif'
  where l.phone is not null and l.notifications_enabled and n.sent_at>=l.linked_at
    and n.sent_at>now()-interval '24 hours'
    and (n.type <> 'task_review_requested' or exists(select 1 from public.tasks t where t.id=n.task_id and t.reviewer_id=n.user_id))
    and not exists(select 1 from public.whatsapp_outbox o where o.notification_id=n.id)
  order by n.sent_at limit 100 on conflict(notification_id) do nothing;
  get diagnostics added = row_count;
  return added;
end $$;

create function public.wa_claim_outbox() returns setof public.whatsapp_outbox
language sql security invoker set search_path='' as $$
  update public.whatsapp_outbox o set state='sending',attempted_at=now()
  where o.id=(select q.id from public.whatsapp_outbox q
    where q.state='pending' and (q.user_id is null or exists(select 1 from public.whatsapp_links l
      join public.users u on u.id=l.user_id and u.status='aktif'
      where l.user_id=q.user_id and l.phone=q.phone and l.notifications_enabled))
    and (q.notification_id is null or exists(select 1 from public.notifications n where n.id=q.notification_id and
      (n.type<>'task_review_requested' or exists(select 1 from public.tasks t where t.id=n.task_id and t.reviewer_id=n.user_id))))
    order by q.created_at for update of q skip locked limit 1)
  returning o.*;
$$;
revoke all on function public.wa_link_phone(text,text),public.wa_enqueue_notifications(),public.wa_claim_outbox() from public,anon,authenticated;
grant execute on function public.wa_link_phone(text,text),public.wa_enqueue_notifications(),public.wa_claim_outbox() to service_role;

create function public.wa_receive(p_id text,p_sender text,p_command text,p_hash text default null) returns text
language plpgsql security invoker set search_path='' as $$
declare recipient uuid; reply text; inserted text;
begin
  if p_id !~ '^[a-f0-9]{64}$' or p_sender !~ '^[1-9][0-9]{7,14}$' or p_command not in ('link','help','stop','start','disconnect') then
    raise exception 'Invalid incoming message';
  end if;
  if exists(select 1 from public.whatsapp_receipts where id=p_id) then return 'duplicate'; end if;
  if (select count(*) from public.whatsapp_receipts where sender=p_sender and received_at>now()-interval '1 minute')>=10 then return 'rate_limited'; end if;
  insert into public.whatsapp_receipts(id,sender) values(p_id,p_sender) on conflict do nothing returning id into inserted;
  if inserted is null then return 'duplicate'; end if;
  select l.user_id into recipient from public.whatsapp_links l join public.users u on u.id=l.user_id
    where l.phone=p_sender and u.status='aktif';
  if p_command='link' then
    if recipient is not null then reply:='WhatsApp sudah terhubung ke akun ATM. Buka Profil untuk mengatur koneksi.';
    else
      begin
        recipient:=public.wa_link_phone(p_hash,p_sender);
      exception when unique_violation then recipient:=null;
      end;
      if recipient is null then reply:='Kode tidak valid atau kedaluwarsa. Buat kode baru melalui Profil ATM.';
      else reply:='WhatsApp berhasil terhubung ke akun ATM. Notifikasi tugas aktif. Ketik STOP untuk berhenti atau MENU untuk bantuan.'; end if;
    end if;
  elsif p_command='stop' then
    update public.whatsapp_links set notifications_enabled=false where phone=p_sender;
    update public.whatsapp_outbox set state='cancelled' where user_id=recipient and state='pending';
    reply:='Notifikasi WhatsApp dihentikan. Ketik MULAI untuk mengaktifkan kembali.';
    recipient:=null;
  elsif p_command='start' then
    update public.whatsapp_links set notifications_enabled=true where user_id=recipient;
    if recipient is null then reply:='Hubungkan akun dahulu melalui Profil ATM: https://atm-sig.vercel.app/account';
    else reply:='Notifikasi WhatsApp diaktifkan kembali.'; end if;
  elsif p_command='disconnect' then
    delete from public.whatsapp_links where phone=p_sender;
    update public.whatsapp_outbox set state='cancelled' where user_id=recipient and state='pending';
    reply:='Koneksi WhatsApp ke akun ATM diputuskan.';
    recipient:=null;
  else
    reply:=E'ATM-SIG\nHubungkan akun melalui Profil: https://atm-sig.vercel.app/account\nSTOP: hentikan notifikasi\nMULAI: aktifkan notifikasi\nPUTUS: putuskan koneksi\n\nPembaruan tugas melalui chat belum aktif. Gunakan https://atm-sig.vercel.app/tasks';
    recipient:=null;
  end if;
  insert into public.whatsapp_outbox(receipt_id,user_id,phone,body) values(p_id,recipient,p_sender,reply);
  return 'queued';
end $$;
revoke all on function public.wa_receive(text,text,text,text) from public,anon,authenticated;
grant execute on function public.wa_receive(text,text,text,text) to service_role;
commit;
