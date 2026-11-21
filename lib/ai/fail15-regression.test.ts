import {it,expect,vi,afterEach} from 'vitest'
vi.mock('server-only',()=>({}))
const m=vi.hoisted(()=>({generate:vi.fn()}))
vi.mock('ai',()=>({generateText:m.generate,jsonSchema:(s:unknown)=>s,tool:(s:unknown)=>s}))
vi.mock('@ai-sdk/groq',()=>({createGroq:()=>()=>({})}))
import {modelPlan} from './agent-model'
import {assessCurrentPlan} from './evaluation-v2'
import fixtures from '@/docs/agent-v2/conversation-uat.json'
import type {EvaluationCase} from './evaluation'
import type {Operation} from './contracts'
const ids=['02-R1','02-R2','02-R6','03-R1','03-R4','04-R1','05-R1','05-R2','06-R1','06-R2','07-R1','07-R2','08-R1','08-R3','08-R4']
const catalog:Record<string,Operation>={
 task_update:{label:'Ubah',entity:'tasks',minimumRole:3,fields:{prioritas:'value'},required:[],task:true},
 task_progress:{label:'Progres',entity:'tasks',minimumRole:2,fields:{progres:'value'},required:['progres'],task:true},
 task_reassign:{label:'PIC',entity:'tasks',minimumRole:3,fields:{pic:'value',alasan:'value'},required:['pic','alasan'],task:true},
 task_comment:{label:'Komentar',entity:'comments',minimumRole:2,fields:{komentar:'value'},required:['komentar'],task:true},
 template_create:{label:'Berulang',entity:'templates',minimumRole:2,fields:{pic:'value',judul:'value',nama:'value'},required:['judul','nama'],task:false},
}
afterEach(()=>{vi.clearAllMocks();vi.unstubAllEnvs()})
it.each(ids)('regresses observed FAIL %s with unchanged role limits and explicit fields',async id=>{
 const test=fixtures.find(c=>c.id===id)! as EvaluationCase
 vi.stubEnv('ATM_AI_FREE_PLAN_CONFIRMED','true');vi.stubEnv('GROQ_API_KEY','test-only')
 const step=id==='02-R6'?{kind:'propose',operation:'task_update',target:'mengerjakan paper',pic:'Nata',field:'prioritas',data:{}}:id==='03-R4'?{kind:'propose',operation:'task_update',target:'mengerjakan paper',field:'prioritas',data:{}}:{kind:'propose',operation:'template_create',data:{pic:'Audrey'}}
 m.generate.mockResolvedValue({toolCalls:[{toolName:'plan_atm',input:{steps:[step]}}],usage:{}})
 const result=await modelPlan(test.messages.join('\n'),test.role,catalog,test.memory,[])
 expect(assessCurrentPlan(test,result.plan,catalog).status).toBe('PASS')
 expect(m.generate).not.toHaveBeenCalled()
})

it.each(['08-R5','09-R1','10-R1','10-R3','10-R6','11-R2','11-R4','12-R1'])('resolves later observed FAIL %s without any provider quota',async id=>{
 const test=fixtures.find(c=>c.id===id)! as EvaluationCase
 const fullCatalog={...catalog,task_delete:{label:'Hapus',entity:'tasks',minimumRole:3,fields:{},required:[],task:true},task_status:{label:'Status',entity:'tasks',minimumRole:2,fields:{status:'value'},required:['status'],task:true}}
 vi.stubEnv('ATM_AI_FREE_PLAN_CONFIRMED','false');vi.stubEnv('GROQ_API_KEY','')
 const result=await modelPlan(test.messages.join('\n'),test.role,fullCatalog,test.memory,[])
 expect(assessCurrentPlan(test,result.plan,fullCatalog).status).toBe('PASS')
 expect(m.generate).not.toHaveBeenCalled()
})
