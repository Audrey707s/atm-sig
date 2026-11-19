import {beforeEach,expect,it,vi} from 'vitest'
vi.mock('server-only',()=>({}))
const m=vi.hoisted(()=>({rpc:vi.fn(),plan:vi.fn()}))
vi.mock('./service',()=>({assistantStore:()=>({rpc:(...args:unknown[])=>({abortSignal:()=>m.rpc(...args)})})}))
vi.mock('./agent-model',()=>({modelPlan:m.plan}))
import {processEvaluationQueue,evaluationState} from './evaluation-jobs'
beforeEach(()=>{
 vi.stubEnv('VERCEL_GIT_COMMIT_SHA','a'.repeat(40))
 let claimed=false
 m.rpc.mockImplementation(async name=>({data:name==='wa_operation_catalog'?{}:name==='atm_eval_claim'?(claimed?null:(claimed=true,{run:'run-id',caseId:'01-R1',lease:'lease',attempt:1})):true,error:null}))
 m.plan.mockResolvedValue({plan:{steps:[{kind:'read',entity:'tasks',pic:'Nata',mode:'list'}]},model:'fixture-model',usage:{input:10,output:10}})
})
it('persists the real planning result and never invokes a business action executor',async()=>{
 expect((await processEvaluationQueue()).processed).toBe(1)
 expect(m.rpc).toHaveBeenCalledWith('atm_eval_finish',expect.objectContaining({p_case:'01-R1',p_retry:false,p_result:expect.objectContaining({status:'PASS'})}))
 expect(m.rpc.mock.calls.map(c=>c[0])).not.toContain('atm_ai_turn')
})
it('schedules a provider quota retry with its retry-after delay',async()=>{
 m.plan.mockRejectedValueOnce({name:'AI_APICallError',statusCode:429,responseHeaders:{'retry-after':'120'}})
 await processEvaluationQueue()
 expect(m.rpc).toHaveBeenCalledWith('atm_eval_finish',expect.objectContaining({p_retry:true,p_delay:120,p_result:expect.objectContaining({status:'RETRY',errorKind:'quota'})}))
})
it('records schema failures as FAIL and does not stop the queue with an HTTP error',async()=>{
 m.plan.mockRejectedValueOnce(new Error('Operation denied'))
 await processEvaluationQueue()
 expect(m.rpc).toHaveBeenCalledWith('atm_eval_finish',expect.objectContaining({p_retry:false,p_result:expect.objectContaining({status:'FAIL'})}))
})
it('returns no false saved count when a lease was superseded',async()=>{
 m.rpc.mockImplementationOnce(async()=>({data:{},error:null})).mockImplementationOnce(async()=>({data:{run:'r',caseId:'01-R1',lease:'old',attempt:1},error:null})).mockImplementationOnce(async()=>({data:false,error:null}))
 expect((await processEvaluationQueue()).processed).toBe(0)
})
it('derives the fixed manifest and revision on the server',async()=>{
 await evaluationState('verified-user','start')
 expect(m.rpc).toHaveBeenCalledWith('atm_eval_manage',expect.objectContaining({p_actor:'verified-user',p_cases:expect.arrayContaining(['01-R1','20-R6']),p_revision:'a'.repeat(40)}))
})

it('pauses non-retryable provider configuration errors instead of spending repeated attempts',async()=>{
 m.plan.mockRejectedValueOnce({name:'AI_APICallError',statusCode:401})
 await processEvaluationQueue()
 expect(m.rpc).toHaveBeenCalledWith('atm_eval_finish',expect.objectContaining({p_retry:false,p_result:expect.objectContaining({status:'ERROR',errorKind:'configuration'})}))
})

it('records a model tool-schema error once rather than retrying it as a provider outage',async()=>{
 m.plan.mockRejectedValueOnce({name:'AI_InvalidToolInputError',message:'invalid untrusted model text'})
 await processEvaluationQueue()
 expect(m.rpc).toHaveBeenCalledWith('atm_eval_finish',expect.objectContaining({p_retry:false,p_result:expect.objectContaining({status:'FAIL',errorKind:'validation',validationCode:'AI_InvalidToolInputError'})}))
})
