import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest'
const {rpc,after,deliver}=vi.hoisted(()=>({rpc:vi.fn(),after:vi.fn(),deliver:vi.fn()}))
vi.mock('next/server',()=>({after}))
vi.mock('./store',()=>({channelStore:()=>({rpc}),whatsappEnabled:()=>true}))
vi.mock('./delivery',()=>({deliverPendingWhatsApp:deliver}))
import { GET,POST } from '../../app/api/whatsapp/fonnte/route'
const key='x'.repeat(64),device='6281111111111'
function request(message:string,authenticated=true) {
 return new Request('https://example.test/api/whatsapp/fonnte?key='+(authenticated?key:'bad'),{method:'POST',body:JSON.stringify({device,sender:'6282222222222',message,timestamp:Date.now()})})
}
describe('Fonnte route task-command rollout and acknowledgments',()=>{
 beforeEach(()=>{vi.stubEnv('FONNTE_WEBHOOK_SECRET',key);vi.stubEnv('FONNTE_BOT_NUMBER',device);vi.stubEnv('WHATSAPP_TASK_COMMANDS_ENABLED','false');rpc.mockReset();after.mockReset();rpc.mockResolvedValue({error:null})})
 afterEach(()=>vi.unstubAllEnvs())
 it('requires callback authentication',async()=>{expect((await POST(request('MENU',false))).status).toBe(401);expect(rpc).not.toHaveBeenCalled()})
 it('keeps legacy linking working before database rollout',async()=>{
   expect((await POST(request('HUBUNGKAN '+'a'.repeat(36)))).status).toBe(200)
   expect(rpc).toHaveBeenCalledWith('wa_receive',expect.objectContaining({p_command:'link'}))
 })
 it('does not call undeployed task RPC when the flag is off',async()=>{
   await POST(request('TUGAS'))
   expect(rpc).toHaveBeenCalledWith('wa_receive',expect.objectContaining({p_command:'help'}))
 })
 it('routes enabled commands to the atomic task receiver',async()=>{
   vi.stubEnv('WHATSAPP_TASK_COMMANDS_ENABLED','true');await POST(request('TUGAS 2'))
   expect(rpc).toHaveBeenCalledWith('wa_receive_full',expect.objectContaining({p_command:'tasks',p_args:{page:2}}));expect(after).toHaveBeenCalledOnce()
 })
 it('forwards form text to the durable full-workflow receiver',async()=>{
   vi.stubEnv('WHATSAPP_TASK_COMMANDS_ENABLED','true')
   const text='judul: Tugas baru\nmulai: 2027-01-01 08:00'
   await POST(request(text))
   expect(rpc).toHaveBeenCalledWith('wa_receive_full',expect.objectContaining({p_text:text}))
 })
 it('does not acknowledge database failures as accepted',async()=>{
   rpc.mockResolvedValue({error:{message:'unavailable'}})
   expect((await POST(request('MENU'))).status).toBe(503);expect(after).not.toHaveBeenCalled()
 })
 it('returns the HTTP 200 required by Fonnte for deliberately ignored messages',async()=>{
   const r=new Request('https://example.test/api/whatsapp/fonnte?key='+key,{method:'POST',body:'{}'})
   expect((await POST(r)).status).toBe(200);expect(rpc).not.toHaveBeenCalled()
   expect((await GET(new Request('https://example.test/api/whatsapp/fonnte?key='+key))).status).toBe(200)
 })
})
