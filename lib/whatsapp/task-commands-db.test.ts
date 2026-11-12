import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { afterAll,afterEach,beforeAll,beforeEach,describe,expect,it } from 'vitest'
const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222'
const task='33333333-3333-4333-8333-333333333333',foreignTask='44444444-4444-4444-8444-444444444444'
const phone='6281111111111'
let db:PGlite,seq=0
async function receive(command:string,args:Record<string,string|number>={},sender=phone,id=(++seq).toString(16).padStart(64,'0')) {
  await db.query('select public.wa_receive_task($1,$2,$3,null,$4::jsonb)',[id,sender,command,JSON.stringify(args)])
  return (await db.query<{body:string}>('select body from public.whatsapp_outbox where receipt_id=$1',[id])).rows[0]?.body
}
async function progress() {return (await db.query<{progress_pct:number}>('select progress_pct from public.tasks where id=$1',[task])).rows[0].progress_pct}
async function token() {return (await db.query<{token:string}>('select token from public.whatsapp_confirmations')).rows[0].token}
describe('WhatsApp task commands: access, confirmation, atomicity',()=>{
  beforeAll(async()=>{
    db=new PGlite()
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create table public.roles(id integer primary key,level integer not null);
      insert into public.roles select n,n from generate_series(1,6) n;
      create table public.users(id uuid primary key,status text not null,role_id integer references public.roles);
      create table public.tasks(id uuid primary key,owner_id uuid,reviewer_id uuid,title text default 'Tugas pribadi',status text default 'In progress',progress_pct integer default 10,priority text default 'sedang',due_date timestamptz default now()+interval '1 day');
      create table public.notifications(id uuid primary key default gen_random_uuid(),user_id uuid,task_id uuid,type text,title text,body text,sent_at timestamptz default now());
      create table public.audit_logs(user_id uuid,action text,object text,old_value text,new_value text);
      grant usage on schema public,auth to service_role,anon,authenticated;
      grant select on public.roles,public.users,public.notifications to service_role;
      grant select,update on public.tasks to service_role;`)
    for(const file of ['20261112161939_whatsapp_channel.sql','016_task_progress_history.sql','20261022015000_atomic_task_audit.sql','20261112171810_whatsapp_task_commands.sql']) {
      // The read policy needs a web-scope helper; chatbot queries deliberately
      // restrict results to own/assigned-review tasks rather than bypassing it.
      if(file==='016_task_progress_history.sql') await db.exec(`create function public.can_access_task_scope(integer,uuid,uuid) returns boolean language sql as $$select false$$;alter table public.tasks add column org_unit_id integer default 1;`)
      await db.exec(readFileSync('supabase/migrations/'+file,'utf8'))
    }
  })
  afterAll(async()=>db?.close())
  beforeEach(async()=>{
    await db.exec(`begin;
      insert into public.users values('${owner}','aktif',2),('${other}','aktif',2);
      insert into public.tasks(id,owner_id,reviewer_id,title) values('${task}','${owner}','${other}','Tugas saya'),('${foreignTask}','${other}',null,'Rahasia orang lain');
      insert into public.whatsapp_links(user_id,phone,linked_at,notifications_enabled) values('${owner}','${phone}',now()-interval '1 minute',true);`)
  })
  afterEach(async()=>{await db.exec('rollback')})
  it('denies public access to confirmation data and command execution',async()=>{
    const result=await db.query<{allowed:boolean}>(`select has_table_privilege(role,'public.whatsapp_confirmations','select') or has_function_privilege(role,'public.wa_receive_task(text,text,text,text,jsonb)','execute') allowed from(values('anon'),('authenticated')) x(role)`)
    expect(result.rows.every(x=>!x.allowed)).toBe(true)
  })
  it('lists only own tasks and does not reveal a guessed foreign task ID',async()=>{
    expect(await receive('tasks')).toContain('Tugas saya')
    expect(await receive('tasks')).not.toContain('Rahasia orang lain')
    expect(await receive('detail',{taskId:foreignTask})).toContain('di luar akses')
  })
  it('summarizes own tasks and separates review and WIB calendar queries',async()=>{
    expect(await receive('report')).toContain('Total: 1')
    expect(await receive('report')).toContain('Berjalan: 1')
    expect(await receive('calendar')).toContain('Tugas saya')
    expect(await receive('calendar')).not.toContain('Rahasia orang lain')
    expect(await receive('reviews')).not.toContain('Rahasia orang lain')
    await db.exec(`update public.tasks set reviewer_id='${owner}',status='Review' where id='${foreignTask}';`)
    expect(await receive('reviews')).toContain('Rahasia orang lain')
    expect(await receive('tasks',{page:2})).toContain('Tidak ada tugas')
  })
  it('keeps pending progress single-use when a newer proposal replaces it',async()=>{
    await receive('progress',{taskId:task,progress:20});const first=await token()
    await receive('progress',{taskId:task,progress:40});const second=await token()
    expect(await receive('confirm',{token:first})).toContain('tidak valid')
    expect(await progress()).toBe(10)
    expect(await receive('confirm',{token:second})).toContain('tersimpan: 40%')
    expect(await receive('confirm',{token:second})).toContain('tidak valid')
  })
  it('allows assigned reviewers to read details but not change another PIC progress',async()=>{
    await db.exec(`update public.tasks set reviewer_id='${owner}' where id='${foreignTask}';`)
    expect(await receive('detail',{taskId:foreignTask})).toContain('Rahasia orang lain')
    expect(await receive('progress',{taskId:foreignTask,progress:50})).toContain('Hanya PIC')
  })
  it('does not disclose any tasks to unlinked or stopped senders',async()=>{
    expect(await receive('tasks',{},'6282222222222')).toContain('Hubungkan akun')
    await receive('stop')
    expect(await receive('detail',{taskId:task})).toContain('Ketik MULAI')
  })
  it('requires confirmation, attributes existing audit/history triggers, and deduplicates retries',async()=>{
    const preview=await receive('progress',{taskId:task,progress:55})
    expect(preview).toContain('10% → 55%');expect(await progress()).toBe(10)
    const code=await token(),id='e'.repeat(64)
    expect(await receive('confirm',{token:code},phone,id)).toContain('Progres tersimpan: 55%')
    expect(await progress()).toBe(55)
    await receive('confirm',{token:code},phone,id)
    const history=await db.query<{changed_by:string}>('select changed_by from public.task_progress_history')
    expect(history.rows).toEqual([{changed_by:owner}])
    expect((await db.query<{user_id:string}>('select user_id from public.audit_logs')).rows).toEqual([{user_id:owner}])
    expect((await db.query<{sub:string}>('select current_setting(\'request.jwt.claim.sub\',true) sub')).rows[0].sub).toBe('')
  })
  it.each([1,2,3,4,5,6])('applies owner-only progress permission for role level %i',async level=>{
    await db.query('update public.users set role_id=$1 where id=$2',[level,owner])
    const reply=await receive('progress',{taskId:task,progress:70})
    if(level===1) {expect(reply).toContain('Hanya PIC');expect(await progress()).toBe(10)}
    else {expect(reply).toContain('KONFIRMASI');expect(await receive('confirm',{token:await token()})).toContain('tersimpan');expect(await progress()).toBe(70)}
  })
  it.each(['changed','expired','reassigned','relinked','inactive','stopped','cancelled'])('rejects stale confirmation: %s',async reason=>{
    await receive('progress',{taskId:task,progress:80});const code=await token()
    if(reason==='changed') await db.exec(`update public.tasks set title='Diubah di web' where id='${task}'`)
    if(reason==='expired') await db.exec(`update public.whatsapp_confirmations set expires_at=now()-interval '1 second'`)
    if(reason==='reassigned') await db.exec(`update public.tasks set owner_id='${other}' where id='${task}'`)
    if(reason==='relinked') await db.exec(`update public.whatsapp_links set linked_at=now()`)
    if(reason==='inactive') await db.exec(`update public.users set status='nonaktif' where id='${owner}'`)
    if(reason==='stopped') await receive('stop')
    if(reason==='cancelled') await receive('cancel')
    expect(await receive('confirm',{token:code})).not.toContain('tersimpan')
    expect(await progress()).toBe(10)
  })
  it('rolls the mutation back if an existing business-rule trigger rejects it',async()=>{
    await db.exec(`create function public.reject_progress() returns trigger language plpgsql as $$begin raise exception 'blocked';end$$;create trigger reject before update on public.tasks for each row execute function public.reject_progress();`)
    await receive('progress',{taskId:task,progress:50})
    expect(await receive('confirm',{token:await token()})).toContain('ditolak')
    expect(await progress()).toBe(10)
    expect((await db.query('select * from public.audit_logs')).rows).toHaveLength(0)
  })
  it('runs with the actual service role instead of depending on migration-owner privileges',async()=>{
    await db.exec('set local role service_role')
    expect(await receive('progress',{taskId:task,progress:60})).toContain('KONFIRMASI')
    expect(await receive('confirm',{token:await token()})).toContain('tersimpan')
    expect(await progress()).toBe(60)
  })
})
