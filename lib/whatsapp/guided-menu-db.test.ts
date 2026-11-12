import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { afterAll,afterEach,beforeAll,beforeEach,describe,expect,it } from 'vitest'
const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222'
const task='33333333-3333-4333-8333-333333333333',foreignTask='44444444-4444-4444-8444-444444444444'
const phone='6281111111111'
let db:PGlite,seq=0
async function receive(command:string,args:Record<string,string|number>={},sender=phone,id=(++seq).toString(16).padStart(64,'0')) {
  await db.query('select public.wa_receive_guided($1,$2,$3,null,$4::jsonb)',[id,sender,command,JSON.stringify(args)])
  return (await db.query<{body:string}>('select body from public.whatsapp_outbox where receipt_id=$1',[id])).rows[0]?.body
}
async function progress() {return (await db.query<{progress_pct:number}>('select progress_pct from public.tasks where id=$1',[task])).rows[0].progress_pct}
describe('WhatsApp guided menu and web role scope',()=>{
  beforeAll(async()=>{
    db=new PGlite()
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create table public.roles(id integer primary key,level integer not null,name text);
      insert into public.roles select n,n,'Role '||n from generate_series(1,6) n;
      create table public.users(id uuid primary key,status text not null,role_id integer references public.roles,name text default 'Pengguna',email text default 'user@example.test',org_unit_id integer default 2);create table public.org_units(id integer primary key,parent_id integer);insert into public.org_units values(1,null),(2,1),(3,1),(4,2);
      create table public.tasks(id uuid primary key,owner_id uuid,reviewer_id uuid,title text default 'Tugas pribadi',status text default 'In progress',progress_pct integer default 10,priority text default 'sedang',due_date timestamptz default now()+interval '1 day');
      create table public.notifications(id uuid primary key default gen_random_uuid(),user_id uuid,task_id uuid,type text,title text,body text,sent_at timestamptz default now());
      create table public.audit_logs(user_id uuid,action text,object text,old_value text,new_value text);
      grant usage on schema public,auth to service_role,anon,authenticated;
      grant select on public.roles,public.users,public.notifications to service_role;
      grant select,update on public.tasks to service_role;`)
    for(const file of ['20261112161939_whatsapp_channel.sql','016_task_progress_history.sql','20261022015000_atomic_task_audit.sql','20261112174755_whatsapp_task_commands.sql','20261112181649_whatsapp_guided_menu.sql']) {
      // The read policy needs a web-scope helper; chatbot queries deliberately
      // restrict results to own/assigned-review tasks rather than bypassing it.
      if(file==='016_task_progress_history.sql') await db.exec(`create function public.can_access_task_scope(integer,uuid,uuid) returns boolean language sql as $$select $2=auth.uid() or $3=auth.uid() or exists(select 1 from public.users u join public.roles r on r.id=u.role_id where u.id=auth.uid() and (r.level>=5 or (r.level>=3 and ($1=u.org_unit_id or (r.level=4 and exists(select 1 from public.org_units o where o.id=$1 and o.parent_id=u.org_unit_id))))))$$;alter table public.tasks add column org_unit_id integer default 1;`)
      await db.exec(readFileSync('supabase/migrations/'+file,'utf8'))
    }
  })
  afterAll(async()=>db?.close())
  beforeEach(async()=>{
    await db.exec(`begin;
      insert into public.users(id,status,role_id) values('${owner}','aktif',2),('${other}','aktif',2);
      insert into public.tasks(id,owner_id,reviewer_id,title) values('${task}','${owner}','${other}','Tugas saya'),('${foreignTask}','${other}',null,'Rahasia orang lain');
      update public.tasks set org_unit_id=case when id='${task}' then 2 else 3 end;insert into public.whatsapp_links(user_id,phone,linked_at,notifications_enabled) values('${owner}','${phone}',now()-interval '1 minute',true);`)
  })
  afterEach(async()=>{await db.exec('rollback')})
  it('renders numbered menu, accepts task selection and commits only after confirmation',async()=>{
    expect(await receive('help')).toContain('1️⃣ *TUGAS*')
    expect(await receive('choice',{choice:1})).toContain('Tugas saya')
    expect(await receive('choice',{choice:1})).toContain('Detail Tugas')
    expect(await receive('choice',{choice:1})).toContain('Balas angka 0–100')
    expect(await receive('choice',{choice:50})).toContain('10% → 50%')
    expect(await progress()).toBe(10)
    expect(await receive('choice',{choice:1})).toContain('Progres tersimpan: 50%')
    expect(await progress()).toBe(50)
  })
  it.each([1,2,3,4,5,6])('applies current web task scope for role level %i',async level=>{
    await db.query('update public.users set role_id=$1 where id=$2',[level,owner])
    await db.exec(`insert into public.tasks(id,owner_id,title,org_unit_id) values('55555555-5555-4555-8555-555555555555','${other}','Tugas anak unit',4);`)
    const reply=await receive('tasks')
    expect(reply).toContain('Total: '+(level>=5?3:level===4?2:1))
    expect(reply?.includes('Rahasia orang lain')).toBe(level>=5)
    expect(reply?.includes('Tugas anak unit')).toBe(level>=4)
  })
  it('distinguishes own tasks from all tasks and shows the linked account',async()=>{
    await db.exec(`update public.users set role_id=6 where id='${owner}';update public.tasks set owner_id='${other}' where id='${task}';`)
    expect(await receive('tasks')).toContain('Total: 2')
    expect(await receive('report')).toContain('Total: 2')
    expect(await receive('mine')).toContain('Belum ada tugas yang menetapkan Anda sebagai PIC')
    expect(await receive('identity')).toContain('user@example.test')
    expect(await receive('identity')).toContain('Tugas dapat dilihat: 2')
  })
  it('shows all review tasks to GM/SA while other roles get assigned review only',async()=>{
    await db.exec(`update public.tasks set status='Review' where id='${foreignTask}';`)
    expect(await receive('reviews')).toContain('Total: 0')
    await db.exec(`update public.users set role_id=5 where id='${owner}';`)
    expect(await receive('reviews')).toContain('Total: 1')
    expect(await receive('progress',{taskId:foreignTask,progress:60})).toContain('Hanya PIC')
  })
  it('rechecks task scope after a role change during task selection',async()=>{
    await db.exec(`update public.users set role_id=6 where id='${owner}';`)
    await receive('tasks')
    await db.exec(`update public.users set role_id=2 where id='${owner}';`)
    const ctx=(await db.query<{context:{ids:string[]}}>('select context from public.whatsapp_chat_sessions')).rows[0].context
    const index=ctx.ids.indexOf(foreignTask)+1
    const reply=await receive('choice',{choice:index})
    expect(reply).toContain('di luar akses');expect(reply).not.toContain('Rahasia orang lain')
  })
  it('handles zero progress, cancellation, and single-use YA confirmation',async()=>{
    await receive('progress_list');await receive('choice',{choice:1})
    expect(await receive('choice',{choice:0})).toContain('10% → 0%')
    await receive('cancel');expect(await receive('approve')).not.toContain('tersimpan');expect(await progress()).toBe(10)
    await receive('progress',{taskId:task,progress:20})
    expect(await receive('approve')).toContain('tersimpan: 20%')
    expect(await receive('approve')).not.toContain('tersimpan')
  })
  it('deduplicates numeric replies without advancing the conversational step twice',async()=>{
    await receive('tasks');const id='e'.repeat(64)
    await receive('choice',{choice:1},phone,id)
    await receive('choice',{choice:1},phone,id)
    const ctx=(await db.query<{context:{kind:string}}>('select context from public.whatsapp_chat_sessions')).rows[0].context
    expect(ctx.kind).toBe('detail');expect(await progress()).toBe(10)
  })
  it('expires and revokes conversational state when the link changes or stops',async()=>{
    await receive('tasks');await db.exec(`update public.whatsapp_chat_sessions set expires_at=now()-interval '1 second'`)
    expect(await receive('choice',{choice:7})).toContain('Akun ATM terhubung')
    await receive('tasks');await receive('stop')
    expect((await db.query('select * from public.whatsapp_chat_sessions')).rows).toHaveLength(0)
    expect(await receive('choice',{choice:1})).toContain('MULAI')
  })
  it('uses exact list pagination and preserves the current list on LANJUT/KEMBALI',async()=>{
    for(let i=0;i<6;i++) await db.query('insert into public.tasks(id,owner_id,title,org_unit_id) values(gen_random_uuid(),$1,$2,2)',[owner,'Tambahan '+i])
    expect(await receive('tasks')).toContain('LANJUT')
    expect(await receive('next')).toContain('Halaman 2')
    expect(await receive('back')).toContain('Halaman 1')
  })
  it('denies public session/helper access and works with the service role',async()=>{
    const r=await db.query<{allowed:boolean}>(`select has_table_privilege(role,'public.whatsapp_chat_sessions','select') or has_function_privilege(role,'public.wa_scoped_tasks(uuid)','execute') or has_function_privilege(role,'public.wa_receive_guided(text,text,text,text,jsonb)','execute') allowed from(values('anon'),('authenticated')) x(role)`)
    expect(r.rows.every(x=>!x.allowed)).toBe(true)
    await db.exec('set local role service_role')
    expect(await receive('tasks')).toContain('Total: 1')
    expect((await db.query<{sub:string}>("select current_setting('request.jwt.claim.sub',true) sub")).rows[0].sub).toBe('')
  })
})
