import {describe,it,expect,vi} from 'vitest'
vi.mock('server-only',()=>({}))
import {planRequest,aiConfigured} from './planner'
const catalog={task_status:{label:'Status',entity:'tasks',minimumRole:2,fields:{status:'value'},required:['status'],task:true},task_delete:{label:'Hapus',entity:'tasks',minimumRole:3,fields:{},required:[],task:true}}
describe('provider-independent planner',()=>{
 it.each([undefined,'','invalid-expired-key'])('never needs a Groq key (%s) or a provider request',async key=>{
  vi.stubEnv('GROQ_API_KEY',key);vi.stubEnv('ATM_AI_FREE_PLAN_CONFIRMED','false')
  const network=vi.fn(()=>{throw new Error('No network allowed')});vi.stubGlobal('fetch',network)
  expect(aiConfigured()).toBe(true)
  for(const level of [1,2,3,4,5,6]){
   expect((await planRequest('lihat tugas saya',level,catalog)).kind).toBe('read')
   expect((await planRequest('kalimat yang belum dikenal',level,catalog)).kind).toBe('clarify')
  }
  expect(network).not.toHaveBeenCalled();vi.unstubAllGlobals()
 })
 it('enforces roles for local mutations and master reads',async()=>{
  expect(await planRequest('hapus tugas "pertama"',6,catalog)).toMatchObject({operation:'task_delete',exact:true})
  expect(await planRequest('hapus tugas pertama',2,catalog)).toMatchObject({kind:'clarify',question:expect.stringContaining('izin')})
  expect(await planRequest('lihat semua pengguna',2,catalog)).toMatchObject({kind:'clarify',question:expect.stringContaining('izin')})
  expect(await planRequest('lihat semua pengguna',6,catalog)).toMatchObject({entity:'users'})
 })
})
