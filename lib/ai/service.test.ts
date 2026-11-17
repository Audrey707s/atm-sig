import {beforeEach,it,expect,vi} from 'vitest'
vi.mock('server-only',()=>({}))
const mocks=vi.hoisted(()=>({stored:null as unknown,rpc:vi.fn()}))
vi.mock('@supabase/supabase-js',()=>({createClient:()=>({from:()=>{const query={select:()=>query,eq:()=>query,maybeSingle:async()=>({data:mocks.stored,error:null})};return query},rpc:mocks.rpc})}))
import {requestAssistant} from './service'
beforeEach(()=>{
 vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','https://example.test');vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY','test-only')
 mocks.rpc.mockReset();mocks.stored={operation:'task_status',expires_at:new Date(Date.now()+60000).toISOString(),conversation_id:null,payload:{choices:[{id:'one'},{id:'two'}],data:{}}}
 mocks.rpc.mockImplementation(async(name)=>({data:name==='wa_operation_catalog'?{task_status:{label:'Status',entity:'tasks',minimumRole:2,fields:{status:'value'},required:['status'],task:true}}:{ok:true,message:'Response'},error:null}))
})
it('keeps a status intent when clarifying an owner-first title after ambiguous results',async()=>{
 await requestAssistant({actor:'actor',level:6,channel:'web'},'mengubah tugas Sevtuari dengan nama "Ada deh"')
 expect(mocks.rpc).toHaveBeenLastCalledWith('atm_ai_turn',expect.objectContaining({p_kind:'propose',p_payload:expect.objectContaining({operation:'task_status',target:'Ada deh',pic:'Sevtuari',exact:true})}))
})
it('keeps numeric responses on the server-held selection path',async()=>{
 await requestAssistant({actor:'actor',level:6,channel:'web'},'2')
 expect(mocks.rpc).toHaveBeenLastCalledWith('atm_ai_turn',expect.objectContaining({p_kind:'select',p_payload:{choice:2}}))
})
it('accepts a bare Indonesian status as the missing field',async()=>{
 mocks.stored={operation:'task_status',target:'chosen-id',expires_at:new Date(Date.now()+60000).toISOString(),conversation_id:null,payload:{guided:true,field:'status',data:{}}}
 await requestAssistant({actor:'actor',level:6,channel:'web'},'Terhambat')
 expect(mocks.rpc).toHaveBeenLastCalledWith('atm_ai_turn',expect.objectContaining({p_kind:'propose',p_payload:expect.objectContaining({operation:'task_status',target:'chosen-id',data:{status:'Blocked'}})}))
})

it('dispatches the reported passive priority sentence with separate title, PIC and field',async()=>{
 mocks.stored=null
 mocks.rpc.mockImplementation(async name=>({data:name==='wa_operation_catalog'?{task_update:{label:'Ubah',entity:'tasks',minimumRole:3,fields:{prioritas:'enum'},required:[],task:true}}:{ok:true,message:'Response'},error:null}))
 await requestAssistant({actor:'actor',level:6,channel:'web'},'tugas "mengerjakan paper" milik PIC nata tolong diubah prioritasnya menjadi tinggi')
 expect(mocks.rpc).toHaveBeenLastCalledWith('atm_ai_turn',expect.objectContaining({p_kind:'propose',p_payload:expect.objectContaining({operation:'task_update',target:'mengerjakan paper',pic:'nata',field:'prioritas',data:{prioritas:'tinggi'}})}))
})
