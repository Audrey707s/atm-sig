import {beforeEach,expect,it,vi} from 'vitest'
const work=vi.hoisted(()=>vi.fn())
vi.mock('@/lib/ai/evaluation-jobs',()=>({processEvaluationQueue:work}))
import {POST} from '../../app/api/cron/agent-evaluation/route'
beforeEach(()=>{vi.stubEnv('VERCEL_ENV','preview');vi.stubEnv('ATM_AGENT_V2','on');vi.stubEnv('ATM_EVALUATION_WORKER_SECRET','private-worker-test');work.mockResolvedValue({processed:1})})
const request=(token?:string)=>new Request('https://preview.test/api/cron/agent-evaluation',{method:'POST',headers:token?{authorization:'Bearer '+token}:{}})
it('rejects cookies or a wrong bearer instead of exposing the worker',async()=>{expect((await POST(request())).status).toBe(401);expect((await POST(request('wrong'))).status).toBe(401);expect(work).not.toHaveBeenCalled()})
it('accepts only the configured worker credential',async()=>{expect((await POST(request('private-worker-test'))).status).toBe(200);expect(work).toHaveBeenCalledOnce()})
it('never exposes this preview worker in production',async()=>{vi.stubEnv('VERCEL_ENV','production');expect((await POST(request('private-worker-test'))).status).toBe(404);expect(work).not.toHaveBeenCalled()})
