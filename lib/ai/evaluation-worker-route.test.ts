import {beforeEach,expect,it,vi} from 'vitest'
const {work,bound}=vi.hoisted(()=>({work:vi.fn(),bound:vi.fn()}))
vi.mock('@/lib/ai/evaluation-bound-worker',()=>({processBoundEvaluation:bound}))
vi.mock('@/lib/ai/evaluation-jobs',()=>({processEvaluationQueue:work}))
import {POST} from '../../app/api/cron/agent-evaluation/route'
beforeEach(()=>{vi.stubEnv('VERCEL_ENV','preview');vi.stubEnv('ATM_AGENT_V2','on');vi.stubEnv('ATM_EVALUATION_WORKER_SECRET','private-worker-test');vi.stubEnv('ATM_EVALUATION_RUN_ID','');work.mockResolvedValue({processed:1});bound.mockResolvedValue({processed:1})})
const request=(token?:string)=>new Request('https://preview.test/api/cron/agent-evaluation',{method:'POST',headers:token?{authorization:'Bearer '+token}:{}})
it('rejects cookies or a wrong bearer instead of exposing the worker',async()=>{expect((await POST(request())).status).toBe(401);expect((await POST(request('wrong'))).status).toBe(401);expect(work).not.toHaveBeenCalled()})
it('accepts only the configured worker credential',async()=>{expect((await POST(request('private-worker-test'))).status).toBe(200);expect(work).toHaveBeenCalledOnce()})
it('never exposes this preview worker in production',async()=>{vi.stubEnv('VERCEL_ENV','production');expect((await POST(request('private-worker-test'))).status).toBe(404);expect(work).not.toHaveBeenCalled()})

it('uses the bound synthetic worker on production only after bearer authentication',async()=>{
 vi.stubEnv('VERCEL_ENV','production');vi.stubEnv('ATM_EVALUATION_RUN_ID','11111111-1111-4111-8111-111111111111')
 expect((await POST(request())).status).toBe(401);expect(bound).not.toHaveBeenCalled()
 expect((await POST(request('private-worker-test'))).status).toBe(200);expect(bound).toHaveBeenCalledOnce();expect(work).not.toHaveBeenCalled()
})
