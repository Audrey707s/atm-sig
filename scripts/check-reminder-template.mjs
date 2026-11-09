import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const source = file => readFileSync(new URL('../supabase/migrations/' + file, import.meta.url),'utf8')
function extract(sql,name) {
  const start=sql.indexOf('CREATE OR REPLACE FUNCTION public.'+name+'(')
  assert.ok(start>=0,'missing function '+name)
  const end=sql.indexOf('$$;',start)
  assert.ok(end>start,'missing function delimiter '+name)
  return sql.slice(start,end+3)
}
const run=async sql=>(await db.query(sql)).rows
try {
  await db.exec([
    'CREATE ROLE service_role;',
    "CREATE TYPE public.user_status AS ENUM ('aktif','nonaktif');",
    "CREATE TYPE public.task_status AS ENUM ('To do','In progress','Blocked','Review','Revisi','Done');",
    "CREATE TYPE public.task_priority AS ENUM ('rendah','sedang','tinggi');",
    'CREATE TABLE public.roles(id int PRIMARY KEY,level int NOT NULL);',
    'CREATE TABLE public.org_units(id int PRIMARY KEY,parent_id int);',
    "CREATE TABLE public.users(id uuid PRIMARY KEY,role_id int,status public.user_status DEFAULT 'aktif',org_unit_id int,supervisor_id uuid,name text,email text);",
    'CREATE TABLE public.task_categories(id uuid PRIMARY KEY,is_active bool NOT NULL,org_unit_id int);',
    "CREATE TABLE public.tasks(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_id uuid,assigner_id uuid,reviewer_id uuid,org_unit_id int,category_id uuid,title text,priority public.task_priority DEFAULT 'sedang',status public.task_status DEFAULT 'To do',progress_pct int DEFAULT 0,start_date timestamptz,due_date timestamptz);",
    'CREATE TABLE public.wbs_items(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),task_id uuid,parent_id uuid,weight numeric,is_done boolean);',
    'CREATE TABLE public.task_reminders(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),task_id uuid,checkpoint_pct int,due_date_version timestamptz,sent_at timestamptz,response text,UNIQUE(task_id,checkpoint_pct,due_date_version));',
    'CREATE TABLE public.notifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,task_id uuid,reminder_id uuid,type text,title text,body text,sent_at timestamptz);',
    'CREATE TABLE public.audit_logs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,action text,object text,old_value text,new_value text);',
    'CREATE TABLE public.task_templates(id uuid PRIMARY KEY,org_unit_id int,category_id uuid,name text,title text,priority public.task_priority,owner_id uuid,reviewer_id uuid,recurrence text,recurrence_day smallint,start_offset_days smallint,due_offset_days smallint,is_active boolean,next_run_at timestamptz,created_by uuid);',
    'CREATE TABLE public.task_template_runs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),template_id uuid,scheduled_for timestamptz,task_id uuid UNIQUE,outcome text,UNIQUE(template_id,scheduled_for));',
    'INSERT INTO public.roles VALUES(2,2),(3,3);',
    'INSERT INTO public.org_units VALUES(4,null);',
    "INSERT INTO public.users(id,role_id,org_unit_id,supervisor_id,status,name,email) VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',2,4,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','aktif','PIC test','pic@example.test'),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',3,4,null,'aktif','Manager test','manager@example.test');",
    "INSERT INTO public.task_categories VALUES('cccccccc-cccc-4ccc-8ccc-cccccccccccc',true,4);",
    "INSERT INTO public.task_templates VALUES('dddddddd-dddd-4ddd-8ddd-dddddddddddd',4,'cccccccc-cccc-4ccc-8ccc-cccccccccccc','Weekly','Reconciliation','sedang','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','weekly',4,0,2,true,'2026-10-22T01:00:00Z','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');",
    "INSERT INTO public.tasks(id,owner_id,assigner_id,reviewer_id,org_unit_id,title,progress_pct,start_date,due_date) VALUES('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',4,'Reminder test',10,'2026-10-20T00:00:00Z','2026-10-24T00:00:00Z');"
  ].join('\n'))
  const templates=source('033_task_categories_templates.sql')
  const missed=source('034_task_category_scope_and_missed_runs.sql')
  const reminder=source('20261022017000_short_task_wbs_reminder_zero_progress.sql')
  await db.exec(extract(templates,'next_task_template_run'))
  await db.exec(extract(templates,'process_task_template_runs').replace('FUNCTION public.process_task_template_runs(','FUNCTION public.process_task_template_runs_worker('))
  await db.exec(extract(missed,'process_task_template_runs'))
  await db.exec(extract(reminder,'process_task_reminder_checkpoints'))
  const weekly=async time=>(await run("SELECT * FROM public.process_task_template_runs('"+time+"'::timestamptz)"))[0]
  assert.equal((await weekly('2026-10-22T01:01:00Z')).created_count,1)
  assert.equal((await weekly('2026-10-22T01:02:00Z')).created_count,0)
  assert.equal((await run("select count(*)::int n from public.task_template_runs where outcome='created'"))[0].n,1)
  assert.equal((await run("select count(*)::int n from public.tasks where category_id is not null"))[0].n,1)
  const next=(await run("select to_char(next_run_at at time zone 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS') as next from public.task_templates"))[0].next
  assert.equal(next, '2026-10-29 08:00:00')
  const check=async time=>(await run("SELECT task_id,checkpoint_pct FROM public.process_task_reminder_checkpoints('"+time+"'::timestamptz) ORDER BY checkpoint_pct")).filter(x=>x.task_id==='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee').map(x=>x.checkpoint_pct)
  assert.deepEqual(await check('2026-10-21T23:00:00Z'),[])
  assert.deepEqual(await check('2026-10-22T00:00:00Z'),[50])
  assert.deepEqual(await check('2026-10-22T00:00:00Z'),[])
  assert.deepEqual(await check('2026-10-23T04:48:00Z'),[80])
  assert.deepEqual(await check('2026-10-23T14:24:00Z'),[90])
  assert.deepEqual(await check('2026-10-23T14:25:00Z'),[])
  assert.deepEqual((await run("select type from public.notifications where task_id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' order by type")).map(x=>x.type),['reminder_50','reminder_80','reminder_90'])
  // Tasks shorter than 24 hours rely on leaf WBS completion, not progress_pct.
  const shortId='ffffffff-ffff-4fff-8fff-ffffffffffff'
  const noWbsId='98765432-9876-4876-8876-987654321098'
  for(const shortTaskId of [shortId,noWbsId]) {
    await db.exec("INSERT INTO public.tasks(id,owner_id,assigner_id,reviewer_id,org_unit_id,title,progress_pct,start_date,due_date) VALUES('"+
      shortTaskId+"','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',4,'Short WBS reminder test',0,'2026-10-25T00:00:00Z','2026-10-25T10:00:00Z')")
  }
  await db.exec("INSERT INTO public.wbs_items(id,task_id,parent_id,weight,is_done) VALUES(gen_random_uuid(),'"+shortId+"',NULL,100,false)")
  const shortCheck=async time=>(await run("SELECT task_id,checkpoint_pct FROM public.process_task_reminder_checkpoints('"+time+"'::timestamptz)")).filter(x=>x.task_id===shortId).map(x=>x.checkpoint_pct).sort((a,b)=>a-b)
  assert.deepEqual(await shortCheck('2026-10-25T05:00:00Z'),[50],'short task with leaf WBS gets 50%')
  assert.deepEqual(await shortCheck('2026-10-25T08:00:00Z'),[80],'short task gets 80%')
  assert.deepEqual(await shortCheck('2026-10-25T09:00:00Z'),[90],'short task gets 90%')
  assert.equal((await run("SELECT count(*)::int n FROM public.task_reminders WHERE task_id='"+noWbsId+"'"))[0].n,0,'short task without WBS should not generate checkpoint')
  console.log('PASS actual SQL: 50/80/90 reminders (regular and short WBS), idempotency, weekly task and next WIB run')
} finally { await db.close() }
