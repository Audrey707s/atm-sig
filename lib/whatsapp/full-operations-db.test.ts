import {validatePlan} from '@/lib/ai/contracts'
import {conversationPlan,type GuidedDraft} from '@/lib/ai/conversation'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { afterAll,afterEach,beforeAll,beforeEach,describe,expect,it } from 'vitest'
const pic='11111111-1111-4111-8111-111111111111',manager='22222222-2222-4222-8222-222222222222',sm='33333333-3333-4333-8333-333333333333',gm='44444444-4444-4444-8444-444444444444',sa='55555555-5555-4555-8555-555555555555',spectator='66666666-6666-4666-8666-666666666666'
let db:PGlite,task:string,chatChannel='web',chatReceipt=0
const chatPhones:Record<string,string>={[pic]:'6281111111111',[manager]:'6281111111112',[sm]:'6281111111113',[gm]:'6281111111114',[sa]:'6281111111115'}
async function apply(actor:string,op:string,target:string|null,data:Record<string,string>={},preview=false,version:string|null=null){
 return (await db.query<{r:{ok:boolean;error?:string;id?:string;taskId?:string;path?:string;version?:string}}>('select public.wa_apply_operation($1,$2,$3,$4::jsonb,$5,$6) r',[actor,op,target,JSON.stringify(data),preview,version])).rows[0].r
}
describe('WhatsApp operations with existing ATM RLS and transactional rules',()=>{
 beforeAll(async()=>{
  db=new PGlite()
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create role authenticator noinherit;grant authenticated,service_role to authenticator;
   create schema auth;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   create function auth.role() returns text language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','service_role')$$;`)
  const files=['001_init_schema.sql','002_rls_policies.sql','004_spectator_read_only.sql','005_wbs_items.sql','006_rls_write_policies.sql','009_organization_scope_rls.sql','011_spectator_scope_tree.sql','012_scoped_task_delete.sql','013_task_support_transitions.sql','015_validate_task_evidence_locations.sql','016_task_progress_history.sql','017_task_status_transitions.sql','018_task_status_gates.sql','019_scoped_task_reassignment.sql','020_notify_new_task_owner.sql','021_task_reviewer_chain.sql','023_validate_pic_deadline_requests.sql','024_atomic_deadline_decisions.sql','025_audit_direct_deadline_updates.sql','026_privileged_owner_self_review.sql','027_task_reminder_scheduler.sql','028_reminder_recipient_guard.sql','029_pic_reminder_responses.sql','030_reminder_supervisor_notifications.sql','031_reminder_email_delivery.sql','032_notification_reminder_reference.sql','033_task_categories_templates.sql','034_task_category_scope_and_missed_runs.sql','035_scoped_manager_kanban_transitions.sql','036_guard_pic_timeline_dates.sql','20261022013000_pic_self_create_rls.sql','20261022015000_atomic_task_audit.sql','20261024202000_r03_task_bundle_and_org_guard.sql','20261024204000_r03_atomic_wbs_progress.sql','20261031000500_gm_review_override.sql','20261029032714_remove_legacy_wbs_hierarchy_trigger.sql','20261031162038_expand_categories_recurring_roles.sql','20261104031955_self_service_profile.sql','20261103113000_notify_only_assigned_reviewer_for_task_events.sql','20261112161939_whatsapp_channel.sql','20261112174755_whatsapp_task_commands.sql','20261112181649_whatsapp_guided_menu.sql','20261113101843_whatsapp_full_operations.sql','20261113160217_atm_ai_assistant.sql','20261113160704_ai_personal_calendar_scope.sql','20261116102741_whatsapp_create_guidance.sql','20261116104627_ai_natural_task_actions.sql','20261116105757_ai_conversation_grounding.sql','20261116113832_ai_role_task_lookup.sql','20261116114447_ai_pic_pagination_hint.sql','20261116121257_ai_task_context_and_delete_cleanup.sql','20261116155418_ai_guided_conversation.sql','20261116164754_ai_local_language.sql','20261116172347_ai_status_feedback.sql','20261117044504_ai_field_conversations.sql','20261113170042_ai_chat_history.sql','20261118173956_conversational_agent_v2.sql','20261118182215_agent_multi_read_selection.sql','20261119102602_persistent_agent_evaluation.sql','20261119104401_agent_evaluation_preview_access.sql']
  for(const file of files){let sql=readFileSync('supabase/migrations/'+file,'utf8');if(file.includes('full_operations')&&!sql.trim().endsWith('commit;'))sql+='\ncommit;';try{await db.exec(sql)}catch(e){throw new Error('Migration '+file+': '+String(e))}}
  await db.exec(`select setval(pg_get_serial_sequence('public.org_units','id'),(select max(id) from public.org_units));grant usage on schema public,auth to anon,authenticated,service_role,authenticator;grant select,insert,update,delete on all tables in schema public to authenticated;grant usage,select on all sequences in schema public to authenticated;grant all on all tables in schema public to service_role;revoke update on public.task_categories from authenticated;grant update(org_unit_id,name,is_active) on public.task_categories to authenticated;revoke all on public.whatsapp_action_sessions,public.whatsapp_links,public.whatsapp_receipts,public.whatsapp_outbox,public.atm_ai_sessions,public.atm_ai_limits,public.atm_ai_task_context,public.atm_agent_sessions,public.atm_agent_requests,public.atm_agent_traces,public.atm_eval_runs,public.atm_eval_cases,public.atm_eval_worker_config from anon,authenticated;revoke all on public.atm_eval_worker_config from service_role;grant select(last_seen),update(last_seen) on public.atm_eval_worker_config to service_role;`)
 })
 afterAll(async()=>db?.close())
 beforeEach(async()=>{
  chatChannel='web';chatReceipt=0
  await db.exec(`begin;insert into public.users(id,name,email,role_id,org_unit_id,supervisor_id) values
   ('${sa}','SA','sa@example.test',6,1,null),('${gm}','GM','gm@example.test',5,1,'${sa}'),('${sm}','SM','sm@example.test',4,2,'${gm}'),('${manager}','Manager','manager@example.test',3,4,'${sm}'),('${pic}','PIC','pic@example.test',2,4,'${manager}'),('${spectator}','Spectator','spectator@example.test',1,4,null);`)
  task=(await db.query<{id:string}>(`insert into public.tasks(owner_id,assigner_id,reviewer_id,org_unit_id,title,start_date,due_date) values('${pic}','${manager}','${manager}',4,'Task asal',now(),now()+interval '10 days') returning id`)).rows[0].id
 })
 afterEach(async()=>{await db.exec('rollback;reset session authorization;reset role')})
 it('compiles the complete action catalogue',async()=>{expect((await db.query<{c:Record<string,unknown>}>('select public.wa_operation_catalog() c')).rows[0].c.task_create).toBeTruthy()})
 it('creates an own task through the real task-bundle/RLS rules',async()=>{
  const r=await apply(pic,'task_create',null,{judul:'Baru',mulai:'2027-01-01 08:00',tenggat:'2027-01-02 16:00'})
  expect(r.ok,r.error).toBe(true);expect(r.path).toBe('/tasks/'+r.id)
 })
 it('validates without persisting a task, then executes only a confirmed operation',async()=>{
  const data={judul:'Pratinjau',mulai:'2027-01-01 08:00',tenggat:'2027-01-02 16:00'}
  expect((await apply(pic,'task_create',null,data,true)).ok).toBe(true)
  expect((await db.query("select id from public.tasks where title='Pratinjau'")).rows).toHaveLength(0)
  expect((await apply(pic,'task_create',null,data)).ok).toBe(true)
  expect((await db.query("select id from public.tasks where title='Pratinjau'")).rows).toHaveLength(1)
 })
 it('denies Spectator mutation and PIC manager-only edits/deletes',async()=>{
  expect((await apply(spectator,'task_comment',task,{komentar:'x'})).ok).toBe(false)
  expect((await apply(pic,'task_update',task,{judul:'tidak boleh'})).ok).toBe(false)
  expect((await apply(pic,'task_delete',task)).ok).toBe(false)
 })
 it('allows manager edits and rejects a stale confirmation',async()=>{
  const preview=await apply(manager,'task_update',task,{judul:'Judul baru'},true)
  expect(preview.ok,preview.error).toBe(true)
  await db.query('update public.tasks set title=$1 where id=$2',['Diubah dari web',task])
  expect((await apply(manager,'task_update',task,{judul:'Judul baru'},false,preview.version)).ok).toBe(false)
 })
 async function receive(text:string,command='feature',args:Record<string,string|number>={feature:text}) {
  const id=crypto.randomUUID().replaceAll('-','').repeat(2)
  await db.query('select public.wa_receive_full($1,$2,$3,null,$4::jsonb,$5)',[id,'6281111111111',command,JSON.stringify(args),text])
  return (await db.query<{body:string}>('select body from public.whatsapp_outbox where receipt_id=$1',[id])).rows[0]?.body
 }
 it('runs the complete create wizard with a single-use confirmation and result link',async()=>{
  await db.exec(`insert into public.whatsapp_links(user_id,phone,linked_at,notifications_enabled) values('${pic}','6281111111111',now(),true)`)
  expect(await receive('BUAT')).toContain('Kirim field')
  expect(await receive('judul: Chat CRUD\nmulai: 2027-01-01 08:00\ntenggat: 2027-01-02 16:00','help',{})).toContain('Pratinjau')
  expect((await db.query("select id from public.tasks where title='Chat CRUD'")).rows).toHaveLength(0)
  const st=(await db.query<{state:{token:string}}>('select state from public.whatsapp_action_sessions')).rows[0].state
  const result=await receive('YA '+st.token,'help',{})
  expect(result).toContain('berhasil');expect(result).toContain('https://atm-sig.vercel.app/tasks/')
  expect((await db.query("select id from public.tasks where title='Chat CRUD'")).rows).toHaveLength(1)
  await receive('YA '+st.token,'help',{})
  expect((await db.query("select id from public.tasks where title='Chat CRUD'")).rows).toHaveLength(1)
 })
 it('collects a title and dates one message at a time without losing the draft',async()=>{
  await db.exec(`insert into public.whatsapp_links(user_id,phone,linked_at,notifications_enabled) values('${pic}','6281111111111',now(),true)`)
  expect(await receive('BUAT')).toContain('Apa judul')
  expect(await receive('Bertahap','help',{})).toContain('Kapan mulai')
  expect(await receive('bukan tanggal','help',{})).toContain('Kapan mulai')
  expect(await receive('2027-01-01 08:00 WIB','help',{})).toContain('Kapan tenggat')
  expect(await receive('2026-12-31 08:00','help',{})).toContain('Tenggat harus setelah')
  expect(await receive('2027-01-02 16:00','help',{})).toContain('Pratinjau')
  expect((await db.query("select id from public.tasks where title='Bertahap'")).rows).toHaveLength(0)
  expect(await receive('1','choice',{choice:1})).toContain('berhasil')
  expect((await db.query("select id from public.tasks where title='Bertahap'")).rows).toHaveLength(1)
 })
 it('asks a department-level account to choose a section and accepts the section name',async()=>{
  await db.exec(`insert into public.whatsapp_links(user_id,phone,linked_at,notifications_enabled) values('${sa}','6281111111111',now(),true)`)
  await receive('BUAT')
  expect(await receive('judul: Department task\nmulai: 2027-01-01 08:00\ntenggat: 2027-01-02 16:00','help',{})).toContain('Pilih seksi')
  expect(await receive('Section AP/AR','help',{})).toContain('Pratinjau')
  expect(await receive('YA','approve',{})).toContain('berhasil')
  const rows=(await db.query<{owner_id:string;org_unit_id:number}>("select owner_id,org_unit_id from public.tasks where title='Department task'")).rows
  expect(rows).toEqual([{owner_id:sa,org_unit_id:8}])
 })
 it('retains partial key-value fields and rejects out-of-scope section choices',async()=>{
  await db.exec(`insert into public.whatsapp_links(user_id,phone,linked_at,notifications_enabled) values('${manager}','6281111111111',now(),true)`)
  await receive('BUAT')
  expect(await receive('judul: Sebagian','help',{})).toContain('Kapan mulai')
  expect(await receive('mulai: 2027-01-01 08:00','help',{})).toContain('Kapan tenggat')
  const result=await receive('tenggat: 2027-01-02 16:00\nseksi: Section General Accounting','help',{})
  expect(result).toContain('❌')
  expect((await db.query("select id from public.tasks where title='Sebagian'")).rows).toHaveLength(0)
  expect(await receive('seksi: Section Cost Accounting','help',{})).toContain('Pratinjau')
 })
 it('lists masters, selects by number, and starts an authorized edit form',async()=>{
  await db.exec(`insert into public.whatsapp_links(user_id,phone,linked_at,notifications_enabled) values('${sa}','6281111111111',now(),true)`)
  expect(await receive('ORGANISASI')).toContain('Halaman 1')
  expect(await receive('1','choice',{choice:1})).toContain('1 Ubah')
  expect(await receive('1','choice',{choice:1})).toContain('Kirim field')
 })
 it('gives direct checking links for existing queries and extended feature discovery',async()=>{
  await db.exec(`insert into public.whatsapp_links(user_id,phone,linked_at,notifications_enabled) values('${pic}','6281111111111',now(),true)`)
  expect(await receive('MENU','help',{})).toContain('FITUR')
  expect(await receive('TUGAS','tasks',{page:1})).toContain('https://atm-sig.vercel.app/tasks')
  expect(await receive('1','choice',{choice:1})).toContain('UBAH')
 })

 it('duplicates and deletes tasks without bypassing manager-only deletion',async()=>{
  const dup=await apply(pic,'task_duplicate',task,{judul:'Salinan',mulai:'2027-01-01 08:00',tenggat:'2027-01-02 16:00'})
  expect(dup.ok,dup.error).toBe(true)
  expect((await apply(manager,'task_delete',dup.id!)).ok).toBe(true)
  expect((await db.query('select id from public.tasks where id=$1',[dup.id])).rows).toHaveLength(0)
 })
 it('enforces evidence and the assigned-reviewer decision flow',async()=>{
  const requirement=(await db.query<{id:string}>('insert into public.evidence_requirements(task_id,description,mandatory) values($1,$2,true) returning id',[task,'Bukti wajib'])).rows[0].id
  expect((await apply(pic,'task_status',task,{status:'In progress'})).ok).toBe(true)
  expect((await apply(pic,'task_status',task,{status:'Review'})).ok).toBe(false)
  const evidence=await apply(pic,'evidence_link',requirement,{tautan:'https://example.test/evidence.pdf'})
  expect(evidence.ok,evidence.error).toBe(true)
  expect((await apply(pic,'task_status',task,{status:'Review'})).ok).toBe(true)
  expect((await apply(pic,'task_review',task,{keputusan:'setuju'})).ok).toBe(false)
  const reviewed=await apply(manager,'task_review',task,{keputusan:'setuju'})
  expect(reviewed.ok,reviewed.error).toBe(true)
  expect((await db.query<{status:string}>('select status from public.tasks where id=$1',[task])).rows[0].status).toBe('Done')
 })
 it('requires a review rejection comment and supports revisi',async()=>{
  await apply(pic,'task_status',task,{status:'In progress'});await apply(pic,'task_status',task,{status:'Review'})
  expect((await apply(manager,'task_review',task,{keputusan:'revisi'})).ok).toBe(false)
  expect((await apply(manager,'task_review',task,{keputusan:'revisi',komentar:'Lengkapi data'})).ok).toBe(true)
 })
 it('updates WBS with the existing atomic recalculation rule and denies a different owner',async()=>{
  const added=await apply(pic,'wbs_add',task,{judul:'Bagian pertama',bobot:'100'})
  expect(added.ok,added.error).toBe(true)
  expect((await apply(manager,'wbs_toggle',added.id!,{selesai:'ya'})).ok).toBe(false)
  const toggled=await apply(pic,'wbs_toggle',added.id!,{selesai:'ya'})
  expect(toggled.ok,toggled.error).toBe(true)
  expect((await db.query<{progress_pct:number}>('select progress_pct from public.tasks where id=$1',[task])).rows[0].progress_pct).toBe(100)
 })
 it('handles support request/provision and keeps the recipient guard',async()=>{
  const support=await apply(pic,'support_add',task,{penerima:'manager@example.test',deskripsi:'Bantu dokumen'})
  expect(support.ok,support.error).toBe(true)
  expect((await apply(pic,'support_finish',support.id!)).ok).toBe(false)
  expect((await apply(manager,'support_finish',support.id!)).ok).toBe(true)
  expect((await apply(manager,'support_finish',support.id!)).ok).toBe(false)
 })
 it('submits PIC deadline requests and lets an authorized SM decide',async()=>{
  const request=await apply(pic,'task_deadline',task,{tenggat:'2027-01-03 16:00',alasan:'Butuh data pendukung'})
  expect(request.ok,request.error).toBe(true)
  expect((await apply(manager,'deadline_decide',request.id!,{keputusan:'setuju'})).ok).toBe(false)
  const decision=await apply(sm,'deadline_decide',request.id!,{keputusan:'setuju'})
  expect(decision.ok,decision.error).toBe(true)
 })
 it('supports scoped category CRUD and rejects a category outside manager scope',async()=>{
  expect((await apply(manager,'category_create',null,{nama:'Luar scope',seksi:'5'})).ok).toBe(false)
  const cat=await apply(manager,'category_create',null,{nama:'Kategori chat',seksi:'4'})
  expect(cat.ok,cat.error).toBe(true)
  expect((await apply(manager,'category_update',cat.id!,{nama:'Nama kategori baru',aktif:'tidak'})).ok).toBe(true)
  expect((await apply(pic,'category_delete',cat.id!)).ok).toBe(false)
  expect((await apply(manager,'category_delete',cat.id!)).ok).toBe(true)
 })
 it('creates, edits, disables and deletes a personal recurring template',async()=>{
  await apply(manager,'category_create',null,{nama:'Bulanan',seksi:'4'})
  const t=await apply(pic,'template_create',null,{nama:'Jadwal saya',judul:'Pekerjaan bulanan',kategori:'Bulanan',seksi:'4',frekuensi:'monthly',hari:'2',mulai:'0',tenggat:'3'})
  expect(t.ok,t.error).toBe(true)
  expect((await apply(pic,'template_update',t.id!,{judul:'Diperbarui'})).ok).toBe(true)
  expect((await apply(pic,'template_toggle',t.id!,{aktif:'tidak'})).ok).toBe(true)
  expect((await apply(pic,'template_delete',t.id!)).ok).toBe(true)
 })
 it('allows organization CRUD only for Super Admin',async()=>{
  expect((await apply(manager,'org_create',null,{nama:'Unit chat',tipe:'unit',induk:'1'})).ok).toBe(false)
  const org=await apply(sa,'org_create',null,{nama:'Unit chat',tipe:'unit',induk:'1'})
  expect(org.ok,org.error).toBe(true)
  expect((await apply(sa,'org_update',org.id!,{nama:'Unit diperbarui'})).ok).toBe(true)
  expect((await apply(sa,'org_delete',org.id!)).ok).toBe(true)
 })
 it('marks only own notifications and preserves other recipients',async()=>{
  const id=(await db.query<{id:string}>(`insert into public.notifications(user_id,type,title,body) values('${spectator}','test','Pesan','Isi') returning id`)).rows[0].id
  expect((await apply(pic,'notification_read',id)).ok).toBe(false)
  expect((await apply(spectator,'notification_read',id)).ok).toBe(false)
  const own=(await db.query<{id:string}>(`insert into public.notifications(user_id,type,title,body) values('${pic}','test','Pesan PIC','Isi') returning id`)).rows[0].id
  expect((await apply(pic,'notification_read',own)).ok).toBe(true)
  expect((await apply(pic,'notification_all',null)).ok).toBe(true)
 })
 it('records a valid owner reminder response exactly once',async()=>{
  const id=(await db.query<{id:string}>(`insert into public.task_reminders(task_id,checkpoint_pct,due_date_version) select id,50,due_date from public.tasks where id=$1 returning id`,[task])).rows[0].id
  expect((await apply(manager,'reminder_response',id,{tanggapan:'progres'})).ok).toBe(false)
  expect((await apply(pic,'reminder_response',id,{tanggapan:'progres'})).ok).toBe(true)
  expect((await apply(pic,'reminder_response',id,{tanggapan:'support'})).ok).toBe(false)
 })
 it('updates only the own profile name without exposing account security',async()=>{
  const r=await apply(pic,'profile_name',null,{nama:'Nama Baru'})
  expect(r.ok,r.error).toBe(true)
  expect((await apply(pic,'profile_name',null,{nama:'x',role_id:'6'})).ok).toBe(false)
  expect((await db.query<{name:string;role_id:number}>('select name,role_id from public.users where id=$1',[pic])).rows[0]).toEqual({name:'Nama Baru',role_id:2})
 })
 it('rolls back a failed audit together with the requested mutation',async()=>{
  await db.exec(`create function public.reject_channel_audit() returns trigger language plpgsql as $$begin if new.action like 'whatsapp_%' then raise exception 'Audit unavailable';end if;return new;end$$;create trigger channel_audit_reject before insert on public.audit_logs for each row execute function public.reject_channel_audit();`)
  await db.exec('savepoint before_failed_operation');await expect(apply(manager,'task_update',task,{judul:'Tidak boleh parsial'})).rejects.toThrow();await db.exec('rollback to savepoint before_failed_operation')
  // A failed SQL statement rolls the entire operation back, including task UPDATE.
  expect((await db.query<{title:string}>('select title from public.tasks where id=$1',[task])).rows[0].title).toBe('Task asal')
 })
 it('never exposes service-only execution or state to browser roles',async()=>{
  const r=await db.query<{allowed:boolean}>(`select has_function_privilege(role,'public.wa_apply_operation(uuid,text,text,jsonb,boolean,text)','execute') or has_function_privilege(role,'public.wa_receive_full(text,text,text,text,jsonb,text)','execute') or has_table_privilege(role,'public.whatsapp_action_sessions','select') allowed from(values('anon'),('authenticated')) x(role)`)
  expect(r.rows.every(x=>!x.allowed)).toBe(true)
 })

 it.each([[spectator,false],[pic,true],[manager,true],[sm,true],[gm,true],[sa,true]])('applies create permission and the current supervisor chain for %s',async(actor,allowed)=>{
  const r=await apply(actor as string,'task_create',null,{judul:'Role test',mulai:'2027-01-01 08:00',tenggat:'2027-01-02 16:00',seksi:'4'})
  expect(r.ok,r.error).toBe(allowed)
 })
 it('rejects cross-section manager edits and restores context after the denial',async()=>{
  const foreignManager='77777777-7777-4777-8777-777777777777'
  await db.query(`insert into public.users(id,name,email,role_id,org_unit_id,supervisor_id) values($1,'Luar','luar@example.test',3,5,$2)`,[foreignManager,sm])
  expect((await apply(foreignManager,'task_update',task,{judul:'Tidak boleh'})).ok).toBe(false)
  expect((await db.query<{title:string}>('select title from public.tasks where id=$1',[task])).rows[0].title).toBe('Task asal')
  expect((await db.query<{sub:string}>("select current_setting('request.jwt.claim.sub',true) sub")).rows[0].sub).toBe('')
 })
 it('accepts numeric confirmation and cancels a form without mutation',async()=>{
  await db.exec(`insert into public.whatsapp_links(user_id,phone,linked_at,notifications_enabled) values('${manager}','6281111111111',now(),true)`)
  await receive('TUGAS','tasks',{page:1});await receive('1','choice',{choice:1});await receive('2','choice',{choice:2})
  await receive('judul: Lewat angka','help',{})
  expect(await receive('1','choice',{choice:1})).toContain('berhasil')
  expect((await db.query<{title:string}>('select title from public.tasks where id=$1',[task])).rows[0].title).toBe('Lewat angka')
  await receive('UBAH');await receive('judul: Batal saja','help',{});await receive('2','choice',{choice:2})
  expect((await db.query<{title:string}>('select title from public.tasks where id=$1',[task])).rows[0].title).toBe('Lewat angka')
 })
 it('expires a preview and revokes action state on unlink',async()=>{
  await db.exec(`insert into public.whatsapp_links(user_id,phone,linked_at,notifications_enabled) values('${pic}','6281111111111',now(),true)`)
  await receive('BUAT');await receive('judul: Kedaluwarsa\nmulai: 2027-01-01 08:00\ntenggat: 2027-01-02 16:00','help',{})
  await db.exec(`update public.whatsapp_action_sessions set state=jsonb_set(state,'{confirmExpires}',to_jsonb((now()-interval '1 minute')::text))`)
  expect(await receive('YA','approve',{})).toContain('kedaluwarsa')
  await receive('PUTUS','disconnect',{})
  expect((await db.query('select * from public.whatsapp_action_sessions')).rows).toHaveLength(0)
  expect((await db.query("select id from public.tasks where title='Kedaluwarsa'")).rows).toHaveLength(0)
 })
 it('returns safe validation feedback for malformed dates and forbids arbitrary extra fields',async()=>{
  expect((await apply(pic,'task_create',null,{judul:'Bad date',mulai:'bukan tanggal',tenggat:'2027-01-02 16:00'})).ok).toBe(false)
  expect((await apply(manager,'task_update',task,{judul:'x',owner_id:sa})).ok).toBe(false)
 })
 it('filters category reads to the same section scope as the web',async()=>{
  await apply(sa,'category_create',null,{nama:'Kategori sendiri',seksi:'4'})
  await apply(sa,'category_create',null,{nama:'Kategori seksi lain',seksi:'5'})
  const r=(await db.query<{r:{rows:Array<{label:string}>}}>("select public.wa_read_feature($1,'categories',null,1) r",[pic])).rows[0].r
  expect(r.rows.map(x=>x.label)).toEqual(['Kategori sendiri'])
 })
 async function ai(actor:string,kind:string,payload:Record<string,unknown>={},token:string|null=null,channel=chatChannel,phone:string|null=null,receipt:string|null=null){
  if(channel==='whatsapp'&&!phone){phone=chatPhones[actor];receipt=String(++chatReceipt).padStart(64,'0')}
  if(channel==='whatsapp') {const l=(await db.query<{linked_at:string}>('select linked_at::text from public.whatsapp_links where phone=$1',[phone])).rows[0];payload={...payload,linkGeneration:l?.linked_at}}
  return (await db.query<{r:{ok:boolean;pending?:boolean;token?:string;changed?:boolean;duplicate?:boolean;message:string;rows?:Array<{id:string}>}}>('select public.atm_ai_turn($1,$2,$3,$4::jsonb,$5,$6,$7) r',[actor,channel,kind,JSON.stringify(payload),token,phone,receipt])).rows[0].r
 }
 it('AI preview and token confirmation persist exactly one task',async()=>{
  const p=await ai(pic,'propose',{operation:'task_create',data:{judul:'AI baru',mulai:'2027-01-01 08:00',tenggat:'2027-01-02 16:00'}})
  expect(p.pending,p.message).toBe(true)
  expect((await db.query("select id from public.tasks where title='AI baru'")).rows).toHaveLength(0)
  expect((await ai(pic,'confirm',{},p.token)).changed).toBe(true)
  expect((await ai(pic,'confirm',{},p.token)).ok).toBe(false)
  expect((await db.query("select id from public.tasks where title='AI baru'")).rows).toHaveLength(1)
 })
 it('AI rejects wrong confirmation tokens and read requests invalidate previous previews',async()=>{
  const p=await ai(manager,'propose',{operation:'task_update',target:task,data:{judul:'No save'}})
  expect(p.pending).toBe(true)
  expect((await ai(manager,'confirm',{},'incorrect')).ok).toBe(false)
  const q=await ai(manager,'propose',{operation:'task_update',target:task,data:{judul:'No save'}})
  await ai(manager,'read',{entity:'tasks'})
  expect((await ai(manager,'confirm',{},q.token)).ok).toBe(false)
 })
 it('AI rejects ambiguous titles, role downgrades and stale task versions',async()=>{
  await db.exec(`insert into public.tasks(owner_id,assigner_id,reviewer_id,org_unit_id,title,start_date,due_date) values('${pic}','${manager}','${manager}',4,'Task asal',now(),now()+interval '10 days')`)
  expect((await ai(manager,'propose',{operation:'task_delete',target:'Task asal',data:{}})).pending).toBeUndefined()
  const p=await ai(manager,'propose',{operation:'task_update',target:task,data:{judul:'No save'}})
  await db.query('update public.tasks set title=$1 where id=$2',['Changed elsewhere',task])
  expect((await ai(manager,'confirm',{},p.token)).changed).toBe(false)
  const q=await ai(manager,'propose',{operation:'task_delete',target:task,data:{}})
  await db.query('update public.users set role_id=2 where id=$1',[manager])
  expect((await ai(manager,'confirm',{},q.token)).changed).toBe(false)
 })
 it('AI scopes reads and denies Spectator/PIC privileged operations',async()=>{
  const other=(await db.query<{id:string}>(`insert into public.tasks(owner_id,assigner_id,org_unit_id,title,start_date,due_date) values('${sa}','${sa}',5,'Other scope',now(),now()+interval '10 days') returning id`)).rows[0].id
  expect((await ai(pic,'read',{entity:'tasks'})).rows?.some(r=>r.id===other)).toBe(false)
  expect((await ai(pic,'propose',{operation:'task_delete',target:task,data:{}})).ok).toBe(false)
  expect((await ai(spectator,'propose',{operation:'task_create',data:{}})).ok).toBe(false)
  expect((await ai(pic,'read',{entity:'users'})).ok).toBe(false)
 })
 it('AI WhatsApp confirmation binds to phone link generation and deduplicates receipts',async()=>{
  const phone='6281111111111';await db.query('insert into public.whatsapp_links(user_id,phone,linked_at,notifications_enabled) values($1,$2,now(),true)',[pic,phone])
  const p=await ai(pic,'propose',{operation:'task_create',data:{judul:'WA AI',mulai:'2027-01-01 08:00',tenggat:'2027-01-02 16:00'}},null,'whatsapp',phone,'a'.repeat(64))
  expect(p.pending,p.message).toBe(true)
  const r=await ai(pic,'confirm',{},null,'whatsapp',phone,'b'.repeat(64));expect(r.changed,r.message).toBe(true)
  expect((await ai(pic,'confirm',{},null,'whatsapp',phone,'b'.repeat(64))).duplicate).toBe(true)
  expect((await db.query("select owner_id from public.tasks where title='WA AI'")).rows).toEqual([{owner_id:pic}])
  expect((await db.query('select id from public.whatsapp_outbox')).rows).toHaveLength(2)
  await ai(pic,'propose',{operation:'task_create',data:{judul:'No replay',mulai:'2027-01-01 08:00',tenggat:'2027-01-02 16:00'}},null,'whatsapp',phone,'c'.repeat(64))
  await db.query("update public.whatsapp_links set linked_at=now()+interval '1 second' where user_id=$1",[pic])
  expect((await ai(pic,'confirm',{},null,'whatsapp',phone,'d'.repeat(64))).ok).toBe(false)
 })
 it('AI expires previews, cancels cleanly and limits planner requests',async()=>{
  const p=await ai(manager,'propose',{operation:'task_delete',target:task,data:{}})
  await db.exec("update public.atm_ai_sessions set expires_at=now()-interval '1 second'")
  expect((await ai(manager,'confirm',{},p.token)).ok).toBe(false)
  const q=await ai(manager,'propose',{operation:'task_delete',target:task,data:{}})
  await ai(manager,'cancel');expect((await ai(manager,'confirm',{},q.token)).ok).toBe(false)
  for(let i=0;i<8;i++)expect((await ai(pic,'reserve')).ok).toBe(true)
  expect((await ai(pic,'reserve')).ok).toBe(false)
 })
 it('AI RPCs and private state deny browser and anonymous roles',async()=>{
  const rows=(await db.query<{allowed:boolean}>(`select has_function_privilege(role,'public.atm_ai_turn(uuid,text,text,jsonb,text,text,text)','execute') or has_table_privilege(role,'public.atm_ai_sessions','select') allowed from(values('anon'),('authenticated')) x(role)`)).rows
  expect(rows.every(r=>!r.allowed)).toBe(true)
 })
 it('AI conversational input is bounded, expires and remains isolated per channel/user',async()=>{
  await ai(pic,'reserve',{message:'Permintaan web',contextChannel:'web'})
  const wa=await ai(pic,'reserve',{message:'Permintaan WA',contextChannel:'whatsapp'})
  expect((wa as unknown as {history:string[]}).history).toEqual(['Permintaan WA'])
  const other=await ai(manager,'reserve',{message:'Manager sendiri',contextChannel:'web'})
  expect((other as unknown as {history:string[]}).history).toEqual(['Manager sendiri'])
  await db.exec("update public.atm_ai_limits set context_at=now()-interval '16 minutes'")
  const fresh=await ai(pic,'reserve',{message:'Baru',contextChannel:'web'})
  expect((fresh as unknown as {history:string[]}).history).toEqual(['Baru'])
 })
 it('AI read scope matches the web for Spectator and Staff while personal mode stays personal',async()=>{
  const teammate=(await db.query<{id:string}>(`insert into public.tasks(owner_id,assigner_id,reviewer_id,org_unit_id,title,start_date,due_date) values('${manager}','${sa}','${sm}',4,'Team task',now(),now()+interval '10 days') returning id`)).rows[0].id
  const visible=await ai(pic,'read',{entity:'tasks'})
  expect(visible.rows?.some(r=>r.id===teammate)).toBe(true)
  expect((await ai(spectator,'read',{entity:'tasks'})).rows?.some(r=>r.id===task)).toBe(true)
  expect((await ai(pic,'read',{entity:'tasks',mode:'mine'})).rows?.some(r=>r.id===teammate)).toBe(false)
 })
 it('keeps personal calendar results owned by the actor',async()=>{
  const own=(await db.query<{id:string}>(`insert into public.tasks(owner_id,assigner_id,reviewer_id,org_unit_id,title,start_date,due_date) values('${pic}','${manager}','${manager}',4,'Personal calendar',now(),now()+interval '2 days') returning id`)).rows[0].id
  const teammate=(await db.query<{id:string}>(`insert into public.tasks(owner_id,assigner_id,reviewer_id,org_unit_id,title,start_date,due_date) values('${manager}','${sa}','${sm}',4,'Team calendar',now(),now()+interval '2 days') returning id`)).rows[0].id
  expect((await ai(pic,'read',{entity:'tasks',mode:'calendar'})).rows?.some(r=>r.id===teammate)).toBe(true)
  expect((await ai(pic,'read',{entity:'tasks',mode:'mine_calendar'})).rows?.map(r=>r.id)).toEqual([own])
 })
 it('searches all keyword matches, requires a numbered choice, then confirms exactly one progress update',async()=>{
  await db.query('update public.tasks set title=$1 where id=$2',['Rekonsiliasi bank',task])
  const second=(await db.query<{id:string}>(`insert into public.tasks(owner_id,assigner_id,reviewer_id,org_unit_id,title,start_date,due_date) values($1,$2,$2,4,'Rekonsiliasi SAP',now(),now()+interval '12 days') returning id`,[pic,manager])).rows[0].id
  const matches=await ai(pic,'propose',{operation:'task_progress',target:'rekonsiliasi',data:{progres:'70'}})
  expect(matches.rows?.map(r=>r.id)).toEqual([task,second]);expect(matches.message).toContain('pilih 2');expect(matches.pending).not.toBe(true)
  expect((await ai(pic,'confirm')).ok).toBe(false)
  await ai(pic,'propose',{operation:'task_progress',target:'rekonsiliasi',data:{progres:'70'}})
  const preview=await ai(pic,'select',{choice:2});expect(preview.pending,preview.message).toBe(true)
  expect((await db.query<{p:number}>('select progress_pct p from public.tasks where id=$1',[second])).rows[0].p).toBe(0)
  expect((await ai(pic,'confirm',{},preview.token)).changed).toBe(true)
  expect((await db.query<{p:number}>('select progress_pct p from public.tasks where id=$1',[second])).rows[0].p).toBe(70)
  expect((await db.query<{p:number}>('select progress_pct p from public.tasks where id=$1',[task])).rows[0].p).toBe(0)
  expect((await ai(pic,'confirm',{},preview.token)).ok).toBe(false)
 })
 it('does not expose foreign candidates and denies progress for non-PIC, invalid values or WBS-managed tasks',async()=>{
  expect((await ai(manager,'propose',{operation:'task_progress',target:task,data:{progres:'70'}})).pending).not.toBe(true)
  expect((await apply(pic,'task_progress',task,{progres:'101'})).ok).toBe(false)
  expect((await apply(pic,'task_progress',task,{progres:'-1'})).ok).toBe(false)
  await apply(pic,'wbs_add',task,{judul:'Tahap',bobot:'100'})
  expect((await ai(pic,'propose',{operation:'task_progress',target:task,data:{progres:'70'}})).message).toContain('WBS')
  await db.query(`insert into public.tasks(owner_id,assigner_id,org_unit_id,title,start_date,due_date) values($1,$1,8,'Rahasia luar',now(),now()+interval '12 days')`,[sa])
  expect((await ai(pic,'propose',{operation:'task_progress',target:'Rahasia luar',data:{progres:'70'}})).message).toContain('Tidak ditemukan')
 })
 it('pages every open personal task with WIB deadlines and excludes completed tasks',async()=>{
  await db.query(`insert into public.tasks(owner_id,assigner_id,reviewer_id,org_unit_id,title,start_date,due_date) select $1::uuid,$2::uuid,$2::uuid,4,'Open tambahan '||n,now(),now()+n*interval '1 day' from generate_series(11,16) n`,[pic,manager])
  const first=await ai(pic,'read',{entity:'tasks',mode:'mine_open'})
  const second=await ai(pic,'read',{entity:'tasks',mode:'mine_open',page:'2'})
  expect(first.rows).toHaveLength(5);expect(second.rows).toHaveLength(2)
  expect(first.message).toContain('halaman 2');expect(new Set([...(first.rows??[]),...(second.rows??[])].map(r=>r.id)).size).toBe(7)
  expect((await db.query<{r:Array<{due:string}>}>('select public.atm_ai_task_page($1,\'\',\'mine_open\',1) r',[pic])).rows[0].r.every(r=>/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/.test(r.due))).toBe(true)
 })
 it('resolves category names through RLS and invalidates a candidate choice after cancellation',async()=>{
  const created=await apply(manager,'category_create',null,{nama:'Rekon pusat',seksi:'4'})
  const p=await ai(manager,'propose',{operation:'category_update',target:'Rekon pusat',data:{nama:'Rekon baru'}})
  expect(p.pending,p.message).toBe(true);expect((await ai(manager,'confirm',{},p.token)).changed).toBe(true)
  expect((await db.query<{name:string}>('select name from public.task_categories where id=$1',[created.id])).rows[0].name).toBe('Rekon baru')
  await db.query(`insert into public.tasks(owner_id,assigner_id,reviewer_id,org_unit_id,title,start_date,due_date) values($1,$2,$2,4,'Task asal 2',now(),now()+interval '12 days')`,[pic,manager])
  await ai(pic,'propose',{operation:'task_progress',target:'Task asal',data:{progres:'60'}})
  await ai(pic,'cancel');expect((await ai(pic,'select',{choice:1})).pending).not.toBe(true)
 })
 it('keeps WhatsApp selection, preview and confirmation tied to the phone generation and receipt',async()=>{
  await db.exec(`insert into public.whatsapp_links(user_id,phone,linked_at,notifications_enabled) values('${pic}','6281111111111',now(),true)`)
  await db.query(`insert into public.tasks(owner_id,assigner_id,reviewer_id,org_unit_id,title,start_date,due_date) values($1,$2,$2,4,'Task asal 2',now(),now()+interval '12 days')`,[pic,manager])
  const receipt=()=>crypto.randomUUID().replaceAll('-','').repeat(2)
  const firstReceipt=receipt()
  const p=await ai(pic,'propose',{operation:'task_progress',target:'asal',data:{progres:'60'}},null,'whatsapp','6281111111111',firstReceipt)
  expect(p.rows).toHaveLength(2)
  const preview=await ai(pic,'select',{choice:1},null,'whatsapp','6281111111111',receipt());expect(preview.pending,preview.message).toBe(true)
  expect((await ai(pic,'confirm',{},null,'whatsapp','6281111111111',receipt())).changed).toBe(true)
  const body=(await db.query<{body:string}>('select body from public.whatsapp_outbox where receipt_id=$1',[firstReceipt])).rows[0].body
  expect(body).toContain('1. Task asal');expect(body).toContain('Tenggat:');expect(body).toContain('WIB')
 })
 it('accepts ordinary WIB date answers in native creation without a fixed date structure',async()=>{
  const day=(await db.query<{vdate:string}>("select ((now() at time zone 'Asia/Jakarta')::date+1)::text vdate")).rows[0].vdate
  await db.exec(`insert into public.whatsapp_links(user_id,phone,linked_at,notifications_enabled) values('${pic}','6281111111111',now(),true)`)
  await receive('BUAT');await receive('Rekonsiliasi harian','help',{})
  expect(await receive('besok jam 8 pagi','help',{})).toContain('3/3')
  const preview=await receive('lusa jam 4 sore','help',{})
  expect(preview).toContain('Pratinjau');expect(preview).toContain(day+' 08:00')
  expect((await db.query("select id from public.tasks where title='Rekonsiliasi harian'")).rows).toHaveLength(0)
 })
 it('resolves PIC, support recipients and category sections by their exact displayed names without inventing IDs',async()=>{
  const r=await apply(sa,'task_create',null,{judul:'Untuk PIC',mulai:'2027-01-01 08:00',tenggat:'2027-01-02 16:00',pic:'PIC'})
  expect(r.ok,r.error).toBe(true)
  expect((await db.query<{owner_id:string}>('select owner_id from public.tasks where id=$1',[r.id])).rows[0].owner_id).toBe(pic)
  const category=await apply(manager,'category_create',null,{nama:'Kategori nama',seksi:'Section Cost Accounting'})
  expect(category.ok,category.error).toBe(true)
  expect((await apply(pic,'support_add',task,{penerima:'Manager',deskripsi:'Bantu periksa'})).ok).toBe(true)
 })

 it('lets Super Admin preview and confirm deletion of an exact title while preserving a longer matching title',async()=>{
  await db.query('update public.tasks set title=$1 where id=$2',['pertama',task])
  const other=(await db.query<{id:string}>(`insert into public.tasks(owner_id,assigner_id,org_unit_id,title,start_date,due_date) values($1,$1,8,'tugas pertama',now(),now()+interval '2 days') returning id`,[sa])).rows[0].id
  const preview=await ai(sa,'propose',{operation:'task_delete',target:'pertama',exact:true,data:{}})
  expect(preview.pending,preview.message).toBe(true);expect(preview.message).toContain('pertama')
  expect((await db.query('select id from public.tasks where id=$1',[task])).rows).toHaveLength(1)
  expect((await ai(sa,'confirm',{},preview.token)).changed).toBe(true)
  expect((await db.query('select id from public.tasks where id=$1',[task])).rows).toHaveLength(0)
  expect((await db.query('select id from public.tasks where id=$1',[other])).rows).toHaveLength(1)
  expect((await ai(pic,'propose',{operation:'task_delete',target:other,data:{}})).ok).toBe(false)
 })
 it('filters by PIC name and links to the same owner filter as the web without expanding Staff scope',async()=>{
  const named=await ai(sa,'read',{entity:'tasks',pic:'PIC',query:'PIC'})
  expect(named.rows?.map(r=>r.id)).toEqual([task]);expect(named.message).toContain('PIC: PIC')
  const path=(await db.query<{r:{path:string}}>(`select public.atm_ai_turn($1,'web','read','{"entity":"tasks","pic":"PIC"}') r`,[sa])).rows[0].r.path
  expect(path).toBe('/tasks?owner='+pic)
  await db.query(`insert into public.tasks(owner_id,assigner_id,org_unit_id,title,start_date,due_date) values($1,$1,8,'Bukan lingkup PIC',now(),now()+interval '2 days')`,[sa])
  expect((await ai(pic,'read',{entity:'tasks',pic:'SA',query:''})).rows).toHaveLength(0)
  expect((await ai(sa,'read',{entity:'tasks',pic:'SA',query:''})).rows).toHaveLength(1)
 })
 it('keeps title search as fallback, rejects missing explicit PICs and asks about ambiguous names',async()=>{
  expect((await ai(sa,'read',{entity:'tasks',pic:'Task asal',query:'Task asal'})).rows?.map(r=>r.id)).toEqual([task])
  expect((await ai(sa,'read',{entity:'tasks',pic:'Tidak ada PIC',query:''})).ok).toBe(false)
  await db.query('update public.users set name=$1 where id=$2',['PIC',gm])
  const ambiguous=await ai(sa,'read',{entity:'tasks',pic:'PIC',query:'PIC'})
  expect(ambiguous.ok).toBe(false);expect(ambiguous.message).toContain('nama yang sama')
 })
 it('preserves the PIC filter in its explicit next-page instruction',async()=>{
  await db.query(`insert into public.tasks(owner_id,assigner_id,reviewer_id,org_unit_id,title,start_date,due_date) select $1::uuid,$2::uuid,$2::uuid,4,'PIC tambahan '||n,now(),now()+n*interval '1 day' from generate_series(11,16) n`,[pic,manager])
  const first=await ai(sa,'read',{entity:'tasks',pic:'PIC',query:'PIC'})
  expect(first.message).toContain('daftar tugas milik PIC halaman 2')
  expect(first.message).not.toContain('cari tugas PIC')
  expect((await ai(sa,'read',{entity:'tasks',pic:'PIC',query:'',page:'2'})).rows).toHaveLength(2)
 })
 it.each([[spectator,false,false],[pic,false,false],[manager,true,false],[sm,true,false],[gm,true,true],[sa,true,true]])('checks section and cross-unit task CRUD separately for role actor %s',async(actor,ownScope,otherScope)=>{
  const foreign=(await db.query<{id:string}>(`insert into public.tasks(owner_id,assigner_id,org_unit_id,title,start_date,due_date) values($1,$1,9,'Lintas unit',now(),now()+interval '2 days') returning id`,[sa])).rows[0].id
  expect((await apply(actor as string,'task_update',task,{judul:'Dalam cakupan'},true)).ok).toBe(ownScope)
  expect((await apply(actor as string,'task_delete',task,{},true)).ok).toBe(ownScope)
  expect((await apply(actor as string,'task_update',foreign,{judul:'Luar cakupan'},true)).ok).toBe(otherScope)
  expect((await apply(actor as string,'task_delete',foreign,{},true)).ok).toBe(otherScope)
  expect((await apply(actor as string,'org_create',null,{nama:'Organisasi uji role',tipe:'section',induk:'2'},true)).ok).toBe(actor===sa)
 })

 it('deletes tasks with real reminder notification references and preserves historical notification ownership',async()=>{
  const reminder=(await db.query<{id:string}>(`insert into public.task_reminders(task_id,checkpoint_pct,due_date_version) select id,50,due_date from public.tasks where id=$1 returning id`,[task])).rows[0].id
  const notification=(await db.query<{id:string}>(`insert into public.notifications(user_id,task_id,reminder_id,type,title,body) values($1,$2,$3,'reminder_50','Reminder','Pengingat PIC') returning id`,[pic,task,reminder])).rows[0].id
  const preview=await ai(sa,'propose',{operation:'task_delete',target:task,data:{}})
  expect(preview.pending,preview.message).toBe(true)
  expect((await db.query('select id from public.tasks where id=$1',[task])).rows).toHaveLength(1)
  expect((await ai(sa,'confirm',{},preview.token)).changed).toBe(true)
  expect((await db.query('select id from public.task_reminders where id=$1',[reminder])).rows).toHaveLength(0)
  expect((await db.query<{task_id:string|null;reminder_id:string|null;user_id:string}>('select task_id,reminder_id,user_id from public.notifications where id=$1',[notification])).rows[0]).toEqual({task_id:null,reminder_id:null,user_id:pic})
 })
 it('still rejects missing-task reminders, wrong recipients and manual detachment from a live task',async()=>{
  await db.exec('savepoint bad_guard')
  await expect(db.query(`insert into public.notifications(user_id,type,title,body) values($1,'reminder_50','X','X')`,[pic])).rejects.toThrow('Reminder harus terhubung')
  await db.exec('rollback to savepoint bad_guard')
  await expect(db.query(`insert into public.notifications(user_id,task_id,type,title,body) values($1,$2,'reminder_50','X','X')`,[manager,task])).rejects.toThrow('PIC')
  await db.exec('rollback to savepoint bad_guard')
  const id=(await db.query<{id:string}>(`insert into public.notifications(user_id,task_id,type,title,body) values($1,$2,'reminder_50','X','X') returning id`,[pic,task])).rows[0].id
  await expect(db.query('update public.notifications set task_id=null where id=$1',[id])).rejects.toThrow('Reminder harus terhubung')
  await db.exec('rollback to savepoint bad_guard')
 })
 it('edits an exact owner-qualified task, then keeps the same selected task for a contextual delete',async()=>{
  await db.query('update public.tasks set title=$1 where id=$2',['pertama',task])
  const other=(await db.query<{id:string}>(`insert into public.tasks(owner_id,assigner_id,org_unit_id,title,start_date,due_date) values($1,$1,8,'pertama',now(),now()+interval '2 days') returning id`,[sa])).rows[0].id
  const edit=await ai(sa,'propose',{operation:'task_update',target:'pertama',exact:true,pic:'PIC',data:{}})
  expect(edit.message).toContain('Bagian mana');expect(edit.pending).not.toBe(true)
  const selected=(await db.query<{task_id:string}>('select task_id from public.atm_ai_task_context where user_id=$1',[sa])).rows[0].task_id
  expect(selected).toBe(task)
  const deletion=await ai(sa,'propose',{operation:'task_delete',context:true,data:{}})
  expect(deletion.pending,deletion.message).toBe(true)
  const pending=(await db.query<{target:string}>('select target from public.atm_ai_sessions where user_id=$1',[sa])).rows[0].target
  expect(pending).toBe(task)
  await ai(sa,'cancel');expect((await db.query('select id from public.tasks where id in ($1,$2)',[task,other])).rows).toHaveLength(2)
 })
 it('never treats a bare numeric selection as a substring of an unrelated UAT task title',async()=>{
  await db.query('update public.tasks set title=$1 where id=$2',['UAT MANUAL 20261030',task])
  const p=await ai(sa,'propose',{operation:'task_delete',target:'2',data:{}})
  expect(p.ok).toBe(false);expect(p.message).toContain('Nomor tugas tidak aktif');expect(p.pending).not.toBe(true)
  expect((await db.query('select * from public.atm_ai_sessions where user_id=$1',[sa])).rows).toHaveLength(0)
 })
 it('binds numeric references to the actual latest list and refuses expired or cross-user choices',async()=>{
  const second=(await db.query<{id:string}>(`insert into public.tasks(owner_id,assigner_id,org_unit_id,title,start_date,due_date) values($1,$1,8,'UAT 2 lain',now(),now()+interval '12 days') returning id`,[sa])).rows[0].id
  await ai(sa,'read',{entity:'tasks'})
  const selected=await ai(sa,'select',{choice:1});expect(selected.message).toContain('Task asal')
  const d=await ai(sa,'propose',{operation:'task_delete',target:'2',data:{}})
  expect(d.pending,d.message).toBe(true)
  expect((await db.query<{target:string}>('select target from public.atm_ai_sessions where user_id=$1',[sa])).rows[0].target).toBe(second)
  await ai(sa,'cancel')
  expect((await ai(manager,'propose',{operation:'task_delete',target:'2',data:{}})).pending).not.toBe(true)
  await ai(sa,'read',{entity:'tasks'});await db.query("update public.atm_ai_task_context set expires_at=now()-interval '1 second' where user_id=$1",[sa])
  expect((await ai(sa,'propose',{operation:'task_delete',target:'2',data:{}})).pending).not.toBe(true)
 })
 it('retains the original chosen row after ambiguous editing, requests fields and safely reuses it',async()=>{
  await db.query('update public.tasks set title=$1 where id=$2',['tugas pertama',task])
  const selected=(await db.query<{id:string}>(`insert into public.tasks(owner_id,assigner_id,org_unit_id,title,start_date,due_date) values($1,$1,8,'pertama',now(),now()+interval '12 days') returning id`,[sa])).rows[0].id
  const p=await ai(sa,'propose',{operation:'task_update',target:'pertama',data:{}})
  expect(p.rows).toHaveLength(2)
  const edit=await ai(sa,'select',{choice:2});expect(edit.message).toContain('Bagian mana')
  const d=await ai(sa,'propose',{operation:'task_delete',context:true,data:{}});expect(d.pending,d.message).toBe(true)
  expect((await db.query<{target:string}>('select target from public.atm_ai_sessions where user_id=$1',[sa])).rows[0].target).toBe(selected)
  await ai(sa,'cancel');expect((await db.query('select id from public.tasks where id=$1',[task])).rows).toHaveLength(1)
 })
 it('keeps task context private from browser and anonymous database roles',async()=>{
  const r=await db.query<{allowed:boolean}>(`select has_table_privilege(role,'public.atm_ai_task_context','select') allowed from(values('anon'),('authenticated')) x(role)`)
  expect(r.rows.every(r=>!r.allowed)).toBe(true)
 })

 it('never ignores an explicit missing or incorrect PIC when preparing a mutation',async()=>{
  const missing=await ai(sa,'propose',{operation:'task_delete',target:'Task asal',pic:'Nama tidak ada',exact:true,data:{}})
  expect(missing.pending).not.toBe(true);expect(missing.ok).toBe(false)
  const other=await ai(sa,'propose',{operation:'task_delete',target:'Task asal',pic:'SA',exact:true,data:{}})
  expect(other.pending).not.toBe(true);expect(other.ok).toBe(false)
  expect((await db.query('select id from public.tasks where id=$1',[task])).rows).toHaveLength(1)
 })
 it('keeps selected context through an ordinary clarification and changes only the selected title',async()=>{
  await ai(sa,'propose',{operation:'task_update',target:task,data:{}})
  await ai(sa,'reply',{message:'Bagian mana yang ingin diubah?'})
  const update=await ai(sa,'propose',{operation:'task_update',context:true,data:{judul:'Judul dari percakapan'}})
  expect(update.pending,update.message).toBe(true);expect(update.message).toContain('PIC: PIC')
  expect((await ai(sa,'confirm',{},update.token)).changed).toBe(true)
  expect((await db.query<{title:string}>('select title from public.tasks where id=$1',[task])).rows[0].title).toBe('Judul dari percakapan')
 })
 it('never falls back to a substring for an explicitly quoted exact title',async()=>{
  await db.query('update public.tasks set title=$1 where id=$2',['UAT MANUAL 20261030',task])
  const p=await ai(sa,'propose',{operation:'task_delete',target:'2',exact:true,data:{}})
  expect(p.pending).not.toBe(true);expect(p.ok).toBe(false)
 })

 async function say(message:string,actor=sa,thread?:string){
  const row=(await db.query<{operation:string;target:string;payload:GuidedDraft['payload'];conversation_id:string|null;expires_at:string}>('select operation,target,payload,conversation_id,expires_at from public.atm_ai_sessions where user_id=$1 and channel=$2',[actor,chatChannel])).rows[0]
  const draft=row?.payload?.guided&&(row.conversation_id??null)===(thread??null)?row:null
  if(/^batal$/i.test(message))return ai(actor,'cancel',thread?{threadId:thread}:{})
  const parsed=conversationPlan(message,draft)
  const catalog=(await db.query<{c:Record<string,import('@/lib/ai/contracts').Operation>}>('select public.wa_operation_catalog() c')).rows[0].c
  const plan=parsed?validatePlan(parsed,catalog):null
  if(!plan)throw new Error('Everyday phrase unexpectedly needs a model: '+message)
  return ai(actor,plan.kind==='propose'?'propose':plan.kind==='read'?'read':'reply',{...plan,...(thread?{threadId:thread}:{})})
 }
 it('completes the reported reassignment conversation without switching to task creation or calling an LLM',async()=>{
  await db.query('update public.users set name=$1 where id=$2',['Audrey',pic])
  const nata='88888888-8888-4888-8888-888888888888'
  await db.query(`insert into public.users(id,name,email,role_id,org_unit_id,supervisor_id) values($1,'nata','nata@example.test',2,4,$2)`,[nata,manager])
  await db.query('update public.tasks set title=$1 where id=$2',['pertama',task])
  const start=await say('ganti PIC tugas "pertama" audrey menjadi "nata" ya')
  expect(start.message).toContain('alasan');expect(start.message).toContain('pertama')
  const repeated=await say('tugas berjudul "pertama" milik audrey');expect(repeated.message).toContain('alasan');expect(repeated.message).not.toContain('mulai')
  const follow=await say('ganti PIC-nya menjadi nata');expect(follow.message).toContain('alasan')
  const preview=await say('karena tugas dialihkan ke tim nata');expect(preview.pending,preview.message).toBe(true)
  expect((await db.query<{owner_id:string}>('select owner_id from public.tasks where id=$1',[task])).rows[0].owner_id).toBe(pic)
  expect((await ai(sa,'confirm',{},preview.token)).changed).toBe(true)
  expect((await db.query<{owner_id:string}>('select owner_id from public.tasks where id=$1',[task])).rows[0].owner_id).toBe(nata)
 })
 it('creates a recurring task through ordinary answers, section/category choices and offsets',async()=>{
  await db.query('update public.users set name=$1 where id=$2',['Audrey',gm])
  await apply(manager,'category_create',null,{nama:'Rekonsiliasi',seksi:'4'})
  expect((await say('buatkan tugas berulang untuk Audrey')).message).toContain('judul')
  expect((await say('Rekonsiliasi bank mingguan')).message).toContain('seksi')
  expect((await say('Section Cost Accounting')).message).toContain('Kategori')
  expect((await say('1')).message).toContain('mingguan atau bulanan')
  expect((await say('setiap minggu')).message).toContain('hari apa')
  expect((await say('setiap Senin')).message).toContain('Mulai berapa hari')
  expect((await say('hari yang sama')).message).toContain('Tenggat berapa hari')
  const p=await say('dua hari setelah jadwal');expect(p.pending,p.message).toBe(true)
  expect((await db.query('select id from public.task_templates')).rows).toHaveLength(0)
  expect((await ai(sa,'confirm',{},p.token)).changed).toBe(true)
  const row=(await db.query<{owner_id:string;recurrence:string;recurrence_day:number;start_offset_days:number;due_offset_days:number}>('select owner_id,recurrence,recurrence_day,start_offset_days,due_offset_days from public.task_templates')).rows[0]
  expect(row).toEqual({owner_id:gm,recurrence:'weekly',recurrence_day:1,start_offset_days:0,due_offset_days:2})
 })
 it('keeps ordinary task creation fields and corrects invalid dates without losing the title',async()=>{
  expect((await say('buatkan tugas untuk PIC')).message).toContain('judul')
  expect((await say('Laporan harian')).message).toContain('Kapan mulai')
  expect((await say('besok jam 8 pagi')).message).toContain('tenggat')
  expect((await say('tanggal tidak valid')).message).toContain('Kapan tenggat')
  const p=await say('lusa jam 4 sore');expect(p.pending,p.message).toBe(true)
  await ai(sa,'cancel')
  expect((await db.query("select id from public.tasks where title='Laporan harian'")).rows).toHaveLength(0)
 })
 it('isolates pending intent between web threads and rechecks the actual role',async()=>{
  const a='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',b='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  const p=await say('edit tugas "Task asal"',sa,a);expect(p.message).toContain('Bagian mana')
  expect((await say('hapus ya',sa,b)).pending).not.toBe(true)
  expect((await db.query('select id from public.tasks where id=$1',[task])).rows).toHaveLength(1)
  expect((await ai(pic,'propose',{operation:'task_reassign',context:true,data:{pic:'Manager'}})).ok).toBe(false)
 })
 it.each(['web','whatsapp'])('executes all 31 catalogue operations through %s chat, preview and one-use confirmation on disposable fixtures',async channel=>{
  chatChannel=channel
  if(channel==='whatsapp')for(const [actor,phone] of Object.entries(chatPhones))await db.query('insert into public.whatsapp_links(user_id,phone,linked_at,notifications_enabled) values($1,$2,now(),true)',[actor,phone])
  const executed=new Set<string>()
  async function confirm(actor:string,preview:Awaited<ReturnType<typeof say>>,operation:string){
   expect(preview.pending,operation+': '+preview.message).toBe(true)
   const state=(await db.query<{operation:string}>('select operation from public.atm_ai_sessions where user_id=$1 and channel=$2',[actor,chatChannel])).rows[0]
   expect(state.operation).toBe(operation)
   const r=await ai(actor,'confirm',{},preview.token);expect(r.changed,operation+': '+r.message).toBe(true);executed.add(operation)
   expect((await ai(actor,'confirm',{},preview.token)).changed).not.toBe(true)
  }
  await confirm(pic,await say('bikinin tugas Chat baru mulai 2027-01-01 08:00 tenggat 2027-01-02 16:00',pic),'task_create')
  await say('edit tugas "Chat baru"',manager)
  await confirm(manager,await say('judul jadi Chat diperbarui',manager),'task_update')
  await say('salin tugas "Chat diperbarui"',pic)
  await say('Salinan chat',pic);await say('2027-01-03 08:00',pic)
  await confirm(pic,await say('2027-01-04 16:00',pic),'task_duplicate')
  await confirm(pic,await say('geserin tugas "Task asal" ke berjalan',pic),'task_status')
  await confirm(pic,await say('progres "Task asal" jadi 50%',pic),'task_progress')
  await confirm(pic,await say('kasih komentar di tugas "Task asal": sudah dicek',pic),'task_comment')
  await say('minta bantuan Manager untuk tugas "Task asal"',pic)
  await confirm(pic,await say('Bantu dokumen chat',pic),'support_add')
  await confirm(manager,await say('selesaikan support "Bantu dokumen chat"',manager),'support_finish')
  await say('undur tenggat tugas "Task asal" ke 2027-02-01 16:00',pic)
  await confirm(pic,await say('karena menunggu data',pic),'task_deadline')
  const deadline=(await db.query<{id:string}>('select id from public.deadline_change_requests where task_id=$1',[task])).rows[0].id
  await confirm(sm,await say('setujui permohonan tenggat '+deadline,sm),'deadline_decide')
  await confirm(manager,await say('tambahkan syarat bukti "Bukti chat" di tugas "Task asal"',manager),'evidence_requirement')
  await confirm(pic,await say('tambahkan bukti https://example.test/chat.pdf untuk "Bukti chat"',pic),'evidence_link')
  await confirm(pic,await say('pindahkan tugas "Task asal" ke review',pic),'task_status')
  await confirm(manager,await say('setujui tugas "Task asal"',manager),'task_review')
  await say('tambahkan wbs "Bagian chat" di tugas "Chat diperbarui"',pic)
  await confirm(pic,await say('100 persen',pic),'wbs_add')
  await confirm(pic,await say('centang wbs "Bagian chat"',pic),'wbs_toggle')
  await say('pindahin tugas "Salinan chat" ke Manager',sa)
  await confirm(sa,await say('karena pembagian tim',sa),'task_reassign')
  await confirm(sa,await say('tugas "Salinan chat" milik Manager dihapus',sa),'task_delete')
  await confirm(manager,await say('buat kategori "Kategori chat" di seksi Section Cost Accounting',manager),'category_create')
  await confirm(manager,await say('ubah kategori "Kategori chat" jadi "Kategori baru"',manager),'category_update')
  await say('buatkan tugas berulang untuk PIC',pic);await say('Jadwal chat',pic)
  await say('Kategori baru',pic);await say('setiap Senin',pic);await say('hari yang sama',pic)
  await confirm(pic,await say('dua hari setelah jadwal',pic),'template_create')
  await confirm(pic,await say('ubah tugas berulang "Jadwal chat" jadi "Jadwal baru"',pic),'template_update')
  await confirm(pic,await say('nonaktifkan jadwal "Jadwal baru"',pic),'template_toggle')
  await confirm(pic,await say('hapus tugas berulang "Jadwal baru"',pic),'template_delete')
  await confirm(manager,await say('hapus kategori "Kategori baru"',manager),'category_delete')
  await confirm(sa,await say('buat departemen "Departemen chat"',sa),'org_create')
  await confirm(sa,await say('ubah organisasi "Departemen chat" jadi "Departemen baru"',sa),'org_update')
  await confirm(sa,await say('hapus organisasi "Departemen baru"',sa),'org_delete')
  await db.query(`insert into public.notifications(user_id,type,title,body) values($1,'test','Notifikasi chat','Isi')`,[pic])
  await confirm(pic,await say('tandai notifikasi "Notifikasi chat" dibaca',pic),'notification_read')
  await confirm(pic,await say('tandai semua notifikasi dibaca',pic),'notification_all')
  const reminder=(await db.query<{id:string}>(`insert into public.task_reminders(task_id,checkpoint_pct,due_date_version) select id,50,due_date from public.tasks where title='Chat diperbarui' returning id`)).rows[0].id
  await confirm(pic,await say('balas reminder '+reminder+' dengan progres',pic),'reminder_response')
  await confirm(pic,await say('ganti nama profil saya menjadi PIC Baru',pic),'profile_name')
  const catalog=(await db.query<{c:Record<string,unknown>}>('select public.wa_operation_catalog() c')).rows[0].c
  expect([...executed].sort()).toEqual(Object.keys(catalog).sort())
 })
 it.each(['web','whatsapp'])('replays the reported Ada deh/Sevtuari status conversation on %s without touching a same-title task',async channel=>{
  chatChannel=channel
  if(channel==='whatsapp')await db.query('insert into public.whatsapp_links(user_id,phone,linked_at,notifications_enabled) values($1,$2,now(),true)',[sa,chatPhones[sa]])
  await db.query('update public.users set name=$1 where id=$2',['Sevtuari',pic])
  await db.query('update public.tasks set title=$1 where id=$2',['Ada deh',task])
  const other=(await db.query<{id:string}>(`insert into public.tasks(owner_id,assigner_id,reviewer_id,org_unit_id,title,start_date,due_date) values($1,$2,$2,4,'Ada deh',now(),now()+interval '10 days') returning id`,[manager,sm])).rows[0].id
  const initial=await say('ubah status task Ada deh milik Sevtuari menjadi Terhambat')
  expect(initial.pending).not.toBe(true);expect(initial.message).toContain('Saya memahami');expect(initial.message).toContain('Belum Dimulai')
  expect((await db.query('select status from public.tasks where id=$1',[task])).rows[0]).toMatchObject({status:'To do'})
  const ambiguous=await say('mengubah status tugas "Ada deh"');expect(ambiguous.rows).toHaveLength(2)
  // A target clarification must keep task_status, never switch back to a generic edit.
  const state=(await db.query<{operation:string;payload:GuidedDraft['payload']}>('select operation,payload from public.atm_ai_sessions where user_id=$1 and channel=$2',[sa,channel])).rows[0]
  const clarified=conversationPlan('mengubah tugas Sevtuari dengan nama "Ada deh"',{operation:state.operation,payload:{...state.payload,guided:true,field:'target'}})!
  expect(clarified).toMatchObject({operation:'task_status',target:'Ada deh',pic:'Sevtuari'})
  const ask=await ai(sa,'propose',{...clarified});expect(ask.message.toLowerCase()).toContain('status')
  const blocked=await say('Terhambat');expect(blocked.message).toContain('Saya memahami');expect(blocked.pending).not.toBe(true)
  const starting=await say('Berjalan');expect(starting.pending,JSON.stringify(starting)).toBe(true)
  expect((await ai(sa,'confirm',{},starting.token)).changed).toBe(true)
  // A genuine active support is required by the web state machine too.
  await db.query(`insert into public.task_supports(task_id,needed_from_id,description,status) values($1,$2,'Menunggu dokumen','diminta')`,[task,manager])
  const preview=await say('ubah status task Ada deh milik Sevtuari menjadi Terhambat');expect(preview.pending,preview.message).toBe(true)
  expect((await ai(sa,'confirm',{},preview.token)).changed).toBe(true)
  expect((await db.query('select status from public.tasks where id=$1',[task])).rows[0]).toMatchObject({status:'Blocked'})
  expect((await db.query('select status from public.tasks where id=$1',[other])).rows[0]).toMatchObject({status:'To do'})
 })
 it.each([[spectator,false],[pic,true],[manager,true],[sm,true],[gm,true],[sa,true]])('keeps ordinary status changes consistent with web role scope: %s',async(actor,allowed)=>{
  expect((await apply(actor as string,'task_status',task,{status:'In progress'})).ok).toBe(allowed)
 })
 it('does not let a manager change a foreign-section task status',async()=>{
  const other=(await db.query<{id:string}>(`insert into public.tasks(owner_id,assigner_id,reviewer_id,org_unit_id,title,start_date,due_date) values($1,$2,$2,5,'Foreign task',now(),now()+interval '10 days') returning id`,[sm,gm])).rows[0].id
  expect((await apply(manager,'task_status',other,{status:'In progress'})).ok).toBe(false)
 })
 it.each(['web','whatsapp'])('replays the priority transcript on %s and updates only the owner-qualified task after confirmation',async channel=>{
  chatChannel=channel
  if(channel==='whatsapp')await db.query('insert into public.whatsapp_links(user_id,phone,linked_at,notifications_enabled) values($1,$2,now(),true)',[sa,chatPhones[sa]])
  await db.query('update public.users set name=$1 where id=$2',['nata',pic])
  await db.query('update public.tasks set title=$1 where id=$2',['mengerjakan paper',task])
  const other=(await db.query<{id:string}>(`insert into public.tasks(owner_id,assigner_id,reviewer_id,org_unit_id,title,start_date,due_date) values($1,$2,$2,4,'mengerjakan paper',now(),now()+interval '10 days') returning id`,[manager,sm])).rows[0].id
  const first=await say('tugas "mengerjakan paper" milik PIC nata tolong diubah prioritasnya menjadi tinggi')
  expect(first.pending,first.message).toBe(true);expect(first.message).toContain('nata');expect(first.message).toContain('prioritas: tinggi')
  expect((await db.query('select priority from public.tasks where id=$1',[task])).rows[0]).toEqual({priority:'sedang'})
  const ambiguous=await say('mengubah prioritas "mengerjakan paper"');expect(ambiguous.rows).toHaveLength(2)
  const selecting=(await db.query<{operation:string;payload:GuidedDraft['payload']}>('select operation,payload from public.atm_ai_sessions where user_id=$1 and channel=$2',[sa,channel])).rows[0]
  const generic=conversationPlan('mengubah',{operation:selecting.operation,payload:{...selecting.payload,guided:true,field:'target'}})!
  await ai(sa,'propose',generic)
  const labelled=await say('judul: mengerjakan paper, PIC-nya nata');expect(labelled.message).toContain('Prioritasnya');expect(labelled.message).toContain('nata')
  const preview=await say('tinggi');expect(preview.pending,preview.message).toBe(true)
  expect((await ai(sa,'confirm',{},preview.token)).changed).toBe(true)
  expect((await db.query('select priority from public.tasks where id=$1',[task])).rows[0]).toEqual({priority:'tinggi'})
  expect((await db.query('select priority from public.tasks where id=$1',[other])).rows[0]).toEqual({priority:'sedang'})
 })
 it('asks for a missing priority after selecting a task instead of starting a generic edit',async()=>{
  const prompt=await say('mengubah prioritas "Task asal"')
  expect(prompt.message).toContain('Prioritasnya')
  const later=await say('mengubah');expect(later.message).toContain('Prioritasnya')
  const preview=await say('prioritasnya menjadi tinggi');expect(preview.pending,preview.message).toBe(true)
 })
 async function claimAgent(actor=sa,key=crypto.randomUUID(),scope='default',channel='web',phone:string|null=null,generation:string|null=null,hash='a'.repeat(64)){
  const r=(await db.query<{r:{lease?:string;memory?:Record<string,unknown>;cached?:Record<string,unknown>}}>('select public.atm_agent_claim($1,$2,$3,$4,$5,$6,$7) r',[actor,channel,scope,key,hash,phone,generation])).rows[0].r
  return {...r,key,scope,channel,phone,generation,actor}
 }
 async function executeAgent(c:Awaited<ReturnType<typeof claimAgent>>,kind:string,payload:Record<string,unknown>,token:string|null=null){
  return (await db.query<{r:{ok:boolean;changed?:boolean;message:string;pending?:boolean;token?:string;rows?:Array<{id:string}>}}>('select public.atm_agent_execute($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11) r',[c.actor,c.channel,c.scope,c.key,c.lease,kind,JSON.stringify(payload),token,c.phone,c.channel==='whatsapp'?c.key:null,c.generation])).rows[0].r
 }
 it('agent atomically auto-applies an exact low-risk priority change and caches replay',async()=>{
  const c=await claimAgent()
  const r=await executeAgent(c,'propose',{operation:'task_update',target:task,exact:true,data:{prioritas:'tinggi'}})
  expect(r.ok,r.message).toBe(true);expect(r.changed).toBe(true)
  expect((await claimAgent(sa,c.key)).cached).toEqual(r)
  expect((await db.query("select * from public.audit_logs where action='ai_web_task_update'")).rows).toHaveLength(1)
 })
 it('agent does not auto-apply a fuzzy reference or destructive operation',async()=>{
  const c=await claimAgent()
  expect((await executeAgent(c,'propose',{operation:'task_delete',target:task,exact:true,data:{}})).pending).toBe(true)
  expect((await db.query('select id from public.tasks where id=$1',[task])).rows).toHaveLength(1)
 })
 it('agent preserves a draft across a second web conversation without leaking it',async()=>{
  const thread=crypto.randomUUID();await db.query('insert into public.ai_chat_threads(id,user_id) values($1,$2)',[thread,sa])
  const c=await claimAgent();await executeAgent(c,'propose',{operation:'task_delete',target:task,data:{}})
  const other=await claimAgent(sa,crypto.randomUUID(),thread)
  expect(other.memory?.draft).toBeUndefined();await executeAgent(other,'read',{entity:'tasks'})
  const back=await claimAgent();expect((back.memory?.draft as {operation:string}).operation).toBe('task_delete')
  expect((await db.query('select operation from public.atm_ai_sessions where user_id=$1',[sa])).rows[0]).toEqual({operation:'task_delete'})
 })
 it('agent rejects a concurrent lease before it can execute',async()=>{
  await claimAgent()
  await expect(claimAgent()).rejects.toThrow('Conversation busy')
 })
 it('agent rejects an expired execution lease without changing data',async()=>{
  const c=await claimAgent();await db.exec("update public.atm_agent_sessions set lease_until=now()-interval '1 second'")
  await expect(executeAgent(c,'propose',{operation:'task_delete',target:task,data:{}})).rejects.toThrow('Stale execution lease')
 })
 it('agent rejects request ID reuse with another payload',async()=>{
  const c=await claimAgent();await executeAgent(c,'read',{entity:'tasks'})
  await expect(claimAgent(sa,c.key,'default','web',null,null,'b'.repeat(64))).rejects.toThrow('Request identity reused')
 })
 it.each([spectator,pic,manager,sm,gm,sa])('agent validates all six actual role permissions: %s',async actor=>{
  const c=await claimAgent(actor)
  const r=await executeAgent(c,'propose',{operation:'org_delete',target:'4',exact:true,data:{}})
  if(actor!==sa)expect(r.ok).toBe(false)
  expect(r.changed).not.toBe(true)
 })
 it('agent keeps retrieval under RLS and restores the caller role',async()=>{
  const before=(await db.query('select current_user')).rows[0]
  expect((await db.query<{r:Array<{id:string;pic:string}>}>('select public.atm_agent_candidates($1,$2) r',[sa,'Task asal'])).rows[0].r).toEqual(expect.arrayContaining([expect.objectContaining({id:task,pic:'PIC'})]))
  expect((await db.query('select current_user')).rows[0]).toEqual(before)
 })
 it('agent cannot claim another user’s conversation',async()=>{
  const thread=crypto.randomUUID();await db.query('insert into public.ai_chat_threads(id,user_id) values($1,$2)',[thread,pic])
  await expect(claimAgent(sa,crypto.randomUUID(),thread)).rejects.toThrow('Conversation not owned')
 })
 it('agent commits one WhatsApp receipt and final outbox for an auto-applied operation',async()=>{
  await db.query('insert into public.whatsapp_links(user_id,phone,linked_at,notifications_enabled) values($1,$2,now(),true)',[sa,chatPhones[sa]])
  const generation=(await db.query<{g:string}>('select linked_at::text g from public.whatsapp_links where user_id=$1',[sa])).rows[0].g
  const c=await claimAgent(sa,'c'.repeat(64),chatPhones[sa],'whatsapp',chatPhones[sa],generation)
  const r=await executeAgent(c,'propose',{operation:'task_update',target:task,exact:true,data:{prioritas:'tinggi'}})
  expect(r.changed,r.message).toBe(true)
  expect((await db.query('select * from public.whatsapp_outbox where receipt_id=$1',[c.key])).rows).toHaveLength(1)
  expect((await db.query<{body:string}>('select body from public.whatsapp_outbox where receipt_id=$1',[c.key])).rows[0].body).toContain('Berhasil')
  expect((await claimAgent(sa,c.key,chatPhones[sa],'whatsapp',chatPhones[sa],generation)).cached?.changed).toBe(true)
 })
 it('agent refuses a disconnected WhatsApp generation before executing',async()=>{
  await expect(claimAgent(sa,'d'.repeat(64),chatPhones[sa],'whatsapp',chatPhones[sa],'2020-01-01')).rejects.toThrow('Link changed')
 })
 it('agent exposes neither its tables nor its RPCs to browser database roles',async()=>{
  for(const role of ['anon','authenticated']){
   expect((await db.query<{ok:boolean}>('select has_table_privilege($1,$2,$3) ok',[role,'public.atm_agent_sessions','select'])).rows[0].ok).toBe(false)
   expect((await db.query<{ok:boolean}>('select has_function_privilege($1,$2,$3) ok',[role,'public.atm_agent_claim(uuid,text,text,text,text,text,timestamptz)','execute'])).rows[0].ok).toBe(false)
  }
 })
 it('agent previews and confirms multiple writes as one atomic batch',async()=>{
  const c=await claimAgent()
  const preview=await executeAgent(c,'batch',{steps:[{kind:'propose',operation:'task_update',target:task,data:{prioritas:'tinggi'}},{kind:'propose',operation:'task_comment',target:task,data:{komentar:'Bukti batch'}}]})
  expect(preview.pending,preview.message).toBe(true)
  expect((await db.query("select id from public.task_comments where body='Bukti batch'")).rows).toHaveLength(0)
  const c2=await claimAgent();const result=await executeAgent(c2,'confirm',{},preview.token)
  expect(result.changed,result.message).toBe(true)
  expect((await db.query("select id from public.task_comments where body='Bukti batch'")).rows).toHaveLength(1)
  expect((await db.query("select * from public.audit_logs where action in ('ai_web_task_update','ai_web_task_comment')")).rows).toHaveLength(2)
 })
 it('agent rolls the entire batch back when a later write fails',async()=>{
  const c=await claimAgent()
  const preview=await executeAgent(c,'batch',{steps:[{kind:'propose',operation:'task_update',target:task,data:{prioritas:'tinggi'}},{kind:'propose',operation:'task_comment',target:task,data:{komentar:'Gagal batch'}}]})
  expect(preview.pending,preview.message).toBe(true)
  await db.exec("create function public.agent_fail_comment() returns trigger language plpgsql as $$begin raise exception 'simulated failure';end$$;create trigger agent_fail_comment before insert on public.task_comments for each row execute function public.agent_fail_comment();")
  const before=(await db.query('select priority from public.tasks where id=$1',[task])).rows[0]
  const c2=await claimAgent();const result=await executeAgent(c2,'confirm',{},preview.token)
  expect(result.ok).toBe(false);expect(result.changed).toBe(false)
  expect((await db.query('select priority from public.tasks where id=$1',[task])).rows[0]).toEqual(before)
  expect((await db.query("select * from public.audit_logs where action in ('ai_web_task_update','ai_web_task_comment')")).rows).toHaveLength(0)
 })
 it('agent never executes the valid half of a partly invalid multi-intent',async()=>{
  const c=await claimAgent()
  const result=await executeAgent(c,'batch',{steps:[{kind:'propose',operation:'task_update',target:task,data:{prioritas:'tinggi'}},{kind:'propose',operation:'task_status',target:task,data:{status:'Blocked'}}]})
  expect(result.changed).not.toBe(true)
  expect((await db.query("select * from public.audit_logs where action='ai_web_task_update'")).rows).toHaveLength(0)
 })
 it('agent aligns merged multi-read results with the numbered task context',async()=>{
  const other=(await db.query<{id:string}>(`insert into public.tasks(owner_id,assigner_id,reviewer_id,org_unit_id,title,start_date,due_date) values($1,$2,$2,4,'Another task',now(),now()+interval '2 days') returning id`,[manager,sm])).rows[0].id
  const c=await claimAgent()
  const r=await executeAgent(c,'batch',{steps:[{kind:'read',entity:'tasks',query:'Task asal'},{kind:'read',entity:'tasks',query:'Another task'}]})
  expect(r.rows?.map(x=>x.id)).toEqual([task,other])
  const c2=await claimAgent();await executeAgent(c2,'select',{choice:1})
  expect((await db.query<{task_id:string}>('select task_id from public.atm_ai_task_context where user_id=$1 and channel=$2',[sa,'web'])).rows[0].task_id).toBe(task)
 })
 const evalRevision='a'.repeat(40)
 type EvalState={run:{id:string;status:string;revision:string;reason:string;next_at:string}|null;results:Array<{id:string;state:string;attempts:number;result:{status:string;revision:string}|null}>}
 async function evalManage(actor=gm,action='start',run:string|null=null,revision=evalRevision){return (await db.query<{r:EvalState}>('select public.atm_eval_manage($1,$2,$3,$4::jsonb,$5) r',[actor,action,revision,JSON.stringify(['01-R1','01-R2']),run])).rows[0].r}
 async function evalClaim(){return (await db.query<{r:{run:string;caseId:string;lease:string;attempt:number}|null}>('select public.atm_eval_claim($1) r',[evalRevision])).rows[0].r}
 async function evalFinish(c:NonNullable<Awaited<ReturnType<typeof evalClaim>>>,status='PASS',retry=false){return (await db.query<{r:boolean}>('select public.atm_eval_finish($1,$2,$3,$4::jsonb,$5,60) r',[c.run,c.caseId,c.lease,JSON.stringify({status,reason:'fixture'}),retry])).rows[0].r}
 it('persists evaluation across separate requests without browser storage',async()=>{
  const job=await evalManage();expect(job.results).toHaveLength(2)
  const c=(await evalClaim())!;expect(c.caseId).toBe('01-R1');expect(await evalFinish(c)).toBe(true)
  const restored=await evalManage(gm,'status',job.run!.id)
  expect(restored.results[0].result).toMatchObject({status:'PASS',revision:evalRevision})
  expect((await evalClaim())?.caseId).toBe('01-R2')
 })
 it('deduplicates starts and refuses cross-user access',async()=>{
  const a=await evalManage();expect((await evalManage()).run?.id).toBe(a.run?.id)
  await expect(evalManage(sa,'status',a.run!.id)).rejects.toThrow('not owned')
 })
 it('denies evaluation to a lower role',async()=>{
  await expect(evalManage(pic)).rejects.toThrow('access denied')
 })
 it('does not claim a second case while a worker holds the first lease',async()=>{
  await evalManage();expect(await evalClaim()).toBeTruthy();expect(await evalClaim()).toBeNull()
 })
 it('recovers an expired worker lease and fences its stale result',async()=>{
  await evalManage();const old=(await evalClaim())!
  await db.exec("update public.atm_eval_cases set lease_until=now()-interval '1 second'")
  const next=(await evalClaim())!;expect(next.caseId).toBe(old.caseId);expect(next.lease).not.toBe(old.lease)
  expect(await evalFinish(old)).toBe(false);expect(await evalFinish(next)).toBe(true)
 })
 it('retries a temporary failure on the server and records the next scheduled time',async()=>{
  const job=await evalManage();const c=(await evalClaim())!
  expect(await evalFinish(c,'RETRY',true)).toBe(true)
  const state=await evalManage(gm,'status',job.run!.id);expect(state.run?.status).toBe('waiting');expect(state.results[0].state).toBe('retry')
  expect(await evalClaim()).toBeNull()
  await db.exec("update public.atm_eval_runs set next_at=now()-interval '1 second'")
  expect((await evalClaim())?.caseId).toBe(c.caseId)
 })
 it('finishes the queue after a FAIL without confusing it with provider errors',async()=>{
  const job=await evalManage();await evalFinish((await evalClaim())!,'FAIL');await evalFinish((await evalClaim())!,'PASS')
  const done=await evalManage(gm,'status',job.run!.id);expect(done.run?.status).toBe('completed');expect(done.results.map(r=>r.result?.status)).toEqual(['FAIL','PASS'])
 })
 it('marks a repeatedly unavailable case as ERROR then permits the next case',async()=>{
  const job=await evalManage();const c=(await evalClaim())!
  await db.query('update public.atm_eval_cases set attempts=5 where case_id=$1',[c.caseId])
  await evalFinish(c,'RETRY',true)
  const current=await evalManage(gm,'status',job.run!.id);expect(current.results[0].result?.status).toBe('ERROR')
  expect((await evalClaim())?.caseId).toBe('01-R2')
 })
 it('pauses obsolete revisions instead of mixing result versions',async()=>{
  const job=await evalManage()
  await db.query('select public.atm_eval_claim($1)',['b'.repeat(40)])
  const current=await evalManage(gm,'status',job.run!.id);expect(current.run?.status).toBe('paused')
  await expect(evalManage(gm,'resume',job.run!.id,'b'.repeat(40))).rejects.toThrow('Revision changed')
 })
 it('retains previous attempts when explicitly retrying failed cases',async()=>{
  const job=await evalManage();const c=(await evalClaim())!;await evalFinish(c,'FAIL')
  await evalManage(gm,'pause',job.run!.id);const again=await evalManage(gm,'retry',job.run!.id)
  expect(again.results[0].state).toBe('pending');expect(again.results[0].result).toBeNull()
  expect((await db.query<{n:number}>('select jsonb_array_length(history) n from public.atm_eval_cases where case_id=$1',[c.caseId])).rows[0].n).toBe(1)
 })
 it('rejects a missing worker claim instead of reporting a saved result',async()=>{
  const missing={run:crypto.randomUUID(),caseId:'01-R1',lease:crypto.randomUUID(),attempt:1}
  expect(await evalFinish(missing)).toBe(false)
 })
 it('pauses evaluation when the temporary preview access expires',async()=>{
  const job=await evalManage()
  await db.exec("insert into public.atm_eval_worker_config(id,url,secret,headers,access_expires_at) values(true,'https://preview.invalid','test','{}',now()-interval '1 second')")
  await db.query('select public.atm_eval_tick()')
  const state=await evalManage(gm,'status',job.run!.id)
  expect(state.run?.status).toBe('paused')
 })
 it('does not expose evaluation tables, RPCs or scheduler secrets to browser roles',async()=>{
  for(const role of ['anon','authenticated']){
   expect((await db.query<{ok:boolean}>('select has_table_privilege($1,$2,$3) ok',[role,'public.atm_eval_runs','select'])).rows[0].ok).toBe(false)
   expect((await db.query<{ok:boolean}>('select has_function_privilege($1,$2,$3) ok',[role,'public.atm_eval_manage(uuid,text,text,jsonb,uuid)','execute'])).rows[0].ok).toBe(false)
  }
  expect((await db.query<{ok:boolean}>("select has_column_privilege('service_role','public.atm_eval_worker_config','secret','select') ok")).rows[0].ok).toBe(false)
 })
 it('switches to authenticated under an actual authenticator session and restores service role',async()=>{
  await db.exec('set session authorization authenticator;set local role service_role;')
  const r=await apply(pic,'task_comment',task,{komentar:'Pesan dari WhatsApp'})
  expect(r.ok,r.error).toBe(true)
  expect((await ai(pic,'read',{entity:'tasks'})).ok).toBe(true)
  expect((await db.query<{role:string}>('select current_user as role')).rows[0].role).toBe('service_role')
  await db.exec('reset session authorization')
 })

})
