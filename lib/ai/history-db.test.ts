import {PGlite} from '@electric-sql/pglite'
import {readFileSync} from 'node:fs'
import {afterAll,afterEach,beforeAll,beforeEach,describe,it,expect} from 'vitest'
let db:PGlite
const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222',inactive='33333333-3333-4333-8333-333333333333'
async function asUser(id:string){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,true)",[id]);await db.exec('set local role authenticated')}
describe('personal ATM Agent history RLS',()=>{
 beforeAll(async()=>{
  db=new PGlite();await db.exec("create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;")
  for(const file of ['001_init_schema.sql','002_rls_policies.sql','20261113170042_ai_chat_history.sql'])await db.exec(readFileSync('supabase/migrations/'+file,'utf8'))
  await db.exec('grant usage on schema public,auth to authenticated,anon;grant select on public.users,public.roles,public.org_units to authenticated')
 })
 beforeEach(async()=>{await db.exec(`begin;insert into public.users(id,name,email,role_id,org_unit_id,status) values('${a}','User A','a@test.invalid',2,4,'aktif'),('${b}','SA B','b@test.invalid',6,1,'aktif'),('${inactive}','Inactive','c@test.invalid',2,4,'nonaktif');`)})
 afterEach(async()=>{await db.exec('rollback')});afterAll(async()=>db?.close())
 it('lets an active user save and read their own transcript',async()=>{
  await asUser(a)
  const id=(await db.query<{id:string}>('insert into public.ai_chat_threads(user_id) values($1) returning id',[a])).rows[0].id
  await db.query("insert into public.ai_chat_messages(user_id,conversation_id,author,content) values($1,$2,'user','lihat tugas saya')",[a,id])
  expect((await db.query('select content from public.ai_chat_messages')).rows).toEqual([{content:'lihat tugas saya'}])
 })
 it('keeps another user and even Super Admin out of personal history',async()=>{
  await asUser(a);const id=(await db.query<{id:string}>('insert into public.ai_chat_threads(user_id) values($1) returning id',[a])).rows[0].id
  await db.query("insert into public.ai_chat_messages(user_id,conversation_id,author,content) values($1,$2,'assistant','Privat')",[a,id])
  await asUser(b);expect((await db.query('select * from public.ai_chat_threads')).rows).toHaveLength(0);expect((await db.query('select * from public.ai_chat_messages')).rows).toHaveLength(0)
  expect((await db.query("update public.ai_chat_threads set title='x' where id=$1 returning id",[id])).rows).toHaveLength(0)
 })
 it('rejects spoofed ownership and cross-owner thread references',async()=>{
  await asUser(a);const id=(await db.query<{id:string}>('insert into public.ai_chat_threads(user_id) values($1) returning id',[a])).rows[0].id
  await asUser(b)
  await db.exec('savepoint spoof');await expect(db.query('insert into public.ai_chat_threads(user_id) values($1)',[a])).rejects.toThrow();await db.exec('rollback to spoof')
  await db.exec('savepoint cross_thread');await expect(db.query("insert into public.ai_chat_messages(user_id,conversation_id,author,content) values($1,$2,'user','No')",[b,id])).rejects.toThrow();await db.exec('rollback to cross_thread')
 })
 it('denies anonymous history access and update of immutable ownership fields',async()=>{
  expect((await db.query<{allowed:boolean}>("select has_table_privilege('anon','public.ai_chat_threads','select') allowed")).rows[0].allowed).toBe(false)
  expect((await db.query<{allowed:boolean}>("select has_column_privilege('authenticated','public.ai_chat_threads','user_id','update') allowed")).rows[0].allowed).toBe(false)
  expect((await db.query<{allowed:boolean}>("select has_table_privilege('authenticated','public.ai_chat_messages','update') allowed")).rows[0].allowed).toBe(false)
 })
 it('denies inactive users and prevents restoring pending-action secrets',async()=>{
  await asUser(inactive);await expect(db.query('insert into public.ai_chat_threads(user_id) values($1)',[inactive])).rejects.toThrow()
 })
})
