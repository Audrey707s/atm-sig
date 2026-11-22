import {afterEach,beforeEach,expect,it,vi} from 'vitest'
vi.mock('server-only',()=>({}))
const m=vi.hoisted(()=>({read:vi.fn(),queue:vi.fn(),planner:vi.fn(),current:vi.fn(),recheck:vi.fn()}))
vi.mock('./service',()=>({assistantStore:()=>({from:()=>({select:()=>({eq:()=>({abortSignal:()=>({maybeSingle:()=>m.read()})})})})})}))
vi.mock('./evaluation-jobs',()=>({processEvaluationQueue:m.queue,evaluationRevision:()=> 'b'.repeat(40)}))
vi.mock('./evaluation-baseline/agent-model',()=>({modelPlan:m.planner}))
vi.mock('./evaluation-recheck-v1/agent-model',()=>({modelPlan:m.recheck}))
vi.mock('./agent-model',()=>({modelPlan:m.current}))
import {assessPlan} from './evaluation'
import recheckSource from './evaluation-recheck-v1/source.json'
import {processBoundEvaluation} from './evaluation-bound-worker'
afterEach(()=>{vi.useRealTimers();vi.unstubAllEnvs()})
const id='11111111-1111-4111-8111-111111111111',revision='c575e3496a7a7920f4cf33bbda79f0ea321b0fb1'
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-20T12:00:00Z'));vi.stubEnv('ATM_EVALUATION_FIX_RUN_ID','');vi.stubEnv('ATM_EVALUATION_RECHECK_RUN_ID','');vi.stubEnv('ATM_EVALUATION_RUN_ID',id);m.read.mockResolvedValue({data:{status:'queued',revision},error:null});m.queue.mockResolvedValue({processed:1})})
it('runs only the configured synthetic run with the original planner',async()=>{
 expect(await processBoundEvaluation()).toEqual({processed:1})
 expect(m.queue).toHaveBeenCalledWith({runId:id,revision,planner:m.planner,assessor:assessPlan})
})
it.each(['completed','completed_with_errors','canceled','paused'])('makes no model calls after the run is %s',async status=>{
 m.read.mockResolvedValueOnce({data:{status,revision},error:null})
 expect(await processBoundEvaluation()).toMatchObject({processed:0,status});expect(m.queue).not.toHaveBeenCalled()
})
it('rejects a different planner revision rather than mixing results',async()=>{
 m.read.mockResolvedValueOnce({data:{status:'queued',revision:'a'.repeat(40)},error:null})
 await expect(processBoundEvaluation()).rejects.toThrow('binding unavailable');expect(m.queue).not.toHaveBeenCalled()
})
it('requires a valid explicit run binding',async()=>{
 vi.stubEnv('ATM_EVALUATION_RUN_ID','');await expect(processBoundEvaluation()).rejects.toThrow('binding unavailable');expect(m.read).not.toHaveBeenCalled()
})

it('uses a separate current-revision run on alternating minutes',async()=>{
 const recheck='22222222-2222-4222-8222-222222222222'
 vi.stubEnv('ATM_EVALUATION_RECHECK_RUN_ID',recheck)
 m.read.mockResolvedValueOnce({data:{status:'queued',revision:recheckSource.revision},error:null})
 await processBoundEvaluation()
 expect(m.queue).toHaveBeenCalledWith({runId:recheck,revision:recheckSource.revision,planner:m.recheck,assessor:assessPlan})
 vi.setSystemTime(new Date('2026-11-20T12:01:00Z'))
 await processBoundEvaluation()
 expect(m.queue).toHaveBeenLastCalledWith({runId:id,revision,planner:m.planner,assessor:assessPlan})
})
it('rejects a recheck from another deployed revision instead of mixing results',async()=>{
 vi.stubEnv('ATM_EVALUATION_RECHECK_RUN_ID','22222222-2222-4222-8222-222222222222')
 await expect(processBoundEvaluation()).rejects.toThrow('binding unavailable')
 expect(m.queue).not.toHaveBeenCalled()
})

it('resumes an explicitly bound fix run using its stored semantic revision after unrelated deployment commits',async()=>{
 vi.stubEnv('ATM_EVALUATION_FIX_RUN_ID','33333333-3333-4333-8333-333333333333')
 m.read.mockResolvedValueOnce({data:{status:'queued',revision:'c'.repeat(40)},error:null})
 await processBoundEvaluation()
 expect(m.queue).toHaveBeenCalledWith({runId:'33333333-3333-4333-8333-333333333333',revision:'c'.repeat(40),planner:m.current})
})
it('binds the new fix run to the current planner without rewriting either previous run',async()=>{
 vi.stubEnv('ATM_EVALUATION_FIX_RUN_ID','33333333-3333-4333-8333-333333333333')
 vi.setSystemTime(new Date('2026-11-20T12:02:00Z'))
 m.read.mockResolvedValueOnce({data:{status:'queued',revision:'b'.repeat(40)},error:null})
 await processBoundEvaluation()
 expect(m.queue).toHaveBeenCalledWith({runId:'33333333-3333-4333-8333-333333333333',revision:'b'.repeat(40),planner:m.current})
})
