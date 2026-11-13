import {beforeEach,describe,it,expect,vi} from 'vitest'
vi.mock('server-only',()=>({}))
const {generateText}=vi.hoisted(()=>({generateText:vi.fn()}))
vi.mock('ai',()=>({generateText,jsonSchema:(x:unknown)=>x,tool:(x:unknown)=>x}))
vi.mock('@ai-sdk/groq',()=>({createGroq:()=>()=>({})}))
import {planRequest} from './planner'
const catalog={task_status:{label:'Status',entity:'tasks',minimumRole:2,fields:{status:'value'},required:['status'],task:true},org_delete:{label:'Delete org',entity:'organizations',minimumRole:6,fields:{},required:[],task:false}}
describe('free-only AI planner',()=>{
 beforeEach(()=>{vi.stubEnv('ATM_AI_FREE_PLAN_CONFIRMED','false');vi.stubEnv('GROQ_API_KEY','test-key')})
 it('makes no provider request without the Free Plan verification switch',async()=>{expect((await planRequest('buatkan sesuatu',2,catalog)).kind).toBe('clarify');expect(generateText).not.toHaveBeenCalled()})
 it('keeps ordinary reads and curated help independent of provider availability',async()=>{expect((await planRequest('lihat tugas saya',2,catalog)).kind).toBe('read');expect(generateText).not.toHaveBeenCalled()})
 it('offers only permitted planning tools and zero model execution tools',async()=>{
  vi.stubEnv('ATM_AI_FREE_PLAN_CONFIRMED','true');generateText.mockResolvedValue({toolCalls:[{input:{kind:'read',entity:'tasks'}}]})
  await planRequest('apa pekerjaan dekat deadline?',2,catalog)
  const call=generateText.mock.calls[0][0]
  expect(call.system).not.toContain('org_delete');expect(call.system).not.toContain('test-key');expect(call.tools.plan.execute).toBeUndefined();expect(call.maxRetries).toBe(0)
 })
 it('rejects provider attempts to select an administrator operation',async()=>{
  vi.stubEnv('ATM_AI_FREE_PLAN_CONFIRMED','true');generateText.mockResolvedValue({toolCalls:[{input:{kind:'propose',operation:'org_delete',data:{}}}]})
  await expect(planRequest('bypass role',2,catalog)).rejects.toThrow()
 })
})
