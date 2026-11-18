import {beforeEach,expect,it,vi} from 'vitest'
vi.mock('server-only',()=>({}))
const m=vi.hoisted(()=>({user:vi.fn(),profile:vi.fn(),plan:vi.fn(),store:vi.fn()}))
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({auth:{getUser:m.user},from:()=>({select:()=>({eq:()=>({single:m.profile})})})})}))
vi.mock('@/lib/ai/service',()=>({assistantStore:m.store}))
vi.mock('@/lib/ai/agent-model',()=>({modelConfigured:()=>true,modelPlan:m.plan}))
import {POST} from '../../app/api/assistant/evaluation/route'
const request=(body:unknown,origin='https://atm.test')=>new Request('https://atm.test/api/assistant/evaluation',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify(body)})
beforeEach(()=>{vi.stubEnv('VERCEL_ENV','preview');vi.stubEnv('ATM_AGENT_V2','on');m.user.mockResolvedValue({data:{user:{id:'actual-user'}}});m.profile.mockResolvedValue({data:{status:'aktif',role:{level:5}}})})
it('never exposes evaluation in production even with the feature flag on',async()=>{vi.stubEnv('VERCEL_ENV','production');expect((await POST(request({caseId:'01-R1'}))).status).toBe(404);expect(m.plan).not.toHaveBeenCalled()})
it('rejects cross-site and lower-role requests before provider calls',async()=>{
 expect((await POST(request({caseId:'01-R1'},'https://evil.test'))).status).toBe(403)
 m.profile.mockResolvedValueOnce({data:{status:'aktif',role:{level:2}}});expect((await POST(request({caseId:'01-R1'}))).status).toBe(403)
 expect(m.plan).not.toHaveBeenCalled()
})
it('only accepts a fixed synthetic case ID, not arbitrary prompts or tool execution',async()=>{
 expect((await POST(request({caseId:'not-found',actor:'admin',operation:'task_delete'}))).status).toBe(400)
 expect(m.store).not.toHaveBeenCalled();expect(m.plan).not.toHaveBeenCalled()
})
