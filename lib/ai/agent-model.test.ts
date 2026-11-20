import {it,expect,vi,afterEach} from 'vitest'
vi.mock('server-only',()=>({}))
const mock=vi.hoisted(()=>({generate:vi.fn()}))
vi.mock('ai',()=>({generateText:mock.generate,jsonSchema:(x:unknown)=>x,tool:(x:unknown)=>x}))
vi.mock('@ai-sdk/groq',()=>({createGroq:()=>()=>({})}))
import {modelPlan} from './agent-model'
afterEach(()=>{vi.unstubAllEnvs();vi.clearAllMocks()})
it.each([
 ['tolong tampilkan yang perlu saya tinjau','review'],
 ['ringkasin kerjaan saya dong','report'],
 ['apa aja tenggat minggu ini?','calendar'],
])('passes a specialized read through the shared planner: %s',async(message,mode)=>{
 vi.stubEnv('ATM_AI_FREE_PLAN_CONFIRMED','true');vi.stubEnv('GROQ_API_KEY','test-only')
 mock.generate.mockResolvedValue({toolCalls:[{toolName:'plan_atm',input:{steps:[{kind:'read',entity:'tasks',mode,pic:''}]}}],usage:{inputTokens:10,outputTokens:5}})
 for(const role of [1,2,3,4,5,6]){
  expect((await modelPlan(message,role,{}, {},[])).plan.steps[0]).toMatchObject({kind:'read',mode})
 }
 const request=mock.generate.mock.calls[0][0]
 expect(request.prompt).toBe(message)
 expect(request.system).toContain(message)
 expect(request.system).toContain('Reading a review queue does not grant permission to approve')
})
it('normalizes the observed Indonesian status at the model boundary',async()=>{
 vi.stubEnv('ATM_AI_FREE_PLAN_CONFIRMED','true');vi.stubEnv('GROQ_API_KEY','test-only')
 mock.generate.mockResolvedValue({toolCalls:[{toolName:'plan_atm',input:{steps:[{kind:'propose',operation:'task_status',target:'Ada deh',pic:'Sevtuari',data:{status:'Terhambat'}}]}}],usage:{}})
 const catalog={task_status:{label:'Status',entity:'tasks',minimumRole:2,fields:{status:'status'},required:['status'],task:true}}
 expect((await modelPlan('ubah status task Ada deh milik Sevtuari menjadi Terhambat',2,catalog,{},[])).plan.steps[0]).toMatchObject({target:'Ada deh',pic:'Sevtuari',data:{status:'Blocked'}})
 await expect(modelPlan('ubah status task Ada deh milik Sevtuari menjadi Terhambat',1,catalog,{},[])).rejects.toThrow('Operation denied')
})
