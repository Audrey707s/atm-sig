import {afterEach,describe,expect,it,vi} from 'vitest'
import {resolveTask,rolloutEnabled,validateAgentPlan,type Candidate} from './agent-policy'
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
