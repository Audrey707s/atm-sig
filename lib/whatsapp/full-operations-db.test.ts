import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { afterAll,afterEach,beforeAll,beforeEach,describe,expect,it } from 'vitest'
const pic='11111111-1111-4111-8111-111111111111',manager='22222222-2222-4222-8222-222222222222',sm='33333333-3333-4333-8333-333333333333',gm='44444444-4444-4444-8444-444444444444',sa='55555555-5555-4555-8555-555555555555',spectator='66666666-6666-4666-8666-666666666666'
let db:PGlite,task:string
async function apply(actor:string,op:string,target:string|null,data:Record<string,string>={},preview=false,version:string|null=null){
 return (await db.query<{r:{ok:boolean;error?:string;id?:string;taskId?:string;path?:string;version?:string}}>('select public.wa_apply_operation($1,$2,$3,$4::jsonb,$5,$6) r',[actor,op,target,JSON.stringify(data),preview,version])).rows[0].r
}
describe('WhatsApp operations with existing ATM RLS and transactional rules',()=>{
 beforeAll(async()=>{
  db=new PGlite()
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create role authenticator noinherit;grant authenticated,service_role to authenticator;
   create schema auth;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   create function auth.role() returns text language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','service_role')$$;`)
  const files=['001_init_schema.sql','002_rls_policies.sql','004_spectator_read_only.sql','005_wbs_items.sql','006_rls_write_policies.sql','009_organization_scope_rls.sql','011_spectator_scope_tree.sql','012_scoped_task_delete.sql','013_task_support_transitions.sql','015_validate_task_evidence_locations.sql','016_task_progress_history.sql','017_task_status_transitions.sql','018_task_status_gates.sql','019_scoped_task_reassignment.sql','020_notify_new_task_owner.sql','021_task_reviewer_chain.sql','023_validate_pic_deadline_requests.sql','024_atomic_deadline_decisions.sql','025_audit_direct_deadline_updates.sql','026_privileged_owner_self_review.sql','029_pic_reminder_responses.sql','030_reminder_supervisor_notifications.sql','033_task_categories_templates.sql','034_task_category_scope_and_missed_runs.sql','035_scoped_manager_kanban_transitions.sql','036_guard_pic_timeline_dates.sql','20261022013000_pic_self_create_rls.sql','20261022015000_atomic_task_audit.sql','20261024202000_r03_task_bundle_and_org_guard.sql','20261024204000_r03_atomic_wbs_progress.sql','20261031000500_gm_review_override.sql','20261029032714_remove_legacy_wbs_hierarchy_trigger.sql','20261031162038_expand_categories_recurring_roles.sql','20261104031955_self_service_profile.sql','20261103113000_notify_only_assigned_reviewer_for_task_events.sql','20261112161939_whatsapp_channel.sql','20261112174755_whatsapp_task_commands.sql','20261112181649_whatsapp_guided_menu.sql','20261113101843_whatsapp_full_operations.sql','20261113153149_atm_ai_assistant.sql']
  for(const file of files){let sql=readFileSync('supabase/migrations/'+file,'utf8');if(file.includes('full_operations')&&!sql.trim().endsWith('commit;'))sql+='\ncommit;';try{await db.exec(sql)}catch(e){throw new Error('Migration '+file+': '+String(e))}}
  await db.exec(`select setval(pg_get_serial_sequence('public.org_units','id'),(select max(id) from public.org_units));grant usage on schema public,auth to anon,authenticated,service_role,authenticator;grant select,insert,update,delete on all tables in schema public to authenticated;grant usage,select on all sequences in schema public to authenticated;grant all on all tables in schema public to service_role;revoke update on public.task_categories from authenticated;grant update(org_unit_id,name,is_active) on public.task_categories to authenticated;revoke all on public.whatsapp_action_sessions,public.whatsapp_links,public.whatsapp_receipts,public.whatsapp_outbox,public.atm_ai_sessions,public.atm_ai_limits from anon,authenticated;`)
 })
 afterAll(async()=>db?.close())
 beforeEach(async()=>{
  await db.exec(`begin;insert into public.users(id,name,email,role_id,org_unit_id,supervisor_id) values
   ('${sa}','SA','sa@example.test',6,1,null),('${gm}','GM','gm@example.test',5,1,'${sa}'),('${sm}','SM','sm@example.test',4,2,'${gm}'),('${manager}','Manager','manager@example.test',3,4,'${sm}'),('${pic}','PIC','pic@example.test',2,4,'${manager}'),('${spectator}','Spectator','spectator@example.test',1,4,null);`)
  task=(await db.query<{id:string}>(`insert into public.tasks(owner_id,assigner_id,reviewer_id,org_unit_id,title,start_date,due_date) values('${pic}','${manager}','${manager}',4,'Task asal',now(),now()+interval '10 days') returning id`)).rows[0].id
 })
 afterEach(async()=>{await db.exec('rollback')})
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
 async function ai(actor:string,kind:string,payload:Record<string,unknown>={},token:string|null=null,channel='web',phone:string|null=null,receipt:string|null=null){
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
 it('switches to authenticated under an actual authenticator session and restores service role',async()=>{
  await db.exec('set session authorization authenticator;set local role service_role;')
  const r=await apply(pic,'task_comment',task,{komentar:'Pesan dari WhatsApp'})
  expect(r.ok,r.error).toBe(true)
  expect((await ai(pic,'read',{entity:'tasks'})).ok).toBe(true)
  expect((await db.query<{role:string}>('select current_user as role')).rows[0].role).toBe('service_role')
  await db.exec('reset session authorization')
 })
})
