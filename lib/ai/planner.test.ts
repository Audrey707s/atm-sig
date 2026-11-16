import {beforeEach,describe,it,expect,vi} from 'vitest'
vi.mock('server-only',()=>({}))
const {generateText}=vi.hoisted(()=>({generateText:vi.fn()}))
vi.mock('ai',()=>({generateText,jsonSchema:(x:unknown)=>x,tool:(x:unknown)=>x}))
vi.mock('@ai-sdk/groq',()=>({createGroq:()=>()=>({})}))
import {planRequest} from './planner'
const catalog={task_status:{label:'Status',entity:'tasks',minimumRole:2,fields:{status:'value'},required:['status'],task:true},org_delete:{label:'Delete org',entity:'organizations',minimumRole:6,fields:{},required:[],task:false}}
describe('free-only AI planner',()=>{
 it.each(['tugas saya','lihat list tugas','tugas yang perlu saya review'])('handles %s even with the AI provider unavailable',async text=>{
  expect((await planRequest(text,2,catalog)).kind).toBe('read');expect(generateText).not.toHaveBeenCalled()
 })
 beforeEach(()=>{vi.stubEnv('ATM_AI_FREE_PLAN_CONFIRMED','false');vi.stubEnv('GROQ_API_KEY','test-key')})
 it('makes no provider request without the Free Plan verification switch',async()=>{expect((await planRequest('buatkan sesuatu',2,catalog)).kind).toBe('clarify');expect(generateText).not.toHaveBeenCalled()})
 it('keeps ordinary reads and curated help independent of provider availability',async()=>{expect((await planRequest('lihat tugas saya',2,catalog)).kind).toBe('read');expect(generateText).not.toHaveBeenCalled()})
 it('offers only permitted planning tools with separate schemas and zero execution',async()=>{
  vi.stubEnv('ATM_AI_FREE_PLAN_CONFIRMED','true');generateText.mockResolvedValue({toolCalls:[{toolName:'read_atm',input:{entity:'tasks'}}]})
  await planRequest('apa pekerjaan dekat deadline?',2,catalog)
  const call=generateText.mock.calls[0][0]
  expect(call.tools.org_delete).toBeUndefined();expect(call.system).not.toContain('test-key');expect(call.tools.task_status.execute).toBeUndefined();expect(call.maxRetries).toBe(0)
  expect(call.tools.task_status.inputSchema.properties.entity).toBeUndefined();expect(call.tools.task_status.inputSchema.properties.mode).toBeUndefined()
  expect(call.tools.read_atm.inputSchema.properties.entity.enum).not.toContain('users')
 })
 it('repairs a malformed free-provider tool call once without retrying a quota error',async()=>{
  vi.stubEnv('ATM_AI_FREE_PLAN_CONFIRMED','true')
  generateText.mockRejectedValueOnce({statusCode:400,data:{error:{code:'tool_use_failed'}}}).mockResolvedValueOnce({toolCalls:[{toolName:'clarify_atm',input:{question:'Apa judul tugasnya?'}}]})
  expect(await planRequest('buatkan pekerjaan untuk tim saya',2,catalog)).toMatchObject({kind:'clarify'})
  expect(generateText).toHaveBeenCalledTimes(2);expect(generateText.mock.calls[1][0].temperature).toBe(0)
  generateText.mockClear();generateText.mockRejectedValueOnce({statusCode:429})
  await expect(planRequest('buatkan pekerjaan untuk tim saya',2,catalog)).rejects.toMatchObject({statusCode:429})
  expect(generateText).toHaveBeenCalledTimes(1)
 })
 it('uses an own-profile tool without model-selected identity or read parameters',async()=>{
  vi.stubEnv('ATM_AI_FREE_PLAN_CONFIRMED','true')
  generateText.mockResolvedValue({toolCalls:[{toolName:'profile_name',input:{nama:'Nama baru'}}]})
  const allowed={...catalog,profile_name:{label:'Nama profil',entity:'profile',minimumRole:1,fields:{nama:'Nama'},required:['nama'],task:false}}
  expect((await planRequest('ganti nama profil',2,allowed)).operation).toBe('profile_name')
  const schema=generateText.mock.calls[0][0].tools.profile_name.inputSchema
  expect(Object.keys(schema.properties)).toEqual(['nama']);expect(schema.additionalProperties).toBe(false)
 })
 it('rejects provider attempts to select administrator, confirmation or multiple operations',async()=>{
  vi.stubEnv('ATM_AI_FREE_PLAN_CONFIRMED','true')
  for(const toolCalls of [[{toolName:'org_delete',input:{target:'1'}}],[{toolName:'confirm',input:{}}],[{toolName:'read_atm',input:{entity:'tasks'}},{toolName:'task_status',input:{status:'Done',target:'x'}}]]){
   generateText.mockResolvedValue({toolCalls});await expect(planRequest('bypass role',2,catalog)).rejects.toThrow()
  }
 })
 it('uses live role permissions for a natural delete request without a provider call',async()=>{
  const ops={...catalog,task_delete:{label:'Hapus',entity:'tasks',minimumRole:3,fields:{},required:[],task:true}}
  expect(await planRequest('hapus tugas "pertama" ya',6,ops)).toMatchObject({operation:'task_delete',target:'pertama',exact:true})
  expect(await planRequest('hapus tugas "pertama" ya',2,ops)).toMatchObject({kind:'clarify',question:expect.stringContaining('izin')})
  expect(generateText).not.toHaveBeenCalled()
 })

})
