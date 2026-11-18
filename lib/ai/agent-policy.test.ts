import {afterEach,describe,expect,it,vi} from 'vitest'
import {resolveTask,rolloutEnabled,validateAgentPlan,normalizeAgentRead,groundAgentFields,contextualTaskRead,type Candidate} from './agent-policy'
const candidates:Candidate[]=[{id:'a',title:'mengerjakan paper',pic:'Nata',status:'To do'},{id:'b',title:'pertama',pic:'Audrey',status:'Review'},{id:'c',title:'pertama',pic:'Nata',status:'To do'}]
const catalog={task_delete:{label:'Hapus',entity:'tasks',minimumRole:3,fields:{},required:[],task:true}}
afterEach(()=>vi.unstubAllEnvs())
describe('agent trust and resolution policy',()=>{
 it('does not guess between same-title tasks and resolves only a matching owner',()=>{
  expect(resolveTask({kind:'propose',target:'pertama',data:{}},candidates,{}).candidate).toBeUndefined()
  expect(resolveTask({kind:'propose',target:'pertama',pic:'Audrey',data:{}},candidates,{}).candidate?.id).toBe('b')
 })
 it('tolerates a small title typo without treating it as an exact match',()=>{
  const r=resolveTask({kind:'propose',target:'mengerjkan paper',pic:'Nata',data:{}},candidates,{})
  expect(r.candidate?.id).toBe('a');expect(r.confidence).toBeLessThan(1)
 })
 it('uses the verified task and owner context across short follow-ups',()=>{
  expect(resolveTask({kind:'propose',context:true,pic:'dia',data:{}},candidates,{activeTask:'b',activePIC:'Audrey'}).candidate?.id).toBe('b')
 })
 it('does not broaden a missing owner to another user’s task',()=>{
  expect(resolveTask({kind:'propose',target:'pertama',pic:'Tidak ada',data:{}},candidates,{}).candidate).toBeUndefined()
 })
 it('rejects model-selected unauthorized tools, fields, kinds and oversized plans',()=>{
  expect(()=>validateAgentPlan({steps:[{kind:'propose',operation:'task_delete',data:{}}]},2,catalog)).toThrow()
  expect(()=>validateAgentPlan({steps:[{kind:'sql',query:'delete from tasks'}]},6,catalog)).toThrow()
  expect(()=>validateAgentPlan({steps:[{kind:'propose',operation:'task_delete',data:{role:'6'}}]},6,catalog)).toThrow()
  expect(()=>validateAgentPlan({steps:Array(6).fill({kind:'help'})},6,catalog)).toThrow()
 })
 it('keeps new orchestration off by default and scopes the canary to actual SA roles',()=>{
  vi.stubEnv('ATM_AGENT_V2','off');expect(rolloutEnabled('actor',6)).toBe(false)
  vi.stubEnv('ATM_AGENT_V2','canary');expect(rolloutEnabled('actor',5)).toBe(false);expect(rolloutEnabled('actor',6)).toBe(true)
  vi.stubEnv('ATM_AGENT_V2','20');expect(rolloutEnabled('actor',6)).toBe(rolloutEnabled('actor',6))
 })
})

it.each([['mine','list'],['mine_open','open'],['mine_calendar','calendar']])('an explicit PIC replaces the personal filter: %s', (mode,expected)=>{
 expect(validateAgentPlan({steps:[{kind:'read',entity:'tasks',mode,pic:'nata'}]},5,{}).steps[0]).toMatchObject({mode:expected,pic:'nata'})
})
it('keeps personal lists and assigned-reviewer scope when explicitly requested',()=>{
 expect(normalizeAgentRead({kind:'read',entity:'tasks',mode:'mine_open'}).mode).toBe('mine_open')
 expect(normalizeAgentRead({kind:'read',entity:'tasks',mode:'review',pic:'Nata'}).mode).toBe('review')
})

it('normalizes the observed model owner-filter output before it reaches the backend',()=>{
 expect(normalizeAgentRead({kind:'read',entity:'tasks',mode:'mine_open',query:'pic:nata'})).toMatchObject({mode:'open',pic:'nata',query:''})
})

it('honors an explicit request to include completed tasks',()=>{
 expect(normalizeAgentRead({kind:'read',entity:'tasks',mode:'mine_open',pic:'Nata'},'tampilkan semua tugas milik Nata, termasuk yang sudah selesai')).toMatchObject({mode:'list',pic:'Nata'})
})

it('decodes the observed compound tool query and preserves a literal user title',()=>{
 expect(normalizeAgentRead({kind:'read',entity:'tasks',mode:'list',query:'title:"Ada deh" AND pic:Sevtuari'},'lihat tugas "Ada deh" milik Sevtuari')).toMatchObject({query:'Ada deh',pic:'Sevtuari'})
 expect(normalizeAgentRead({kind:'read',entity:'tasks',mode:'list',query:'pic:invoice'},'cari tugas "pic:invoice"')).toMatchObject({query:'pic:invoice'})
 expect(()=>normalizeAgentRead({kind:'read',entity:'tasks',mode:'list',pic:'Nata',query:'title:"Ada deh" AND pic:Sevtuari'})).toThrow('Conflicting owners')
})

it.each(['yang tadi tenggatnya kapan?','berapa progres tugas itu?','cek status task tadi','yang itu siapa PIC-nya?'])('resolves a safe contextual read without provider quota: %s',message=>{
 expect(contextualTaskRead(message,{activeTask:'verified-task'})).toMatchObject({kind:'read',query:'verified-task'})
})
it('never treats an ambiguous or mutating follow-up as a safe read',()=>{
 expect(contextualTaskRead('yang tadi tenggatnya kapan?',{})).toBeNull()
 expect(contextualTaskRead('yang tadi tenggatnya ganti jadi besok',{activeTask:'verified-task'})).toBeNull()
})

it('resolves a task label prefix within the explicit owner without overriding a literal exact title',()=>{
 expect(resolveTask({kind:'propose',target:'tugas pertama',pic:'Audrey',data:{}},candidates,{}).candidate?.id).toBe('b')
 const literal=[...candidates,{id:'literal',title:'tugas pertama',pic:'Nata',status:'To do'}]
 expect(resolveTask({kind:'propose',target:'tugas pertama',pic:'Nata',data:{}},literal,{}).candidate?.id).toBe('literal')
})
it('drops an invented reassignment reason and retains the user-provided reason',()=>{
 const plan={kind:'propose' as const,operation:'task_reassign',data:{pic:'Nata',alasan:'permintaan reassign'}}
 expect(groundAgentFields(plan,'ganti PIC tugas pertama Audrey ke Nata',{}).data).toEqual({pic:'Nata'})
 expect(groundAgentFields({...plan,data:{pic:'Nata',alasan:'pembagian tim'}},'karena pembagian tim',{}).data?.alasan).toBe('pembagian tim')
})
