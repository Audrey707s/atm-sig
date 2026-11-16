import {PGlite} from '@electric-sql/pglite'
import {readFileSync} from 'node:fs'
import {beforeAll,beforeEach,afterEach,afterAll,describe,it,expect} from 'vitest'
let db:PGlite
const id='11111111-1111-4111-8111-111111111111'
describe('confirmed auth email synchronization',()=>{
  beforeAll(async()=>{
    db=new PGlite()
    await db.exec('create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key,email text,email_change text,email_confirmed_at timestamptz);')
    await db.exec(readFileSync('supabase/migrations/001_init_schema.sql','utf8'))
    await db.exec(readFileSync('supabase/migrations/20261116055024_sync_confirmed_account_email.sql','utf8'))
  })
  beforeEach(async()=>{await db.exec(`begin;insert into auth.users values('${id}','old@example.com',null,now());insert into public.users(id,name,email,role_id,org_unit_id) values('${id}','User','old@example.com',2,4);`)})
  afterEach(async()=>{await db.exec('rollback')});afterAll(async()=>{await db.close()})
  it('does not publish pending or unconfirmed addresses',async()=>{
    await db.exec(`update auth.users set email_change='pending@example.com' where id='${id}'`)
    expect((await db.query('select email from public.users')).rows).toEqual([{email:'old@example.com'}])
    await db.exec(`update auth.users set email='unconfirmed@example.com',email_confirmed_at=null where id='${id}'`)
    expect((await db.query('select email from public.users')).rows).toEqual([{email:'old@example.com'}])
  })
  it('updates only the verified address, preserving role and identity and writing an audit record',async()=>{
    await db.exec(`update auth.users set email='new@example.com',email_change=null where id='${id}'`)
    expect((await db.query('select id,email,role_id,org_unit_id from public.users')).rows).toEqual([{id,email:'new@example.com',role_id:2,org_unit_id:4}])
    expect((await db.query("select old_value,new_value from public.audit_logs where action='update_verified_email'")).rows).toEqual([{old_value:'old@example.com',new_value:'new@example.com'}])
  })
  it('does not expose the privileged trigger function to public clients',async()=>{
    expect((await db.query("select has_function_privilege('authenticated','private.sync_confirmed_account_email()','execute') allowed")).rows).toEqual([{allowed:false}])
    expect((await db.query("select has_schema_privilege('anon','private','usage') allowed")).rows).toEqual([{allowed:false}])
  })
})
