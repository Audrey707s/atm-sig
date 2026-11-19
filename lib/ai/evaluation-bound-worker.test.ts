import {beforeEach,expect,it,vi} from 'vitest'
vi.mock('server-only',()=>({}))
const m=vi.hoisted(()=>({read:vi.fn(),queue:vi.fn(),planner:vi.fn()}))
vi.mock('./service',()=>({assistantStore:()=>({from:()=>({select:()=>({eq:()=>({abortSignal:()=>({maybeSingle:()=>m.read()})})})})})}))
vi.mock('./evaluation-jobs',()=>({processEvaluationQueue:m.queue}))
vi.mock('./evaluation-baseline/agent-model',()=>({modelPlan:m.planner}))
import {processBoundEvaluation} from './evaluation-bound-worker'
const id='11111111-1111-4111-8111-111111111111',revision='c575e3496a7a7920f4cf33bbda79f0ea321b0fb1'
beforeEach(()=>{vi.stubEnv('ATM_EVALUATION_RUN_ID',id);m.read.mockResolvedValue({data:{status:'queued',revision},error:null});m.queue.mockResolvedValue({processed:1})})
it('runs only the configured synthetic run with the original planner',async()=>{
 expect(await processBoundEvaluation()).toEqual({processed:1})
 expect(m.queue).toHaveBeenCalledWith({runId:id,revision,planner:m.planner})
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
