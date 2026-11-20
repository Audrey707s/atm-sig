import {it,expect} from 'vitest'
import {PGlite} from '@electric-sql/pglite'
import {readFileSync} from 'node:fs'
it('preserves independent old/recheck progress and rejects a duplicate active revision',async()=>{
 const db=new PGlite()
 try{
 await db.exec("create table atm_eval_runs(id text primary key,user_id text,revision text,status text);create unique index atm_eval_one_active on atm_eval_runs(user_id) where status in ('queued','running','waiting');insert into atm_eval_runs values('old','Audrey','original','waiting');")
 await db.exec(readFileSync('supabase/migrations/20261120112114_separate_agent_recheck_runs.sql','utf8'))
 await db.exec("insert into atm_eval_runs values('recheck','Audrey','latest','queued')")
 expect((await db.query('select id,status from atm_eval_runs order by id')).rows).toEqual([{id:'old',status:'waiting'},{id:'recheck',status:'queued'}])
 await expect(db.exec("insert into atm_eval_runs values('duplicate','Audrey','latest','queued')")).rejects.toThrow()
 }finally{await db.close()}
})
