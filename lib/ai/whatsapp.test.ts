import {beforeEach,describe,it,expect,vi} from 'vitest'
vi.mock('server-only',()=>({}))
const mocks=vi.hoisted(()=>({request:vi.fn(),remove:vi.fn(),tables:{} as Record<string,unknown>}))
vi.mock('./service',()=>({requestAssistant:mocks.request,assistantStore:()=>({from:(name:string)=>{
 const chain={select:()=>chain,eq:()=>chain,single:async()=>({data:mocks.tables[name]}),maybeSingle:async()=>({data:mocks.tables[name]}),delete:()=>{mocks.remove(name);return chain},then:(resolve:(x:unknown)=>unknown)=>Promise.resolve(resolve({error:null}))};return chain
}})}))
import {receiveAssistantWhatsApp} from './whatsapp'
import {parseFonnteIncoming} from '@/lib/whatsapp/incoming'
const linkedAt='2026-11-16T00:00:00.000Z'
function incoming(message:string){return parseFonnteIncoming({device:'bot',sender:'6281111111111',timestamp:Date.now(),message},'bot')!}
describe('WhatsApp conversational routing',()=>{
 beforeEach(()=>{vi.stubEnv('ATM_AI_ENABLED','true');mocks.tables={whatsapp_links:{user_id:'actor',linked_at:linkedAt,notifications_enabled:true},users:{status:'aktif',role:{level:2}}};mocks.remove.mockClear();mocks.request.mockClear()})
 it.each(['tampilkan daftar tugas saya','lihat tugas rekonsiliasi','buat tugas rekonsiliasi mulai besok 08:00 tenggat lusa 16:00','update progress rekonsiliasi jadi 70%'])('passes everyday requests, including times with colons: %s',async message=>{
  expect(await receiveAssistantWhatsApp(incoming(message))).toBe(true);expect(mocks.request).toHaveBeenCalledWith(expect.objectContaining({actor:'actor',level:2}),message)
 })
 it('routes server-held candidate choices and list continuation to the AI session',async()=>{
  mocks.tables.atm_ai_sessions={phone:'6281111111111',linked_at:linkedAt,expires_at:new Date(Date.now()+60000).toISOString(),payload:{choices:[{id:'one'},{id:'two'}]}}
  expect(await receiveAssistantWhatsApp(incoming('2'))).toBe(true)
  mocks.tables.atm_ai_sessions={phone:'6281111111111',linked_at:linkedAt,expires_at:new Date(Date.now()+60000).toISOString(),payload:{lastRead:{entity:'tasks',page:1}}}
  expect(await receiveAssistantWhatsApp(incoming('lanjut'))).toBe(true)
 })
 it('preserves explicit STOP, linking, and native form answers',async()=>{
  expect(await receiveAssistantWhatsApp(incoming('STOP'))).toBe(false)
  expect(await receiveAssistantWhatsApp(incoming('2'))).toBe(false)
  mocks.tables.whatsapp_action_sessions={state:{kind:'form'},expires_at:new Date(Date.now()+60000).toISOString()}
  expect(await receiveAssistantWhatsApp(incoming('besok jam 8 pagi'))).toBe(false)
  expect(mocks.request).not.toHaveBeenCalled()
 })
 it('never uses a stale phone generation for a numbered choice',async()=>{
  mocks.tables.atm_ai_sessions={phone:'6281111111111',linked_at:'2025-01-01',expires_at:new Date(Date.now()+60000).toISOString(),payload:{choices:[{id:'one'}]}}
  expect(await receiveAssistantWhatsApp(incoming('1'))).toBe(false);expect(mocks.request).not.toHaveBeenCalled()
 })
})
