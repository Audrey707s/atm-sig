import { beforeEach,describe,it,expect,vi } from 'vitest'
const {getUser,single,requestAssistant}=vi.hoisted(()=>({getUser:vi.fn(),single:vi.fn(),requestAssistant:vi.fn()}))
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({auth:{getUser},from:()=>({select:()=>({eq:()=>({single})})})})}))
vi.mock('@/lib/ai/service',()=>({requestAssistant}))
import {POST} from '../../app/api/assistant/route'
function req(body:unknown,origin='https://atm.test'){return new Request('https://atm.test/api/assistant',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)})}
describe('AI route auth and identity',()=>{
 beforeEach(()=>{vi.stubEnv('ATM_AI_ENABLED','true');getUser.mockResolvedValue({data:{user:{id:'actual-user'}}});single.mockResolvedValue({data:{status:'aktif',role:{level:2}}});requestAssistant.mockResolvedValue({ok:true,message:'OK'})})
 it('rejects cross-origin requests before using cookies',async()=>{expect((await POST(req({message:'x'},'https://evil.test'))).status).toBe(403);expect(getUser).not.toHaveBeenCalled()})
 it('rejects missing auth, inactive profiles and malformed bodies',async()=>{
  getUser.mockResolvedValueOnce({data:{user:null}});expect((await POST(req({message:'x'}))).status).toBe(401)
  single.mockResolvedValueOnce({data:{status:'nonaktif',role:{level:6}}});expect((await POST(req({message:'x'}))).status).toBe(403)
  expect((await POST(req({message:'x'.repeat(3001)}))).status).toBe(400)
 })
 it('derives actor/role from the verified session and ignores spoofed identity',async()=>{
  expect((await POST(req({message:'lihat tugas saya',actor:'admin',level:6}))).status).toBe(200)
  expect(requestAssistant).toHaveBeenCalledWith({actor:'actual-user',level:2,channel:'web'},'lihat tugas saya',undefined)
 })
 it('passes confirmation token without allowing a body-selected tool execution',async()=>{
  await POST(req({message:'YA',token:'preview-token',operation:'delete'}))
  expect(requestAssistant).toHaveBeenCalledWith(expect.anything(),'YA','preview-token')
 })
})
