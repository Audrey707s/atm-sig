begin;
create table public.ai_chat_threads (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.users(id) on delete cascade,
 title text not null default 'Percakapan baru' check(length(title) between 1 and 100),
 last_preview text not null default '' check(length(last_preview)<=160),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(id,user_id)
);
create index ai_chat_threads_owner_updated on public.ai_chat_threads(user_id,updated_at desc);
create table public.ai_chat_messages (
 id uuid primary key default gen_random_uuid(),
 conversation_id uuid not null, user_id uuid not null references public.users(id) on delete cascade,
 author text not null check(author in ('user','assistant')),
 content text not null check(length(content) between 1 and 12000),
 page_path text check(page_path is null or (page_path like '/%' and page_path not like '//%' and length(page_path)<=500)),
 created_at timestamptz not null default now(),
 foreign key(conversation_id,user_id) references public.ai_chat_threads(id,user_id) on delete cascade
);
create index ai_chat_messages_thread_created on public.ai_chat_messages(conversation_id,created_at desc);
create index ai_chat_messages_owner on public.ai_chat_messages(user_id);
alter table public.ai_chat_threads enable row level security;
alter table public.ai_chat_messages enable row level security;
revoke all on public.ai_chat_threads,public.ai_chat_messages from public,anon,authenticated;
grant select,insert on public.ai_chat_threads,public.ai_chat_messages to authenticated;
grant update(title,last_preview,updated_at) on public.ai_chat_threads to authenticated;
grant all on public.ai_chat_threads,public.ai_chat_messages to service_role;
create policy ai_threads_read on public.ai_chat_threads for select to authenticated using(user_id=(select auth.uid()) and exists(select 1 from public.users u where u.id=(select auth.uid()) and u.status='aktif'));
create policy ai_threads_insert on public.ai_chat_threads for insert to authenticated with check(user_id=(select auth.uid()) and exists(select 1 from public.users u where u.id=(select auth.uid()) and u.status='aktif'));
create policy ai_threads_update on public.ai_chat_threads for update to authenticated using(user_id=(select auth.uid()) and exists(select 1 from public.users u where u.id=(select auth.uid()) and u.status='aktif')) with check(user_id=(select auth.uid()));
create policy ai_messages_read on public.ai_chat_messages for select to authenticated using(user_id=(select auth.uid()) and exists(select 1 from public.users u where u.id=(select auth.uid()) and u.status='aktif'));
create policy ai_messages_insert on public.ai_chat_messages for insert to authenticated with check(user_id=(select auth.uid()) and exists(select 1 from public.users u where u.id=(select auth.uid()) and u.status='aktif'));
notify pgrst,'reload schema';
commit;
