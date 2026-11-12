import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { afterAll,afterEach,beforeAll,beforeEach,describe,expect,it } from 'vitest'
let db:PGlite
const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222',task='33333333-3333-4333-8333-333333333333'
const hash='a'.repeat(64)
describe('WhatsApp database isolation and delivery rules',()=>{
  beforeAll(async()=>{
    db=new PGlite()
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
      create table public.users(id uuid primary key,status text not null);
      create table public.tasks(id uuid primary key,reviewer_id uuid);
      create table public.notifications(id uuid primary key default gen_random_uuid(),user_id uuid,task_id uuid,type text,title text,body text,sent_at timestamptz default now());
      grant usage on schema public to anon,authenticated,service_role;
      grant select on public.users,public.tasks,public.notifications to service_role;`)
    await db.exec(readFileSync('supabase/migrations/20261112161939_whatsapp_channel.sql','utf8'))
  })
  afterAll(async()=>db?.close())
  beforeEach(async()=>{
    await db.exec(`begin;insert into public.users values('${a}','aktif'),('${b}','aktif');insert into public.tasks values('${task}','${a}');`)
  })
  afterEach(async()=>{await db.exec('rollback')})
  it('denies browser/anonymous table and function access',async()=>{
    const r=await db.query<{role:string;tables:boolean;functions:boolean}>(`select role,
      has_table_privilege(role,'public.whatsapp_links','select') as tables,
      has_function_privilege(role,'public.wa_receive(text,text,text,text)','execute') as functions
      from (values('anon'),('authenticated')) x(role)`)
    expect(r.rows.every(x=>!x.tables&&!x.functions)).toBe(true)
    const policies=await db.query<{enabled:boolean}>(`select relrowsecurity as enabled from pg_class where relname in ('whatsapp_links','whatsapp_outbox','whatsapp_receipts')`)
    expect(policies.rows).toHaveLength(3);expect(policies.rows.every(x=>x.enabled)).toBe(true)
  })
  it('links a fresh code once, commits a reply and deduplicates webhook retries',async()=>{
    await db.exec(`insert into public.whatsapp_links(user_id,code_hash,code_expires_at) values('${a}','${hash}',now()+interval '10 minutes');`)
    const args=[hash,'6281111111111','link',hash]
    expect((await db.query<{result:string}>('select public.wa_receive($1,$2,$3,$4) result',args)).rows[0].result).toBe('queued')
    expect((await db.query<{result:string}>('select public.wa_receive($1,$2,$3,$4) result',args)).rows[0].result).toBe('duplicate')
    const links=await db.query<{phone:string;code_hash:string|null;notifications_enabled:boolean}>('select phone,code_hash,notifications_enabled from public.whatsapp_links')
    expect(links.rows[0]).toEqual({phone:'6281111111111',code_hash:null,notifications_enabled:true})
    expect((await db.query('select * from public.whatsapp_outbox')).rows).toHaveLength(1)
  })
  it('does not link expired codes or inactive users',async()=>{
    await db.exec(`insert into public.whatsapp_links(user_id,code_hash,code_expires_at) values('${a}','${hash}',now()-interval '1 second');`)
    expect((await db.query<{id:string|null}>('select public.wa_link_phone($1,$2) id',[hash,'6281111111111'])).rows[0].id).toBeNull()
    await db.exec(`update public.whatsapp_links set code_expires_at=now()+interval '10 minutes';update public.users set status='nonaktif' where id='${a}';`)
    expect((await db.query<{id:string|null}>('select public.wa_link_phone($1,$2) id',[hash,'6281111111111'])).rows[0].id).toBeNull()
  })
  it('queues review alerts only for the assigned reviewer and only once',async()=>{
    await db.exec(`insert into public.whatsapp_links(user_id,phone,linked_at,notifications_enabled) values
      ('${a}','6281111111111',now()-interval '1 minute',true),('${b}','6282222222222',now()-interval '1 minute',true);
      insert into public.notifications(user_id,task_id,type,title) values('${a}','${task}','task_review_requested','Review'),('${b}','${task}','task_review_requested','Review');
      select public.wa_enqueue_notifications();select public.wa_enqueue_notifications();`)
    const rows=await db.query<{user_id:string}>('select user_id from public.whatsapp_outbox')
    expect(rows.rows).toEqual([{user_id:a}])
    await db.exec(`update public.tasks set reviewer_id='${b}' where id='${task}';`)
    expect((await db.query('select * from public.wa_claim_outbox()')).rows).toHaveLength(0)
  })
  it('STOP cancels pending private notifications and permits a public acknowledgment',async()=>{
    await db.exec(`insert into public.whatsapp_links(user_id,phone,linked_at,notifications_enabled) values('${a}','6281111111111',now()-interval '1 minute',true);
      insert into public.notifications(user_id,type,title) values('${a}','reminder','Reminder');select public.wa_enqueue_notifications();`)
    await db.query('select public.wa_receive($1,$2,$3,$4)',[hash,'6281111111111','stop',null])
    const states=await db.query<{state:string}>('select state from public.whatsapp_outbox where notification_id is not null')
    expect(states.rows[0].state).toBe('cancelled')
    const next=await db.query<{user_id:string|null}>('select * from public.wa_claim_outbox()')
    expect(next.rows).toHaveLength(1);expect(next.rows[0].user_id).toBeNull()
  })
  it('never reclaims sends whose result might be unknown',async()=>{
    await db.query('select public.wa_receive($1,$2,$3,$4)',[hash,'6281111111111','help',null])
    expect((await db.query('select * from public.wa_claim_outbox()')).rows).toHaveLength(1)
    expect((await db.query('select * from public.wa_claim_outbox()')).rows).toHaveLength(0)
  })
})
